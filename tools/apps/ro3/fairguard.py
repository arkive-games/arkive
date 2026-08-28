"""Run FairGuardProtect.dll's own block-0 key derivation under an emulator.

Ragnarok Online 3 ships its Unity bundles obfuscated. The obfuscation is installed by
``FairGuardProtect.dll``, which ``UnityPlayer.dll`` is forced to load through a rewritten
import directory (the imported symbol ``myfun`` is a ``xor eax,eax; ret`` stub — the import
exists only to get the DLL mapped). FairGuard then hooks Unity's block/file read; the
trampoline at FairGuard RVA ``0x33a30`` is::

    ret = original(a, b, size, buffer, e);      # Unity's own read
    deobfuscate(buffer, min(size, 0x500));      # RVA 0x644d0 -> jmp 0x8502fa
    return ret;

``deobfuscate`` is a 26 KB obfuscated function in the ``.fgtext0`` section. Its *shape* was
recovered by hand and is reimplemented natively in :mod:`.keygen`; what was **not**
recovered algebraically is how the 4-byte RC4 key and the five 4-byte chunk words are
derived from the ciphertext head. That derivation is a chain of data-dependent mixing at
RVA ``0x8516dc..0x851a76`` and is simply *run* here instead.

Running it is safe and offline. The DLL is read from disk and emulated with Unicorn; the
game is never launched, no process is opened, and nothing is written back. One call maps
the image, stubs the ~dozen Win32 APIs the code touches (heap, TLS/FLS, critical sections,
timers) and executes the function against a scratch buffer. Cost is ~2 ms, and
:func:`key_material` is memoised on ``(head32, n)``, of which the shipped tree has far
fewer distinct values than it has sub-files.

Only the 24 bytes :func:`key_material` returns come from the binary. Everything downstream
is native Python and byte-exact — see :mod:`.keygen`.
"""

from __future__ import annotations

import collections
import contextlib
import faulthandler
import functools
import struct
from pathlib import Path


@contextlib.contextmanager
def _quiet_faulthandler():
    """Suppress faulthandler for a block that provokes a *handled* access violation."""
    enabled = faulthandler.is_enabled()
    if enabled:
        faulthandler.disable()
    try:
        yield
    finally:
        if enabled:
            faulthandler.enable()

# ---------------------------------------------------------------- RVAs inside the DLL
DECRYPT = 0x8502FA  #: the deobfuscator itself: (void *buf, size_t len)
RESOLVER = 0xE9E04  #: FairGuard's own GetProcAddress-alike; rdx = the name to resolve
RC4_ENTRY = 0x686F0  #: RC4 stream generator: rcx = dst, edx = length, r8 = 4-byte key
IMPORT_DIR = 0x1496C4  #: the DLL's import directory, walked to plant API stubs

# ---------------------------------------------------------------- emulator address map
STACK, STACK_SIZE = 0x1_0000_0000, 0x100_0000
ARENA, ARENA_SIZE = 0x2_0000_0000, 0x800_0000  # heap handed out by the stubbed allocators
BUF, BUF_SIZE = 0x3_0000_0000, 0x10_0000  # the buffer the deobfuscator works on
TEB = 0x4_0000_0000
STUBS, STUBS_SIZE = 0x5_0000_0000, 0x10_0000
RET_MAGIC = STUBS + 0xF_0000  # a lone `ret`, used as the outermost return address

DLL_NAME = "FairGuardProtect.dll"


class FairGuardError(RuntimeError):
    """The protector's code could not be run, or did not behave as expected."""


def dll_path() -> Path:
    """Where ``FairGuardProtect.dll`` lives, derived from the configured game directory.

    ``RO3_GAME`` points at ``ro3_Data``; the DLL sits beside it in the install root.
    """
    from .env import require_dir

    return require_dir("RO3_GAME").parent / DLL_NAME


class _Image:
    """The DLL's PE headers and section table, parsed straight from the file."""

    def __init__(self, data: bytes):
        self.data = data
        pe = struct.unpack_from("<I", data, 0x3C)[0]
        coff = pe + 4
        n_sections = struct.unpack_from("<H", data, coff + 2)[0]
        opt_size = struct.unpack_from("<H", data, coff + 16)[0]
        opt = coff + 20
        self.base = struct.unpack_from("<Q", data, opt + 24)[0]
        self.size = struct.unpack_from("<I", data, opt + 56)[0]
        table = opt + opt_size
        self.sections = []
        for i in range(n_sections):
            entry = table + 40 * i
            name = data[entry : entry + 8].rstrip(b"\0").decode("latin1")
            vsize, vaddr, rsize, raddr = struct.unpack_from("<IIII", data, entry + 8)
            self.sections.append((name, vaddr, vsize, raddr, rsize))

    def offset_of(self, rva: int) -> int:
        for _name, vaddr, vsize, raddr, rsize in self.sections:
            if vaddr <= rva < vaddr + max(vsize, rsize):
                return raddr + (rva - vaddr)
        raise FairGuardError(f"RVA {rva:#x} is in no section")

    def cstr(self, offset: int) -> str:
        end = self.data.index(b"\0", offset)
        return self.data[offset:end].decode("latin1")


