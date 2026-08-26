"""Recover RO3's decrypted asset data from a running client's memory. READ-ONLY.

Why this exists
---------------
RO3 encrypts what matters on disk, and every offline route is closed (measured, not assumed):

* Unity bundles: only block 0's first 1280 bytes are transformed, and bytes 0..31 are a plain
  XOR 0xa6 -- but 32..1279 use a per-bundle key, and the serialized file's *object table*
  lives inside that window, so bundles cannot be deserialized.
* The root ``.assets`` files are encrypted per-file too (a shared-keystream reading was tested
  and disproven).
* Lua chunks are stock 5.4 but their string constants are obfuscated by ``g(i) ^ len`` with a
  ``g`` that is a table or stream, not an algebraic function.
* ``global-metadata.dat`` is itself encrypted, so the key-derivation routine cannot be
  recovered statically with Il2CppDumper.

The client necessarily decrypts all of this to use it, so the plaintext exists in its memory.

What this does, and deliberately does not do
--------------------------------------------
It opens the process with ``PROCESS_QUERY_INFORMATION | PROCESS_VM_READ`` and reads. That is
all. It does **not** inject code, patch bytes, create remote threads, hook functions or
suspend anything -- none of the things that make a tool a cheat. It is the same access a
debugger or a task manager uses, pointed at data you already own a copy of on disk.

It still touches a client protected by FairGuard, an anti-cheat, so **running it is a
decision with account risk and is left to you**. Nothing here runs on import.

Usage
-----
    python -m ro3.memdump --out E:/arkive-games/unex-out/ro3/memdump

Run it after the game has loaded the content you want (log in, open the skill window, enter
the dungeon). Assets are decrypted lazily, so what is resident is what you have visited.
"""

from __future__ import annotations

import argparse
import ctypes
import ctypes.wintypes as wt
import sys
from dataclasses import dataclass
from pathlib import Path

PROCESS_QUERY_INFORMATION = 0x0400
PROCESS_VM_READ = 0x0010

MEM_COMMIT = 0x1000
PAGE_READABLE = 0x02 | 0x04 | 0x20 | 0x40  # READONLY, READWRITE, EXECUTE_READ, EXECUTE_READWRITE
PAGE_GUARD = 0x100

UNITY_VERSION = b"2022.3.62f3\x00"
CAB_MARKER = b"CAB-"

# IL2CPP metadata sanity magic, little-endian on disk as af1bb1fa.
IL2CPP_MAGIC = b"\xaf\x1b\xb1\xfa"
# Shipped global-metadata.dat is encrypted end to end (entropy 8.00 across all 23 MB, only
# the magic preserved), so Il2CppDumper cannot read it. In memory it must be plaintext, and
# a decrypted header is recognisable because the version field becomes a real IL2CPP
# version instead of garbage. Recovering it once turns every later step into offline work.
IL2CPP_VERSIONS = (24, 27, 29, 31)

k32 = ctypes.WinDLL("kernel32", use_last_error=True)


class MEMORY_BASIC_INFORMATION64(ctypes.Structure):
    _fields_ = [
        ("BaseAddress", ctypes.c_ulonglong),
        ("AllocationBase", ctypes.c_ulonglong),
        ("AllocationProtect", wt.DWORD),
        ("__alignment1", wt.DWORD),
        ("RegionSize", ctypes.c_ulonglong),
        ("State", wt.DWORD),
        ("Protect", wt.DWORD),
        ("Type", wt.DWORD),
        ("__alignment2", wt.DWORD),
    ]


@dataclass(frozen=True, slots=True)
class Region:
    base: int
    size: int


def find_pid(name: str = "ro3.exe") -> int | None:
    """PID of the running client, via the toolhelp snapshot."""
    TH32CS_SNAPPROCESS = 0x00000002

    class PROCESSENTRY32W(ctypes.Structure):
        _fields_ = [
            ("dwSize", wt.DWORD),
            ("cntUsage", wt.DWORD),
            ("th32ProcessID", wt.DWORD),
            ("th32DefaultHeapID", ctypes.POINTER(ctypes.c_ulong)),
            ("th32ModuleID", wt.DWORD),
            ("cntThreads", wt.DWORD),
            ("th32ParentProcessID", wt.DWORD),
            ("pcPriClassBase", ctypes.c_long),
            ("dwFlags", wt.DWORD),
            ("szExeFile", ctypes.c_wchar * 260),
        ]

    snap = k32.CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0)
    if snap == -1:
        return None
    try:
        entry = PROCESSENTRY32W()
        entry.dwSize = ctypes.sizeof(PROCESSENTRY32W)
        if not k32.Process32FirstW(snap, ctypes.byref(entry)):
            return None
        while True:
            if entry.szExeFile.lower() == name.lower():
                return int(entry.th32ProcessID)
            if not k32.Process32NextW(snap, ctypes.byref(entry)):
                return None
    finally:
        k32.CloseHandle(snap)


