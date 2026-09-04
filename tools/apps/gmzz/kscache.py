"""Assemble the client's hot-patched content into a directory uex can mount.

Run from ``tools/``::

    uv run python -m gmzz.kscache

The installed client is a *base* build; every patch since is downloaded into
``Saved/kscache/`` and overlaid at run time, and nothing under ``Content/`` is
ever rewritten. uex (CUE4Parse's ``LoMDefaultFileProvider``) reads only
``Content/``, so an export of the install is the base build — 2018737 of
2026-08-19 — while players are on 2097705, and 273 Excel tables differ between
the two (``EquipmentWordRandomWordData`` among them: the extraordinary affix
ladder the reforge page needed came from a patch).

This writes ``GMZZ_PATCHED/C7/Content`` as a second client root uex can be
pointed at, built from three sources:

- **Hard links** to the base install's containers and its ``Manifest_UFSFiles_Win64.txt``.
  Nothing is copied, and the install is never written to.
- **A patch pak**, ``Paks/pakchunk0-Windows_1_P.pak``, carrying every changed
  ``.pak`` entry that has been downloaded, with a plain UE index naming each one.
  CUE4Parse gives a ``_P`` pak priority over the base, so the patched table wins.
- **A synthesized ``package.manifest``** for the IoStore side. Each kscache pack
  file is hard-linked in as an extra partition of the container it patches, and
  the changed chunks' records are re-pointed at it.

How the pieces fit, since none of it is documented:

- ``Content/package.manifest`` is a ``KMF`` file: a 24-byte header and a zlib
  stream holding the container paths, the compression method names, one 48-byte
  record per chunk (int40 offset / compressed size / uncompressed size, u8 type,
  the 12-byte ``FIoChunkId``, a CRC32 of the stored bytes, the container index,
  the build that last changed the chunk, and the range of its compression
  blocks), then the 12-byte compression blocks. CUE4Parse's ``LoMManifest``
  reads the same layout; the field it calls ``Seed`` is ``zlib.crc32`` of the
  chunk as stored, verified on 615,975 of the base install's 616,234 records
  (the rest are chunks over 10 MB, whose CRC is taken some other way).
- The ``.pak`` container is in the manifest too — one record per pak entry,
  ``offset`` pointing past the entry's ``FPakEntry`` header — but CUE4Parse
  reads the pak through its own (AES-encrypted) index, so the pak's patch has
  to be a pak.
- ``Saved/kscache/package_<base>.manifest`` is the live manifest: the same
  records with ``version`` bumped on every chunk changed since the base build.
  Unchanged chunks keep their base offsets; a changed chunk's ``offset`` is
  meaningless (several read 0) because it lives in kscache instead.
- ``Saved/kscache/local.cache`` says where: ``[FIoChunkId 12][crc32][offset][0]
  [len][path]`` per downloaded chunk, the path relative to kscache — a pack file
  named after the container (``2097705/pakchunk9999-Windows_s2.ucas``) or a
  single-chunk file in a numbered bucket (``93/<id hex>_<build>``).
- Chunks are downloaded on demand, so a chunk changed in a patch may not be in
  kscache at all. Such a chunk is dropped from the synthesized manifest (its
  compression-block count is zeroed, which CUE4Parse skips) and, for the pak,
  left out; the run reports how many.

Set in ``tools/.env``: ``GMZZ_GAME`` (the install's ``C7`` directory),
``GMZZ_PATCHED`` (the directory to write; must be on the same volume for the
hard links) and ``GMZZ_AES_KEY`` (the pak index key, as in uex's profile).
"""

from __future__ import annotations

import argparse
import collections
import hashlib
import os
import re
import struct
import zlib
from dataclasses import dataclass, field
from pathlib import Path

from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

from .env import BUILD_MARKER, require_dir

KMF_MAGIC = b"KMF\0"
KMF_HEADER = struct.Struct("<4sIIIII")
RECORD = struct.Struct("<5s5s5sB12sIiiii")
RECORD_SIZE = RECORD.size
PIECE_SIZE = 12
PAK_MAGIC = 0x5A6F12E1
PAK_VERSION = 11
PAK_FOOTER_SIZE = 221
LOCAL_CACHE_ENTRY = struct.Struct("<12sIIII")
#: The manifest's compression methods, index 0 being uncompressed — the only two seen.
MANIFEST_METHODS = ["None", "Oodle"]
#: The patch pak's method table: slot 0 is method index 1, since index 0 is the implicit None.
PAK_METHODS = ["Oodle"]
#: The pak entries the client compresses in 64 KiB blocks, as its own index says.
PAK_BLOCK_SIZE = 65536
#: Chunks at least this large carry a CRC that is not ``crc32`` of the stored bytes.
CRC_CHECK_LIMIT = 8 << 20
#: Compression blocks address partition x 4 GiB + offset in 40 bits: 256 partitions.
MAX_PARTITION = 255
BUCKET_FILE = re.compile(r"[0-9a-f]{24}_\d+")


