"""Tests for the block-0 keystream generator and the bundle reader it feeds.

Everything except the last two tests runs without the game installed: the pure Python half
of the cipher (RC4 with FairGuard's twist, the chunk-word XOR, the 0xA6 prefix) is exercised
against fixed key material, and the UnityFS reader against a synthetic image.

The two that do need the game are skipped when ``RO3_GAME`` is unset. They are the ones
that matter most, because they check the recovered cipher against the shipped bytes rather
than against itself.
"""

from __future__ import annotations

import struct

import pytest

from ro3 import bundle, keygen
from ro3.env import optional_dir  # importing it also loads tools/.env

KEY = b"\x11\x22\x33\x44"


# --------------------------------------------------------------------------- pure cipher

def test_rc4_chunk_is_a_prefix_of_itself():
    """The stream is generated forward, so a longer request extends a shorter one."""
    assert keygen.rc4_chunk(KEY, 64)[:16] == keygen.rc4_chunk(KEY, 16)


def test_rc4_chunk_matches_textbook_rc4_with_the_rol_sub_twist():
    """Recompute the twist independently: rol8(b, 1) - 0x61 applied to plain RC4."""
    s = list(range(256))
    j = 0
    for i in range(256):
        j = (j + KEY[i % 4] + s[i]) & 0xFF
        s[i], s[j] = s[j], s[i]
    plain = []
    i = j = 0
    for _ in range(32):
        i = (i + 1) & 0xFF
        j = (j + s[i]) & 0xFF
        s[i], s[j] = s[j], s[i]
        plain.append(s[(s[i] + s[j]) & 0xFF])

    twisted = bytes(((((b << 1) | (b >> 7)) & 0xFF) - 0x61) & 0xFF for b in plain)
    assert keygen.rc4_chunk(KEY, 32) == twisted


def test_rc4_chunk_depends_on_every_key_byte():
    base = keygen.rc4_chunk(KEY, 32)
    for i in range(4):
        other = bytearray(KEY)
        other[i] ^= 0x01
        assert keygen.rc4_chunk(bytes(other), 32) != base


def test_keystream_prefix_is_the_constant_a6():
    ks = keygen.keystream_from_params(KEY, [], n=64)
    assert ks == bytes([keygen.PREFIX_BYTE]) * 64


def test_uncovered_bytes_keep_the_prefix_byte():
    """Only the chunks the protector emits are replaced; the rest stays 0xA6."""
    ks = keygen.keystream_from_params(KEY, [(32, 16, b"\0\0\0\0", b"")], n=64)
    assert ks[:32] == bytes([keygen.PREFIX_BYTE]) * 32
    assert ks[48:] == bytes([keygen.PREFIX_BYTE]) * 16


def test_a_chunk_is_rc4_xor_the_repeating_word():
    word = b"\xde\xad\xbe\xef"
    ks = keygen.keystream_from_params(KEY, [(32, 16, word, b"")], n=64)
    expected = bytes(a ^ b for a, b in zip(keygen.rc4_chunk(KEY, 16), word * 4))
    assert ks[32:48] == expected


def test_a_chunk_tail_is_carried_verbatim():
    """The SSE pass covers whole 16-byte lanes; a short trailing lane keeps its own residual."""
    word = b"\x01\x02\x03\x04"
    tail = b"\x77\x88\x99\xaa"
    ks = keygen.keystream_from_params(KEY, [(32, 20, word, tail)], n=64)
    rc4 = keygen.rc4_chunk(KEY, 20)
    assert ks[32:48] == bytes(a ^ b for a, b in zip(rc4[:16], word * 4))
    assert ks[48:52] == bytes(a ^ b for a, b in zip(rc4[16:], tail))


def test_keystream_from_params_is_deterministic():
    chunks = [(32, 96, b"\x01\x02\x03\x04", b""), (128, 288, b"\x05\x06\x07\x08", b"")]
    first = keygen.keystream_from_params(KEY, chunks, n=keygen.ENC_LEN)
    assert first == keygen.keystream_from_params(KEY, chunks, n=keygen.ENC_LEN)
    assert len(first) == keygen.ENC_LEN


def test_obfuscated_length_saturates_at_the_cipher_length():
    assert keygen.obfuscated_length(100) == 100
    assert keygen.obfuscated_length(keygen.ENC_LEN) == keygen.ENC_LEN
    assert keygen.obfuscated_length(keygen.ENC_LEN * 4) == keygen.ENC_LEN


def test_keystream_rejects_a_head_that_is_not_32_bytes():
    with pytest.raises(ValueError, match="32 bytes"):
        keygen.keystream(b"\x00" * 31)


