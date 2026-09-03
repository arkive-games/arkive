"""The hot-patch assembler, exercised against a client tree built here.

Nothing needs the game: the manifests, the pak and the kscache files are
assembled byte by byte from the layouts ``gmzz.kscache`` documents, so both the
parsers and the assembly are checked against known inputs.
"""

from __future__ import annotations

import struct
import zlib
from pathlib import Path

import pytest

from gmzz import kscache
from gmzz.kscache import (
    LocalChunk,
    Manifest,
    PakEntry,
    Piece,
    Record,
    build,
    decode_pak_entry,
    encode_pak_entry,
    is_bucket_file,
    partition_base,
    read_local_cache,
    read_pak_index,
    write_aggregate,
    write_patch_pak,
)

KEY = bytes(range(32))


def _chunk_id(n: int, kind: int) -> bytes:
    return n.to_bytes(11, "little") + bytes([kind])


def _record(offset, data: bytes, chunk_id, owner, version, first_piece, piece_count, usize=None, kind=11) -> Record:
    return Record(offset, len(data), usize if usize is not None else len(data), kind, chunk_id,
                  zlib.crc32(data), owner, version, first_piece, piece_count)


def _piece(offset: int, csize: int, usize: int, method: int) -> bytes:
    return offset.to_bytes(5, "little") + csize.to_bytes(3, "little") + usize.to_bytes(3, "little") + bytes([method])


def _manifest(names, records, pieces: list[bytes]) -> Manifest:
    tail = struct.pack("<I", len(pieces)) + b"".join(pieces) + struct.pack("<I", 0) + struct.pack("<I", 0) + bytes(16) + struct.pack("<I", 65536)
    header = kscache.KMF_MAGIC + struct.pack("<IIIII", 6, 0, 1, 2, 3)
    return Manifest(header, list(names), ["None", "Oodle"], list(records), tail, len(pieces), 4)


# ------------------------------------------------------------------ parsers

def test_record_round_trips_including_int40_offsets():
    record = Record(5 * 2**32 + 7, 2**33, 12, 11, b"x" * 12, 0xDEADBEEF, 3, 2097705, 9, 2)
    assert Record.parse(record.pack()) == record
    assert len(record.pack()) == 48


def test_piece_parses_the_five_three_three_one_layout():
    piece = Piece.parse(_piece(2**34 + 5, 12956, 65536, 1))
    assert (piece.offset, piece.csize, piece.usize, piece.method) == (2**34 + 5, 12956, 65536, 1)


def test_manifest_round_trips_through_the_kmf_container(tmp_path):
    records = [_record(0, b"abc", _chunk_id(1, 1), 0, 2018737, 0, 1), _record(4096, b"defg", _chunk_id(2, 6), 1, 2097705, 1, 1)]
    manifest = _manifest(["Paks/a.ucas", "Paks/b.ucas"], records, [_piece(0, 3, 3, 0), _piece(0, 4, 4, 0)])
    manifest.write(tmp_path / "m.manifest")
    back = Manifest.read(tmp_path / "m.manifest")
    assert back.names == ["Paks/a.ucas", "Paks/b.ucas"]
    assert back.methods == ["None", "Oodle"]
    assert back.records == records
    assert back.pieces_of(records[1]) == [Piece(0, 4, 4, 0)]
    # The header's uncompressed size is rewritten for the new body.
    raw = (tmp_path / "m.manifest").read_bytes()
    assert struct.unpack_from("<I", raw, 8)[0] == len(zlib.decompress(raw[24:]))


def test_manifest_rejects_a_foreign_file(tmp_path):
    (tmp_path / "x.manifest").write_bytes(b"NOPE" + bytes(40))
    with pytest.raises(RuntimeError, match="not a KMF manifest"):
        Manifest.read(tmp_path / "x.manifest")


def test_local_cache_maps_chunk_ids_to_files(tmp_path):
    entries = [(_chunk_id(1, 1), 0xAA, 0, "10/000000000000000000000005_2044036"), (_chunk_id(2, 6), 0xBB, 17507770, "2097705/pakchunk0-Windows.pak")]
    raw = b"".join(struct.pack("<12sIIII", cid, crc, off, 0, len(path) + 1) + path.encode() + b"\0" for cid, crc, off, path in entries)
    (tmp_path / "local.cache").write_bytes(raw)
    local = read_local_cache(tmp_path / "local.cache")
    assert local[_chunk_id(2, 6)] == LocalChunk("2097705/pakchunk0-Windows.pak", 17507770, 0xBB)
    assert len(local) == 2


def test_partition_base_and_bucket_file_names():
    assert partition_base("Paks/pakchunk9999-Windows_s2.ucas") == ("Paks/pakchunk9999-Windows", 2)
    assert partition_base("Paks/pakchunk0-Windows.ucas") == ("Paks/pakchunk0-Windows", 0)
    assert partition_base("Paks/global.ucas") == ("Paks/global", 0)
    assert is_bucket_file("93/8fda9697d766491b00000001_2044036")
    assert not is_bucket_file("2097705/pakchunk0-Windows.pak")