def _int40(b: bytes) -> int:
    return int.from_bytes(b, "little")


def _pack40(value: int) -> bytes:
    return value.to_bytes(5, "little")


@dataclass
class Record:
    """One chunk of one container — the 48-byte manifest record."""

    offset: int
    size: int
    usize: int
    type: int
    chunk_id: bytes
    crc: int
    owner: int
    version: int
    first_piece: int
    piece_count: int

    @classmethod
    def parse(cls, raw: bytes) -> "Record":
        o, s, u, t, cid, crc, owner, version, fp, pc = RECORD.unpack(raw)
        return cls(_int40(o), _int40(s), _int40(u), t, cid, crc, owner, version, fp, pc)

    def pack(self) -> bytes:
        return RECORD.pack(
            _pack40(self.offset), _pack40(self.size), _pack40(self.usize), self.type,
            self.chunk_id, self.crc, self.owner, self.version, self.first_piece, self.piece_count,
        )


@dataclass
class Piece:
    """One compression block of a chunk: offset *within the chunk*, sizes, method index.

    Nothing here says where the block is in a file. CUE4Parse composes that
    when it turns the manifest into a table of contents: the partition index
    implied by the owner's ``_sN`` suffix times 4 GiB, plus the record's offset,
    plus this offset — into a 40-bit field. That composition is what lets a
    record be re-pointed at another partition by changing only its owner and
    offset, with its blocks untouched, and what caps a container at 256
    partitions.
    """

    offset: int
    csize: int
    usize: int
    method: int

    @classmethod
    def parse(cls, raw: bytes) -> "Piece":
        return cls(int.from_bytes(raw[0:5], "little"), int.from_bytes(raw[5:8], "little"),
                   int.from_bytes(raw[8:11], "little"), raw[11])


@dataclass
class Manifest:
    header: bytes
    names: list[str]
    methods: list[str]
    records: list[Record]
    #: Everything after the records — compression blocks and trailers — kept verbatim.
    tail: bytes
    pieces_count: int = 0
    _pieces_at: int = 0

    def piece(self, index: int) -> Piece:
        if not 0 <= index < self.pieces_count:
            raise IndexError(f"compression block {index} outside 0..{self.pieces_count}")
        at = self._pieces_at + PIECE_SIZE * index
        return Piece.parse(self.tail[at:at + PIECE_SIZE])

    def pieces_of(self, record: Record) -> list[Piece]:
        return [self.piece(i) for i in range(record.first_piece, record.first_piece + record.piece_count)]

    @classmethod
    def read(cls, path: Path) -> "Manifest":
        raw = Path(path).read_bytes()
        magic, _version, usize, *_ = KMF_HEADER.unpack_from(raw, 0)
        if magic != KMF_MAGIC:
            raise RuntimeError(f"{path} is not a KMF manifest (magic {magic!r})")
        body = zlib.decompress(raw[KMF_HEADER.size:])
        if len(body) != usize:
            raise RuntimeError(f"{path}: header says {usize} bytes, stream holds {len(body)}")
        pos = 4  # body version
        names, pos = _read_strings(body, pos)
        methods, pos = _read_strings(body, pos)
        count = struct.unpack_from("<I", body, pos)[0]
        pos += 4
        records = [Record.parse(body[pos + RECORD_SIZE * i:pos + RECORD_SIZE * (i + 1)]) for i in range(count)]
        pos += RECORD_SIZE * count
        tail = body[pos:]
        pieces_count = struct.unpack_from("<I", tail, 0)[0]
        return cls(raw[:KMF_HEADER.size], names, methods, records, tail, pieces_count, 4)

    def write(self, path: Path) -> None:
        body = bytearray(struct.pack("<I", 6))
        body += _pack_strings(self.names)
        body += _pack_strings(self.methods)
        body += struct.pack("<I", len(self.records))
        for record in self.records:
            body += record.pack()
        body += self.tail
        header = bytearray(self.header)
        struct.pack_into("<I", header, 8, len(body))
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        Path(path).write_bytes(bytes(header) + zlib.compress(bytes(body), 6))