def regions(handle: int) -> list[Region]:
    """Committed, readable, non-guard regions."""
    out: list[Region] = []
    addr = 0
    mbi = MEMORY_BASIC_INFORMATION64()
    limit = 0x7FFF_FFFF_FFFF
    while addr < limit:
        got = k32.VirtualQueryEx(
            wt.HANDLE(handle), ctypes.c_void_p(addr), ctypes.byref(mbi), ctypes.sizeof(mbi)
        )
        if not got:
            break
        if (
            mbi.State == MEM_COMMIT
            and mbi.Protect & PAGE_READABLE
            and not mbi.Protect & PAGE_GUARD
        ):
            out.append(Region(mbi.BaseAddress, mbi.RegionSize))
        nxt = mbi.BaseAddress + mbi.RegionSize
        if nxt <= addr:
            break
        addr = nxt
    return out


def read(handle: int, base: int, size: int) -> bytes | None:
    buf = (ctypes.c_char * size)()
    got = ctypes.c_size_t(0)
    ok = k32.ReadProcessMemory(
        wt.HANDLE(handle), ctypes.c_void_p(base), buf, ctypes.c_size_t(size), ctypes.byref(got)
    )
    if not ok or got.value == 0:
        return None
    return bytes(buf[: got.value])


def carve(blob: bytes) -> list[tuple[int, str]]:
    """Offsets in a region that look like decrypted Unity data worth keeping."""
    hits: list[tuple[int, str]] = []
    start = 0
    while (i := blob.find(UNITY_VERSION, start)) != -1:
        hits.append((i, "serialized-file"))
        start = i + 1
    start = 0
    while (i := blob.find(CAB_MARKER, start)) != -1:
        hits.append((i, "cab"))
        start = i + 1
    start = 0
    while (i := blob.find(IL2CPP_MAGIC, start)) != -1:
        # only a DECRYPTED header counts: on disk the version field is garbage
        if i + 8 <= len(blob):
            version = int.from_bytes(blob[i + 4:i + 8], "little")
            if version in IL2CPP_VERSIONS:
                hits.append((i, "il2cpp-metadata"))
        start = i + 1
    return hits


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--out", required=True, type=Path, help="directory to write dumps into")
    ap.add_argument("--process", default="ro3.exe")
    ap.add_argument("--max-region", type=int, default=256 << 20,
                    help="skip regions larger than this (bytes)")
    args = ap.parse_args(argv)

    if sys.platform != "win32":
        print("this tool is Windows-only", file=sys.stderr)
        return 2

    pid = find_pid(args.process)
    if pid is None:
        print(f"{args.process} is not running - start the client first", file=sys.stderr)
        return 1

    handle = k32.OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, False, pid)
    if not handle:
        print(
            f"OpenProcess failed (error {ctypes.get_last_error()}). "
            "Try an elevated shell; the anti-cheat may also be refusing the handle.",
            file=sys.stderr,
        )
        return 1

    args.out.mkdir(parents=True, exist_ok=True)
    kept = scanned = 0
    try:
        for r in regions(handle):
            if r.size > args.max_region:
                continue
            blob = read(handle, r.base, r.size)
            if not blob:
                continue
            scanned += 1
            hits = carve(blob)
            if not hits:
                continue
            target = args.out / f"{r.base:016x}_{r.size}.bin"
            target.write_bytes(blob)
            kept += 1
            kinds = {k for _o, k in hits}
            print(f"  {target.name}  {len(hits)} hits {sorted(kinds)}")
    finally:
        k32.CloseHandle(handle)

    print(f"\nscanned {scanned} regions, kept {kept} containing decrypted Unity data")
    print(f"output: {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