def test_decrypt_block0_rejects_a_block_shorter_than_the_head():
    with pytest.raises(ValueError, match="shorter than"):
        keygen.decrypt_block0(b"\x00" * 16)


# ------------------------------------------------------------------------ bundle reader

def build_bundle(block_payload: bytes, *, node_path: str = "CAB-test") -> bytes:
    """A minimal, uncompressed UnityFS image with one block and one node."""
    info = bytearray(b"\x00" * 16)  # hash
    info += struct.pack(">I", 1)
    info += struct.pack(">IIH", len(block_payload), len(block_payload), 0)
    info += struct.pack(">I", 1)
    info += struct.pack(">qqI", 0, len(block_payload), 4) + node_path.encode() + b"\0"

    head = b"UnityFS\0" + struct.pack(">I", 7) + b"5.x.x\0" + b"2022.3.62f3\0"
    # size is patched once the total is known
    prefix = head + struct.pack(">q", 0) + struct.pack(">III", len(info), len(info), 0)
    pad = (-len(prefix)) % 16  # version >= 7 aligns the block-info table to 16
    image = prefix + b"\0" * pad + bytes(info) + block_payload
    size_at = len(head)
    return image[:size_at] + struct.pack(">q", len(image)) + image[size_at + 8:]


def test_parse_reads_blocks_nodes_and_the_block0_span():
    payload = b"PAYLOAD!" * 8
    image = build_bundle(payload)
    info = bundle.parse(image)

    assert info.version == 7
    assert info.unity_revision == "2022.3.62f3"
    assert info.size == len(image)
    assert len(info.blocks) == 1
    assert info.blocks[0].compression == 0
    assert [n.path for n in info.nodes] == ["CAB-test"]
    start, end = info.block0_span
    assert image[start:end] == payload


def test_parse_rejects_a_non_bundle():
    with pytest.raises(bundle.BundleError, match="not a UnityFS"):
        bundle.parse(b"RO3V" + b"\0" * 64)


def test_lz4_round_trip_against_a_known_vector():
    """Literal-only frame: token 0x50 = 5 literals, no match."""
    assert bundle.lz4_block_decompress(b"\x50hello", 5) == b"hello"


def test_lz4_rejects_a_short_result():
    with pytest.raises(ValueError, match="expected"):
        bundle.lz4_block_decompress(b"\x50hello", 6)


# ------------------------------------------------------------- against the shipped game

needs_game = pytest.mark.skipif(
    optional_dir("RO3_GAME") is None,
    reason="RO3_GAME is unset: the game is not installed here",
)


@needs_game
def test_the_shipped_bundles_decrypt_and_pass_the_lz4_oracle():
    """Decrypt real block-0s and require each to decompress to its declared size.

    This is the honest end-to-end check: nothing about the plaintext is assumed, and a
    wrong keystream cannot land on the exact uncompressed length by accident.
    """
    from ro3.env import require_dir
    from ro3.unpack import decrypt_image
    from ro3.vfs import UNITYFS_MAGIC, iter_bundles, read_slice

    root = require_dir("RO3_GAME") / "StreamingAssets" / "VFS"
    checked = 0
    for path, sl in iter_bundles(root):
        image = path.read_bytes() if sl is None else read_slice(path, sl)
        if not image.startswith(UNITYFS_MAGIC):
            continue
        info = bundle.parse(image)
        if info.blocks[0].compression not in (2, 3):
            continue
        decrypt_image(image, verify=True)  # raises when the oracle rejects it
        checked += 1
        if checked >= 25:
            break
    assert checked >= 25, f"only {checked} compressed block-0s were reachable"


@needs_game
def test_the_keystream_starts_with_the_constant_prefix_on_real_key_material():
    """0xA6 for the first 32 bytes is the one part of the keystream that is global."""
    from ro3.env import require_dir
    from ro3.vfs import UNITYFS_MAGIC, iter_bundles, read_slice

    root = require_dir("RO3_GAME") / "StreamingAssets" / "VFS"
    for path, sl in iter_bundles(root):
        image = path.read_bytes() if sl is None else read_slice(path, sl)
        if not image.startswith(UNITYFS_MAGIC):
            continue
        info = bundle.parse(image)
        start, end = info.block0_span
        n = keygen.obfuscated_length(end - start)
        ks = keygen.keystream(image[start:start + keygen.PREFIX_LEN], n)
        assert len(ks) == n
        assert ks[: keygen.PREFIX_LEN] == bytes([keygen.PREFIX_BYTE]) * keygen.PREFIX_LEN
        # ...and it is a pure function of (head, n): a second call must agree exactly.
        assert keygen.keystream(image[start:start + keygen.PREFIX_LEN], n) == ks
        return
    pytest.fail("no UnityFS sub-file found under RO3_GAME")