def _read_strings(body: bytes, pos: int) -> tuple[list[str], int]:
    count = struct.unpack_from("<I", body, pos)[0]
    pos += 4
    out = []
    for _ in range(count):
        length = struct.unpack_from("<I", body, pos)[0]
        pos += 4
        out.append(body[pos:pos + length - 1].decode("utf-8"))
        pos += length
    return out, pos


def _pack_strings(items: list[str]) -> bytes:
    out = bytearray(struct.pack("<I", len(items)))
    for item in items:
        encoded = item.encode("utf-8") + b"\0"
        out += struct.pack("<I", len(encoded)) + encoded
    return bytes(out)


@dataclass
class LocalChunk:
    path: str
    offset: int
    crc: int


def read_local_cache(path: Path) -> dict[bytes, LocalChunk]:
    """Where every downloaded chunk sits: chunk id -> (kscache-relative file, offset)."""
    raw = Path(path).read_bytes()
    pos = 0
    out: dict[bytes, LocalChunk] = {}
    while pos + LOCAL_CACHE_ENTRY.size <= len(raw):
        chunk_id, crc, offset, zero, length = LOCAL_CACHE_ENTRY.unpack_from(raw, pos)
        pos += LOCAL_CACHE_ENTRY.size
        if zero != 0:
            raise RuntimeError(f"local.cache entry at {pos - LOCAL_CACHE_ENTRY.size} has {zero} where 0 was expected")
        rel = raw[pos:pos + length - 1].decode("utf-8")
        pos += length
        out[chunk_id] = LocalChunk(rel, offset, crc)
    return out


def read_versions(game: Path, kscache: Path) -> tuple[int, int]:
    """(base build, live build) from the two ``AssetsVersion.txt`` files."""
    base = int((game / "Content" / "Paks" / "AssetsVersion.txt").read_text().split(".")[1])
    live_text = (kscache / "AssetsVersion.txt").read_text().strip()
    live = int(live_text.split(".")[2])
    return base, live


# ------------------------------------------------------------------ pak index

class _Reader:
    def __init__(self, data: bytes) -> None:
        self.data = data
        self.pos = 0

    def read(self, fmt: str):
        values = struct.unpack_from(fmt, self.data, self.pos)
        self.pos += struct.calcsize(fmt)
        return values[0] if len(values) == 1 else values

    def take(self, n: int) -> bytes:
        out = self.data[self.pos:self.pos + n]
        self.pos += n
        return out

    def fstring(self) -> str:
        n = self.read("<i")
        if n < 0:
            return self.take(-n * 2).decode("utf-16-le").rstrip("\0")
        return self.take(n).decode("utf-8").rstrip("\0")