class FairGuard:
    """One loaded, emulated copy of the protector. Reusable across calls."""

    def __init__(self, path: Path | None = None):
        from unicorn import UC_ARCH_X86, UC_HOOK_CODE, UC_HOOK_MEM_INVALID, UC_MODE_64, Uc
        from unicorn.x86_const import UC_X86_REG_RIP

        self._uc_error = __import__("unicorn").UcError
        self.path = Path(path) if path is not None else dll_path()
        if not self.path.is_file():
            raise FairGuardError(f"{self.path} not found: RO3_GAME must point at the install")
        self.img = _Image(self.path.read_bytes())

        u = Uc(UC_ARCH_X86, UC_MODE_64)
        self.u = u
        with _quiet_faulthandler():
            # Unicorn's Windows allocator raises and handles a first-chance access
            # violation while reserving a region. It recovers on its own — but Python's
            # faulthandler, which pytest turns on, prints a full traceback for it first.
            # Silencing it here keeps a passing run readable without hiding anything that
            # happens during emulation itself.
            u.mem_map(self.img.base, (self.img.size + 0x1FFFF) // 0x1000 * 0x1000 + 0x10000)
            u.mem_map(STACK, STACK_SIZE)
            u.mem_map(ARENA, ARENA_SIZE)
            u.mem_map(BUF, BUF_SIZE)
            u.mem_map(TEB, 0x20000)
            u.mem_map(STUBS, STUBS_SIZE)
        u.mem_write(self.img.base, self.img.data[:0x1000])
        for _name, vaddr, _vsize, raddr, rsize in self.img.sections:
            if rsize:
                u.mem_write(self.img.base + vaddr, self.img.data[raddr : raddr + rsize])
        u.mem_write(RET_MAGIC, b"\xc3")
        u.msr_write(0xC0000101, TEB)  # GS base
        u.mem_write(TEB + 0x30, struct.pack("<Q", TEB))

        self._stub_of: dict[str, int] = {}
        self._name_of: dict[int, str] = {}
        self._next_stub = STUBS
        self._tls: dict[int, int] = {}
        self._tls_next = 1
        self._brk = ARENA + 0x1000
        self.calls: collections.Counter[str] = collections.Counter()
        self.unstubbed: collections.Counter[str] = collections.Counter()
        self._faults: list[tuple] = []
        self._rip = UC_X86_REG_RIP

        self._plant_imports()
        u.hook_add(UC_HOOK_CODE, self._on_resolver, begin=self.img.base + RESOLVER,
                   end=self.img.base + RESOLVER)
        u.hook_add(UC_HOOK_CODE, self._on_api, begin=STUBS, end=STUBS + 0x10000)
        u.hook_add(UC_HOOK_MEM_INVALID, self._on_fault)

    # ------------------------------------------------------------------ Win32 stubbing
    def _stub(self, name: str) -> int:
        if name not in self._stub_of:
            addr = self._next_stub
            self._next_stub += 16
            self.u.mem_write(addr, b"\xc3" + b"\x90" * 15)  # ret; the hook does the work
            self._stub_of[name] = addr
            self._name_of[addr] = name
        return self._stub_of[name]

    def _plant_imports(self) -> None:
        """Point every IAT slot at a stub, so no real Windows call is ever needed."""
        d = self.img.data
        pos = self.img.offset_of(IMPORT_DIR)
        k = 0
        while True:
            olt, _ts, _fc, name_rva, iat = struct.unpack_from("<IIIII", d, pos + 20 * k)
            if name_rva == 0:
                break
            table = self.img.offset_of(olt or iat)
            j = 0
            while True:
                value = struct.unpack_from("<Q", d, table + 8 * j)[0]
                if value == 0:
                    break
                name = f"#{value & 0xFFFF}" if value >> 63 else self.img.cstr(
                    self.img.offset_of(value) + 2
                )
                self.u.mem_write(self.img.base + iat + 8 * j,
                                 struct.pack("<Q", self._stub(name)))
                j += 1
            k += 1

    def _alloc(self, size: int) -> int:
        size = (size + 31) & ~15
        p = self._brk
        self._brk += size + 16
        if self._brk >= ARENA + ARENA_SIZE:
            raise FairGuardError("emulated heap exhausted")
        self.u.mem_write(p, b"\0" * min(size, 0x10000))
        return p

    def _return(self, val: int) -> None:
        from unicorn.x86_const import UC_X86_REG_RAX, UC_X86_REG_RSP

        rsp = self.u.reg_read(UC_X86_REG_RSP)
        ret = struct.unpack("<Q", self.u.mem_read(rsp, 8))[0]
        self.u.reg_write(UC_X86_REG_RSP, rsp + 8)
        self.u.reg_write(UC_X86_REG_RAX, val)
        self.u.reg_write(self._rip, ret)

    def _on_fault(self, _u, kind, addr, size, value, _data):
        self._faults.append((kind, addr, size, self.u.reg_read(self._rip)))
        return False

    def _on_resolver(self, _u, _addr, _size, _data):
        """FairGuard resolves imports by name at runtime; hand back a stub."""
        from unicorn.x86_const import UC_X86_REG_RDX

        rdx = self.u.reg_read(UC_X86_REG_RDX)
        name = bytearray()
        try:
            for i in range(80):
                ch = self.u.mem_read(rdx + i, 1)[0]
                if ch == 0:
                    break
                name.append(ch)
        except Exception:  # pragma: no cover - an unreadable name is just an unnamed stub
            pass
        self._return(self._stub(bytes(name).decode("latin1", "replace")))

    def _on_api(self, _u, addr, _size, _data):
        name = self._name_of.get(addr)
        if name is None:
            return
        from unicorn.x86_const import UC_X86_REG_R8, UC_X86_REG_R9, UC_X86_REG_RCX, UC_X86_REG_RDX

        self.calls[name] += 1
        rcx = self.u.reg_read(UC_X86_REG_RCX)
        rdx = self.u.reg_read(UC_X86_REG_RDX)
        r8 = self.u.reg_read(UC_X86_REG_R8)
        if name in ("GetProcessHeap", "HeapCreate"):
            ret = 0xBEEF0000
        elif name == "HeapAlloc":
            ret = self._alloc(r8)
        elif name == "HeapReAlloc":
            ret = self._alloc(self.u.reg_read(UC_X86_REG_R9))
        elif name in ("HeapFree", "HeapDestroy", "HeapSetInformation"):
            ret = 1
        elif name == "HeapSize":
            ret = 0x10000
        elif name == "VirtualAlloc":
            ret = self._alloc(rdx or 0x10000)
        elif name in ("VirtualFree", "VirtualProtect"):
            ret = 1
        elif name in ("FlsAlloc", "TlsAlloc"):
            ret = self._tls_next
            self._tls_next += 1
        elif name in ("FlsSetValue", "TlsSetValue"):
            self._tls[rcx] = rdx
            ret = 1
        elif name in ("FlsGetValue", "TlsGetValue"):
            ret = self._tls.get(rcx, 0)
        elif name in ("EncodePointer", "DecodePointer"):
            ret = rcx
        elif name == "GetCurrentThreadId":
            ret = 0x1234
        elif name == "GetCurrentProcessId":
            ret = 0x5678
        elif name == "GetCurrentProcess":
            ret = 0xFFFFFFFFFFFFFFFF
        elif name == "GetLastError":
            ret = 0
        elif name in (
            "InitializeCriticalSection", "InitializeCriticalSectionEx",
            "InitializeCriticalSectionAndSpinCount", "EnterCriticalSection",
            "LeaveCriticalSection", "DeleteCriticalSection", "Sleep", "SleepEx",
        ):
            ret = 1
        elif name in ("QueryPerformanceCounter", "QueryPerformanceFrequency"):
            self._write_qword(rcx, 0x100000)
            ret = 1
        elif name == "GetSystemTimeAsFileTime":
            self._write_qword(rcx, 0x1D0000000000000)
            ret = 1
        else:
            # Not stubbing something the code turns out to need shows up as a fault or a
            # wrong keystream, never as silence: the counter is asserted on in the tests.
            self.unstubbed[name] += 1
            ret = 1
        self._return(ret)

    def _write_qword(self, addr: int, value: int) -> None:
        try:
            self.u.mem_write(addr, struct.pack("<Q", value))
        except Exception:  # pragma: no cover - out-param into unmapped memory
            pass

    # ------------------------------------------------------------------------- calling
    def _call(self, rva: int, args, max_instructions: int = 400_000_000) -> str | None:
        from unicorn.x86_const import (
            UC_X86_REG_R8, UC_X86_REG_R9, UC_X86_REG_RCX, UC_X86_REG_RDX, UC_X86_REG_RSP,
        )

        rsp = STACK + STACK_SIZE - 0x10000
        self.u.reg_write(UC_X86_REG_RSP, rsp)
        self.u.mem_write(rsp, struct.pack("<Q", RET_MAGIC))
        regs = [UC_X86_REG_RCX, UC_X86_REG_RDX, UC_X86_REG_R8, UC_X86_REG_R9]
        for reg, value in zip(regs, args[:4]):
            self.u.reg_write(reg, value)
        self._faults = []
        try:
            self.u.emu_start(self.img.base + rva, RET_MAGIC, count=max_instructions)
            return None
        except self._uc_error as exc:
            return str(exc)

    def deobfuscate(self, blob: bytes, length: int | None = None) -> bytes:
        """Run the protector's own deobfuscator over ``blob`` and return the result."""
        if length is None:
            length = min(len(blob), 0x500)
        self.u.mem_write(BUF, b"\0" * 0x1000)
        self.u.mem_write(BUF, blob)
        err = self._call(DECRYPT, [BUF, length])
        if err:
            raise FairGuardError(f"emulation failed: {err}")
        return bytes(self.u.mem_read(BUF, len(blob)))

    def raw_keystream(self, head32: bytes, n: int) -> bytes:
        """The n-byte keystream, obtained by deobfuscating a known blob and XOR-ing back.

        Only the first 32 bytes need to be real: the derivation reads the head, and the
        rest of the buffer is zeroed so the output *is* the keystream.
        """
        blob = bytes(head32) + b"\0" * (n - 32)
        return bytes(a ^ b for a, b in zip(self.deobfuscate(blob, n), blob))


_shared: FairGuard | None = None


def shared() -> FairGuard:
    """One lazily built emulator for the process. Mapping the image is the expensive part."""
    global _shared
    if _shared is None:
        _shared = FairGuard()
    return _shared


@functools.lru_cache(maxsize=None)
def key_material(head32: bytes, n: int):
    """``(rc4_key4, chunks)`` for one block-0 head, read out of the running protector.

    ``chunks`` is a tuple of ``(offset, length, word4, tail)``; see
    :func:`ro3.keygen.keystream_from_params` for what each part means.

    The chunk layout is *observed*, not assumed: the RC4 entry point is hooked, so each
    call reports the destination offset and length the protector chose for that ``n``.
    """
    from unicorn import UC_HOOK_CODE
    from unicorn.x86_const import UC_X86_REG_R8, UC_X86_REG_RCX, UC_X86_REG_RDX

    from .keygen import rc4_chunk

    head32 = bytes(head32)
    if len(head32) != 32:
        raise ValueError("head32 must be exactly 32 bytes")
    if n < 32:
        raise ValueError(f"n must be at least 32, got {n}")

    fg = shared()
    log: list[tuple[int, int, bytes]] = []

    if not getattr(fg, "_rc4_hooked", False):
        def on_rc4(u, _addr, _size, _data):
            log.append((
                u.reg_read(UC_X86_REG_RCX) - BUF,
                u.reg_read(UC_X86_REG_RDX) & 0xFFFFFFFF,
                bytes(u.mem_read(u.reg_read(UC_X86_REG_R8), 4)),
            ))

        fg._rc4_log = log
        fg.u.hook_add(UC_HOOK_CODE, on_rc4,
                      begin=fg.img.base + RC4_ENTRY, end=fg.img.base + RC4_ENTRY)
        fg._rc4_hooked = True
    else:
        log = fg._rc4_log
    log.clear()

    ks = fg.raw_keystream(head32, n)
    if not log:
        raise FairGuardError(
            "the protector never reached its RC4 stage for this head: it is not an "
            "obfuscated block-0 head"
        )
    keys = {k for _off, _len, k in log}
    if len(keys) != 1:
        raise FairGuardError(f"expected one RC4 key per block, saw {len(keys)}")
    key = keys.pop()

    chunks = []
    for off, length, _k in log:
        residue = bytes(a ^ b for a, b in zip(ks[off : off + length], rc4_chunk(key, length)))
        word = residue[:4]
        expected = (word * (length // 4 + 1))[:length]
        diverges = [i for i in range(length) if residue[i] != expected[i]]
        # The SSE pass only covers whole 16-byte lanes, so a short trailing lane keeps a
        # different residual; carry that suffix verbatim rather than modelling it.
        cut = min(diverges) if diverges else length
        chunks.append((off, length, word, residue[cut:]))
    return key, tuple(chunks)