# ---------------------------------------------------------------------- pak

@pytest.mark.parametrize(
    "entry",
    [
        PakEntry(0, 149895, 45671, 1, False, [12956, 16832, 15883]),
        PakEntry(2048, 8755, 1968, 1, True, [1956]),
        PakEntry(4096, 332, 332, 0, True, []),
        PakEntry(12345, 1748, 1748, 1, False, [1748]),
    ],
)
def test_encoded_pak_entry_round_trips(entry):
    reader = kscache._Reader(encode_pak_entry(entry))
    back = decode_pak_entry(reader)
    assert back == entry
    assert reader.pos == len(reader.data), "every byte written is consumed"


def test_pak_entry_struct_size_matches_the_header_written():
    for entry in (PakEntry(0, 10, 10, 0, True, []), PakEntry(0, 100, 40, 1, False, [20, 20])):
        assert len(kscache.pak_entry_header(entry, bytes(20))) == entry.struct_size


def test_patch_pak_is_read_back_by_the_index_reader(tmp_path):
    files = [
        ("C7/Content/ScriptOPCode/Data/Excel/A.luac", PakEntry(0, 300, 12, 1, False, [5, 7]), b"x" * 12),
        ("C7/Config/B.ini", PakEntry(0, 9, 9, 0, True, []), b"y" * 9),
        ("C7/Content/ScriptOPCode/Data/Excel/C.luac", PakEntry(0, 20, 20, 0, False, []), b"z" * 20),
    ]
    pak = tmp_path / "pakchunk0-Windows_1_P.pak"
    write_patch_pak(pak, files)
    index = read_pak_index(pak, KEY)
    assert sorted(index) == sorted(path for path, _, _ in files)
    raw = pak.read_bytes()
    for path, entry, data in files:
        back = index[path]
        assert (back.usize, back.csize, back.method, back.encrypted, back.blocks) == (entry.usize, entry.csize, entry.method, entry.encrypted, entry.blocks if entry.method else [])
        assert raw[back.data_offset:back.data_offset + back.csize] == data
    # A stored length that disagrees with the entry is refused, not written.
    with pytest.raises(RuntimeError, match="bytes stored against"):
        write_patch_pak(tmp_path / "bad.pak", [("C7/x", PakEntry(0, 5, 5, 0, False, []), b"toolong")])


# ------------------------------------------------------------------ assembly

def test_aggregate_places_chunks_on_aes_boundaries(tmp_path):
    ks = tmp_path / "kscache"
    (ks / "1").mkdir(parents=True)
    a, b = b"a" * 20, b"b" * 33
    (ks / "1" / "aaa").write_bytes(a)
    (ks / "1" / "bbb").write_bytes(b)
    chunks = [(_record(0, a, _chunk_id(1, 1), 0, 1, 0, 0), LocalChunk("1/aaa", 0, 0)), (_record(0, b, _chunk_id(2, 1), 0, 1, 0, 0), LocalChunk("1/bbb", 0, 0))]
    write_aggregate(tmp_path / "agg.ucas", ks, chunks)
    out = (tmp_path / "agg.ucas").read_bytes()
    assert chunks[0][0].offset == 0 and chunks[1][0].offset == 32
    assert out[0:20] == a and out[32:65] == b
    assert len(out) == 32 + 48 + 16, "each chunk padded to 16, plus a spare block at the end"