def _fstring(value: str) -> bytes:
    """UE's FString: ASCII as bytes, anything else as UTF-16 with a negative length."""
    if value.isascii():
        encoded = value.encode("ascii") + b"\0"
        return struct.pack("<i", len(encoded)) + encoded
    encoded = (value + "\0").encode("utf-16-le")
    return struct.pack("<i", -(len(encoded) // 2)) + encoded


def aes_ecb_decrypt(key: bytes, data: bytes) -> bytes:
    decryptor = Cipher(algorithms.AES(key), modes.ECB()).decryptor()
    return decryptor.update(data) + decryptor.finalize()


@dataclass
class PakEntry:
    offset: int
    usize: int
    csize: int
    method: int
    encrypted: bool
    blocks: list[int]

    @property
    def struct_size(self) -> int:
        """Bytes of ``FPakEntry`` header written in front of the data — what CUE4Parse skips."""
        return 48 + 5 + (4 + 16 * len(self.blocks) if self.method else 0)

    @property
    def data_offset(self) -> int:
        return self.offset + self.struct_size


def decode_pak_entry(reader: _Reader) -> PakEntry:
    """``FPakFile::DecodePakEntry`` — the compact form the index stores."""
    flags = reader.read("<I")
    method = (flags >> 23) & 0x3F
    encrypted = bool(flags & (1 << 22))
    block_count = (flags >> 6) & 0xFFFF
    if (flags & 0x3F) == 0x3F:
        reader.read("<I")  # explicit block size
    offset = reader.read("<I") if flags & (1 << 31) else reader.read("<Q")
    usize = reader.read("<I") if flags & (1 << 30) else reader.read("<Q")
    csize = usize
    if method:
        csize = reader.read("<I") if flags & (1 << 29) else reader.read("<Q")
    blocks: list[int] = []
    if block_count == 1 and not encrypted:
        blocks = [csize]
    elif block_count:
        blocks = [reader.read("<I") for _ in range(block_count)]
    return PakEntry(offset, usize, csize, method, encrypted, blocks)


def encode_pak_entry(entry: PakEntry) -> bytes:
    """The inverse of :func:`decode_pak_entry`, always in the wide (64-bit) form."""
    block_count = len(entry.blocks) if entry.method else 0
    flags = (entry.method << 23) | (block_count << 6) | ((PAK_BLOCK_SIZE >> 11) if block_count else 0)
    if entry.encrypted:
        flags |= 1 << 22
    out = bytearray(struct.pack("<IQQ", flags, entry.offset, entry.usize))
    if entry.method:
        out += struct.pack("<Q", entry.csize)
    if not (block_count == 1 and not entry.encrypted):
        for size in entry.blocks:
            out += struct.pack("<I", size)
    return bytes(out)


def pak_entry_header(entry: PakEntry, sha1: bytes) -> bytes:
    """The ``FPakEntry`` written in front of the data itself."""
    out = bytearray(struct.pack("<QQQI", entry.offset, entry.csize, entry.usize, entry.method))
    out += sha1
    if entry.method:
        out += struct.pack("<I", len(entry.blocks))
        start = entry.struct_size
        for size in entry.blocks:
            out += struct.pack("<QQ", start, start + size)
            start += _align(size, 16) if entry.encrypted else size
    out += struct.pack("<BI", 1 if entry.encrypted else 0, PAK_BLOCK_SIZE if entry.method else 0)
    return bytes(out)


def _align(value: int, to: int) -> int:
    return (value + to - 1) // to * to


def read_pak_index(pak: Path, key: bytes) -> dict[str, PakEntry]:
    """Every entry of a pak by path, through the client's own footer variant.

    The footer keeps UE's layout except that the version carries bit 31 and the
    index hash precedes the index offset — the reading CUE4Parse does in
    ``FPakInfo`` for ``GAME_LordOfMysteries``. The index size is stored doubled.
    """
    size = os.path.getsize(pak)
    with open(pak, "rb") as f:
        f.seek(size - PAK_FOOTER_SIZE)
        foot = f.read(PAK_FOOTER_SIZE)
        encrypted = foot[16]
        magic, version = struct.unpack_from("<II", foot, 17)
        if magic != PAK_MAGIC:
            raise RuntimeError(f"{pak}: no pak footer")
        if version & 0x80000000:
            index_offset, index_size = struct.unpack_from("<qq", foot, 45)
            index_size >>= 1
        else:
            index_offset, index_size = struct.unpack_from("<qq", foot, 25)
        f.seek(index_offset)
        primary = f.read(index_size)
        if encrypted:
            primary = aes_ecb_decrypt(key, primary)
        r = _Reader(primary)
        mount = r.fstring()
        r.read("<i")  # entry count
        r.read("<Q")  # path hash seed
        if r.read("<i"):
            r.take(36)
        if not r.read("<i"):
            raise RuntimeError(f"{pak}: no full directory index")
        dir_offset, dir_size = r.read("<qq")
        r.take(20)
        encoded = r.take(r.read("<i"))
        if r.read("<i"):
            raise RuntimeError(f"{pak}: non-encoded entries are not handled")
        f.seek(dir_offset)
        directory = f.read(dir_size)
        if encrypted:
            directory = aes_ecb_decrypt(key, directory)
    d = _Reader(directory)
    entries: dict[str, PakEntry] = {}
    for _ in range(d.read("<i")):
        dirname = d.fstring()
        for _ in range(d.read("<i")):
            filename = d.fstring()
            at = d.read("<i")
            er = _Reader(encoded)
            er.pos = at
            entries[_join(mount, dirname, filename)] = decode_pak_entry(er)
    return entries


def _join(mount: str, dirname: str, filename: str) -> str:
    """The path CUE4Parse would mount — ``../../../`` prefixes are the game root."""
    path = dirname + filename
    prefix = mount
    while prefix.startswith("../"):
        prefix = prefix[3:]
    return prefix + path


def write_patch_pak(path: Path, files: list[tuple[str, PakEntry, bytes]]) -> None:
    """A version-11 pak with an unencrypted index: ``files`` are (path, entry, stored bytes).

    ``entry.offset`` is assigned here. The path-hash index CUE4Parse insists on
    seeing a flag for is written as a zero-length region; only the directory
    index is read.
    """
    out = bytearray()
    placed: list[tuple[str, PakEntry]] = []
    for rel, entry, data in files:
        entry.offset = len(out)
        out += pak_entry_header(entry, hashlib.sha1(data).digest())
        out += data
        if len(data) != entry.csize:
            raise RuntimeError(f"{rel}: {len(data)} bytes stored against a compressed size of {entry.csize}")
        placed.append((rel, entry))
    encoded = bytearray()
    offsets = []
    for _, entry in placed:
        offsets.append(len(encoded))
        encoded += encode_pak_entry(entry)
    by_dir: dict[str, list[tuple[str, int]]] = collections.defaultdict(list)
    for (rel, _), at in zip(placed, offsets):
        dirname, _, filename = rel.rpartition("/")
        by_dir[dirname + "/"].append((filename, at))
    directory = bytearray(struct.pack("<i", len(by_dir)))
    for dirname in sorted(by_dir):
        directory += _fstring(dirname)
        directory += struct.pack("<i", len(by_dir[dirname]))
        for filename, at in by_dir[dirname]:
            directory += _fstring(filename) + struct.pack("<i", at)
    mount = "../../../"
    directory_offset = len(out)
    out += directory
    primary = bytearray(_fstring(mount))
    primary += struct.pack("<iQ", len(placed), 0)
    primary += struct.pack("<iqq", 1, directory_offset, 0) + bytes(20)  # path hash index: present, empty
    primary += struct.pack("<iqq", 1, directory_offset, len(directory)) + hashlib.sha1(directory).digest()
    primary += struct.pack("<i", len(encoded)) + encoded
    primary += struct.pack("<i", 0)
    index_offset = len(out)
    out += primary
    footer = bytearray(bytes(16))  # encryption key guid
    footer += struct.pack("<BIIqq", 0, PAK_MAGIC, PAK_VERSION, index_offset, len(primary))
    footer += hashlib.sha1(primary).digest()
    for i in range(5):
        name = PAK_METHODS[i].encode("ascii") if i < len(PAK_METHODS) else b""
        footer += name + bytes(32 - len(name))
    if len(footer) != PAK_FOOTER_SIZE:
        raise AssertionError(len(footer))
    out += footer
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_bytes(bytes(out))


# ---------------------------------------------------------------- assembly

@dataclass
class Report:
    base: int = 0
    live: int = 0
    pak_patched: int = 0
    pak_unnamed: int = 0
    pak_missing: int = 0
    iostore_patched: int = 0
    iostore_missing: int = 0
    iostore_skipped_owner: int = 0
    partitions: int = 0
    linked: int = 0
    removed: int = 0
    notes: list[str] = field(default_factory=list)


def hard_link(src: Path, dst: Path, report: Report | None = None) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    if dst.exists():
        if os.path.samefile(src, dst):
            return
        dst.unlink()
    try:
        os.link(src, dst)
    except OSError as e:
        raise RuntimeError(f"cannot hard-link {src} -> {dst}; GMZZ_PATCHED must be on the same volume as the game ({e})") from e
    if report:
        report.linked += 1


def is_bucket_file(rel: str) -> bool:
    """``93/8fda9697d766491b00000001_2044036`` — one chunk per file, named by chunk id and build."""
    return BUCKET_FILE.fullmatch(rel.rsplit("/", 1)[-1]) is not None


def write_aggregate(path: Path, kscache: Path, chunks: list[tuple[Record, LocalChunk]]) -> None:
    """Concatenate single-chunk files into one partition, setting each record's offset.

    Every chunk is placed on a 16-byte boundary and the file ends with a spare
    AES block, because an encrypted chunk is read in whole 16-byte blocks and
    the last one must not run off the end of the file.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "wb") as out:
        for record, where in chunks:
            record.offset = out.tell()
            data = (kscache / where.path).read_bytes()
            if len(data) != record.size:
                raise RuntimeError(f"{where.path}: {len(data)} bytes, manifest says {record.size}")
            out.write(data)
            out.write(bytes(_align(len(data), 16) - len(data)))
        out.write(bytes(16))


def patch_pak_name(base_pak: str) -> str:
    """``pakchunk0-Windows.pak`` -> ``pakchunk0-Windows_1_P.pak``: UE's patch-pak convention, which CUE4Parse reads first."""
    return base_pak[:-len(".pak")] + "_1_P.pak"


def partition_base(name: str) -> tuple[str, int]:
    """``Paks/pakchunk9999-Windows_s2.ucas`` -> (``Paks/pakchunk9999-Windows``, 2); no suffix is partition 0."""
    stem = name[:-len(".ucas")]
    head, sep, tail = stem.rpartition("_s")
    if sep and tail.isdigit():
        return head, int(tail)
    return stem, 0


def build(game: Path, out: Path, key: bytes) -> Report:
    kscache = game / "Saved" / "kscache"
    content = game / "Content"
    report = Report()
    report.base, report.live = read_versions(game, kscache)
    live_manifest_path = kscache / f"package_{report.base}.manifest"
    if not live_manifest_path.exists():
        raise RuntimeError(f"{live_manifest_path} is missing; the client has not patched this install")

    base_manifest = Manifest.read(content / "package.manifest")
    live = Manifest.read(live_manifest_path)
    local = read_local_cache(kscache / "local.cache")
    base_by_id = {r.chunk_id: r for r in base_manifest.records}
    # Every chunk's blocks are described with one of these two methods, and the
    # patch pak's method table is written to match; a third one would otherwise
    # be labelled Oodle and decompress to garbage rather than fail.
    if live.methods != MANIFEST_METHODS:
        raise RuntimeError(f"manifest compression methods {live.methods} are not the expected {MANIFEST_METHODS}")

    out_content = out / "C7" / "Content"
    paks_out = out_content / "Paks"
    # A previous run's patch pak, partitions and aggregates would otherwise
    # survive a newer patch and shadow what this run writes.
    base_files = {src.name for src in (content / "Paks").iterdir() if src.is_file()}
    if paks_out.is_dir():
        for stale in paks_out.iterdir():
            if stale.name not in base_files:
                stale.unlink()
                report.removed += 1
    for src in (content / "Paks").iterdir():
        if src.is_file():
            hard_link(src, paks_out / src.name, report)
    hard_link(content / "Manifest_UFSFiles_Win64.txt", out_content / "Manifest_UFSFiles_Win64.txt", report)

    def chunk_bytes(record: Record) -> bytes | None:
        where = local.get(record.chunk_id)
        if where is None:
            return None
        with open(kscache / where.path, "rb") as f:
            f.seek(where.offset)
            data = f.read(record.size)
        if len(data) != record.size:
            raise RuntimeError(f"chunk {record.chunk_id.hex()} in {where.path}@{where.offset} is short")
        # The CRC is over the stored bytes, except on chunks past ~10 MB, where
        # the client takes it some other way; those are checked by size alone.
        if record.size < CRC_CHECK_LIMIT and zlib.crc32(data) != record.crc:
            raise RuntimeError(f"chunk {record.chunk_id.hex()} in {where.path}@{where.offset} does not match its manifest CRC")
        return data

    # --- the paks -----------------------------------------------------------
    # One patch pak per base pak, named after it, so the `_P` priority rule only
    # ever has to beat the pak it patches. The marker rides in the first one,
    # under the ScriptOPCode root uex exports, so the export can say which
    # build it is (see `gmzz.env.check_export_current`).
    pak_owners = {i for i, n in enumerate(live.names) if n.endswith(".pak")}
    marker_written = False
    for owner in sorted(pak_owners):
        pak_name = live.names[owner].split("/")[-1]
        base_index = read_pak_index(content / "Paks" / pak_name, key)
        by_data_offset = {e.data_offset: (p, e) for p, e in base_index.items()}
        pak_files: list[tuple[str, PakEntry, bytes]] = []
        if not marker_written:
            marker = f"{report.live}\n".encode("ascii")
            pak_files.append((BUILD_MARKER, PakEntry(0, len(marker), len(marker), 0, False, []), marker))
            marker_written = True
        for record in live.records:
            if record.owner != owner or record.version == report.base:
                continue
            old = base_by_id.get(record.chunk_id)
            named = by_data_offset.get(old.offset) if old else None
            if named is None:
                report.pak_unnamed += 1
                continue
            path, old_entry = named
            data = chunk_bytes(record)
            if data is None:
                report.pak_missing += 1
                report.notes.append(f"not downloaded: {path}")
                continue
            pieces = live.pieces_of(record)
            methods = {p.method for p in pieces}
            if not methods <= {0, 1}:
                raise RuntimeError(f"{path}: compression blocks use method {methods - {0, 1}}, which the patch pak cannot express")
            method = 1 if 1 in methods else 0
            entry = PakEntry(0, record.usize, record.size, method, old_entry.encrypted, [p.csize for p in pieces] if method else [])
            pak_files.append((path, entry, data))
            report.pak_patched += 1
        write_patch_pak(paks_out / patch_pak_name(pak_name), pak_files)

    # --- IoStore ------------------------------------------------------------
    # A chunk's compression blocks are addressed as partition x 4 GiB + record
    # offset + block offset in a 40-bit field (see `Piece`), so a container can
    # have at most 256 partitions and a record moves with its blocks. Pack files
    # (one per patch per container) are linked in as partitions of their own;
    # the single-chunk bucket files, of which one container has 250, are copied
    # into one aggregate partition per container instead.
    next_partition: dict[str, int] = collections.defaultdict(int)
    for name in live.names:
        if name.endswith(".ucas"):
            base, index = partition_base(name)
            next_partition[base] = max(next_partition[base], index + 1)

    def add_partition(base: str) -> tuple[int, str]:
        index = next_partition[base]
        if index > MAX_PARTITION:
            raise RuntimeError(f"{base} would need partition {index}; the block offset field holds {MAX_PARTITION + 1}")
        next_partition[base] = index + 1
        live.names.append(f"{base}_s{index}.ucas")
        report.partitions += 1
        return len(live.names) - 1, live.names[-1].split("/")[-1]

    pack_partitions: dict[tuple[str, str], int] = {}  # (container base, kscache pack) -> owner
    bucketed: dict[str, list[tuple[Record, LocalChunk]]] = collections.defaultdict(list)
    for record in live.records:
        if record.version == report.base or record.owner in pak_owners:
            continue
        owner_name = live.names[record.owner]
        if not owner_name.endswith(".ucas"):
            report.iostore_skipped_owner += 1
            continue
        where = local.get(record.chunk_id)
        if where is None:
            record.piece_count = 0
            report.iostore_missing += 1
            continue
        base, _ = partition_base(owner_name)
        if is_bucket_file(where.path):
            bucketed[base].append((record, where))
            continue
        owner = pack_partitions.get((base, where.path))
        if owner is None:
            owner, filename = add_partition(base)
            pack_partitions[(base, where.path)] = owner
            hard_link(kscache / where.path, paks_out / filename, report)
        record.owner = owner
        record.offset = where.offset
        report.iostore_patched += 1
    for base, chunks in sorted(bucketed.items()):
        owner, filename = add_partition(base)
        write_aggregate(paks_out / filename, kscache, chunks)
        for record, _ in chunks:
            record.owner = owner
            report.iostore_patched += 1
    live.write(out_content / "package.manifest")
    (out_content / "package.txt").write_text(str(report.live), encoding="utf-8")
    return report


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--game", type=Path, default=None, help="client root (default GMZZ_GAME)")
    parser.add_argument("--out", type=Path, default=None, help="directory to write (default GMZZ_PATCHED)")
    args = parser.parse_args(argv)
    game = args.game or require_dir("GMZZ_GAME")
    out = args.out or require_dir("GMZZ_PATCHED")
    key_text = os.environ.get("GMZZ_AES_KEY")
    if not key_text:
        raise RuntimeError("GMZZ_AES_KEY is not set: the pak index key, as in uex's profile (0x... hex)")
    key = bytes.fromhex(key_text.removeprefix("0x"))
    report = build(game, out, key)
    print(f"base {report.base} -> live {report.live}: {report.linked} files linked, {report.removed} stale files removed")
    print(f"pak: {report.pak_patched} entries patched, {report.pak_unnamed} new files without a name, {report.pak_missing} not downloaded")
    print(f"iostore: {report.iostore_patched} chunks re-pointed across {report.partitions} partitions, "
          f"{report.iostore_missing} not downloaded (dropped), {report.iostore_skipped_owner} in .upak containers (untouched)")
    for line in report.notes[:20]:
        print("  " + line)


if __name__ == "__main__":
    main()