def _client(tmp_path: Path):
    """A base install with one pak and one two-partition IoStore container, and its kscache."""
    game = tmp_path / "C7"
    paks = game / "Content" / "Paks"
    paks.mkdir(parents=True)
    ks = game / "Saved" / "kscache"
    (ks / "5").mkdir(parents=True)
    (ks / "2097705").mkdir()
    (paks / "AssetsVersion.txt").write_text("1.2018737.2018737.Online_Shipping.Windows.Cdn")
    (ks / "AssetsVersion.txt").write_text("1.2018737.2097705.Weekly_Shipping")
    (game / "Content" / "Manifest_UFSFiles_Win64.txt").write_text("C7/Content/ScriptOPCode/Data/Excel/Table.luac\t2026\n")

    # The pak: two entries, one of which the patch changes.
    table_old, cfg = b"T" * 40, b"C" * 16
    pak_files = [
        ("C7/Content/ScriptOPCode/Data/Excel/Table.luac", PakEntry(0, 100, 40, 1, False, [40]), table_old),
        ("C7/Config/Game.ini", PakEntry(0, 16, 16, 0, True, []), cfg),
    ]
    write_patch_pak(paks / "pakchunk0-Windows.pak", pak_files)
    index = read_pak_index(paks / "pakchunk0-Windows.pak", KEY)

    # The IoStore container: two chunks in partition 0, one in partition 1.
    c0, c1, c2 = b"0" * 64, b"1" * 32, b"2" * 48
    (paks / "pakchunk9999-Windows.ucas").write_bytes(c0 + c1)
    (paks / "pakchunk9999-Windows_s1.ucas").write_bytes(c2)

    names = ["Paks/pakchunk0-Windows.pak", "Paks/pakchunk9999-Windows.ucas", "Paks/pakchunk9999-Windows_s1.ucas"]
    ids = {k: _chunk_id(i + 1, kind) for i, (k, kind) in enumerate([("table", 7), ("cfg", 14), ("c0", 6), ("c1", 1), ("c2", 1)])}
    base_records = [
        _record(index[pak_files[0][0]].data_offset, table_old, ids["table"], 0, 2018737, 0, 1, usize=100, kind=0),
        _record(index[pak_files[1][0]].data_offset, cfg, ids["cfg"], 0, 2018737, 1, 0, kind=0),
        _record(0, c0, ids["c0"], 1, 2018737, 1, 1),
        _record(64, c1, ids["c1"], 1, 2018737, 2, 1),
        _record(0, c2, ids["c2"], 2, 2018737, 3, 1),
    ]
    pieces = [_piece(0, 40, 100, 1), _piece(0, 64, 64, 0), _piece(0, 32, 32, 0), _piece(0, 48, 48, 0), _piece(0, 44, 100, 1), _piece(0, 80, 80, 0)]
    _manifest(names, base_records, pieces).write(game / "Content" / "package.manifest")

    # The patch: a new table (in the pack file), a new c0 (a bucket file), c1 changed but not downloaded, c2 untouched.
    table_new, c0_new = b"N" * 44, b"9" * 80
    pack = b"\xff" * 8 + table_new
    (ks / "2097705" / "pakchunk0-Windows.pak").write_bytes(pack)
    bucket = f"{ids['c0'].hex()}_2097705"
    (ks / "5" / bucket).write_bytes(c0_new)
    live_records = [
        _record(0, table_new, ids["table"], 0, 2097705, 4, 1, usize=100, kind=0),
        base_records[1],
        _record(0, c0_new, ids["c0"], 1, 2097705, 5, 1),
        Record(64, 32, 32, 11, ids["c1"], 0x1234, 1, 2097705, 2, 1),
        base_records[4],
    ]
    _manifest(names, live_records, pieces).write(ks / "package_2018737.manifest")
    local = [(ids["table"], zlib.crc32(table_new), 8, "2097705/pakchunk0-Windows.pak"), (ids["c0"], zlib.crc32(c0_new), 0, f"5/{bucket}")]
    (ks / "local.cache").write_bytes(b"".join(struct.pack("<12sIIII", cid, crc, off, 0, len(p) + 1) + p.encode() + b"\0" for cid, crc, off, p in local))
    return game, ids, table_new, c0_new


def test_build_assembles_the_patched_view(tmp_path):
    game, ids, table_new, c0_new = _client(tmp_path)
    out = tmp_path / "patched"
    report = build(game, out, KEY)

    assert (report.base, report.live) == (2018737, 2097705)
    content = out / "C7" / "Content"
    # The base containers and file list are linked in, not copied.
    for name in ("pakchunk0-Windows.pak", "pakchunk9999-Windows.ucas", "pakchunk9999-Windows_s1.ucas"):
        assert (content / "Paks" / name).stat().st_ino == (game / "Content" / "Paks" / name).stat().st_ino
    assert (content / "Manifest_UFSFiles_Win64.txt").exists()
    assert (content / "package.txt").read_text() == "2097705"

    # The patch pak carries the changed table under its base-index name.
    patch = read_pak_index(content / "Paks" / kscache.PATCH_PAK_NAME, KEY)
    assert list(patch) == ["C7/Content/ScriptOPCode/Data/Excel/Table.luac"]
    entry = patch["C7/Content/ScriptOPCode/Data/Excel/Table.luac"]
    raw = (content / "Paks" / kscache.PATCH_PAK_NAME).read_bytes()
    assert raw[entry.data_offset:entry.data_offset + entry.csize] == table_new
    assert (entry.usize, entry.csize, entry.method, entry.blocks) == (100, 44, 1, [44])
    assert report.pak_patched == 1 and report.pak_missing == 0

    # The synthesized manifest re-points c0 at an aggregate partition, drops c1, leaves c2.
    synth = Manifest.read(content / "package.manifest")
    by_id = {r.chunk_id: r for r in synth.records}
    c0 = by_id[ids["c0"]]
    assert synth.names[c0.owner] == "Paks/pakchunk9999-Windows_s2.ucas"
    assert c0.offset == 0 and c0.piece_count == 1
    assert (content / "Paks" / "pakchunk9999-Windows_s2.ucas").read_bytes()[:80] == c0_new
    assert by_id[ids["c1"]].piece_count == 0, "a chunk not yet downloaded is dropped rather than misread"
    assert by_id[ids["c2"]] == Manifest.read(game / "Content" / "package.manifest").records[4]
    assert report.iostore_patched == 1 and report.iostore_missing == 1 and report.partitions == 1


def test_build_refuses_an_unpatched_install(tmp_path):
    game, *_ = _client(tmp_path)
    (game / "Saved" / "kscache" / "package_2018737.manifest").unlink()
    with pytest.raises(RuntimeError, match="has not patched"):
        build(game, tmp_path / "out", KEY)
