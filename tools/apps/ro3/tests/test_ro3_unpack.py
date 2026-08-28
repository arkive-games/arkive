"""Tests for emitting decrypted, standard bundles.

The contract these pin down is the one everything downstream relies on: an output file is
byte-identical to its input except for the first ``min(len(block0), 1280)`` bytes, so a
reader that knows nothing about RO3V or FairGuard opens it as an ordinary UnityFS bundle.

The cipher itself is replaced by a fake here — the real one needs the game's DLL, and is
covered by ``test_ro3_keygen.py``. What is under test is the surgery, not the key.
"""

from __future__ import annotations

import struct

import pytest

from ro3 import unpack
from ro3.bundle import BundleError, parse
from ro3.tests.test_ro3_keygen import build_bundle


@pytest.fixture
def fake_cipher(monkeypatch):
    """Replace block-0 decryption with a visible, reversible marker."""
    def decrypt(block0: bytes) -> bytes:
        n = min(len(block0), 1280)
        return bytes(b ^ 0xFF for b in block0[:n]) + block0[n:]

    monkeypatch.setattr(unpack, "decrypt_block0", decrypt)
    return decrypt


def test_only_block_zero_changes(fake_cipher):
    payload = bytes(range(256)) * 8
    image = build_bundle(payload)
    out = unpack.decrypt_image(image, verify=False)

    info = parse(image)
    start, end = info.block0_span
    assert len(out) == len(image)
    assert out[:start] == image[:start], "the header and block-info table must be untouched"
    assert out[end:] == image[end:], "everything after block 0 must be untouched"
    assert out[start:end] != image[start:end]


def test_the_output_is_still_a_readable_bundle(fake_cipher):
    image = build_bundle(b"payload" * 32, node_path="CAB-abc")
    out = unpack.decrypt_image(image, verify=False)

    info = parse(out)
    assert info.unity_revision == "2022.3.62f3"
    assert [n.path for n in info.nodes] == ["CAB-abc"]
    assert info.size == len(out)


def test_a_block_longer_than_the_cipher_keeps_its_tail(fake_cipher):
    payload = bytes(256) + bytes(range(256)) * 12  # > 1280 bytes
    image = build_bundle(payload)
    start, _end = parse(image).block0_span
    out = unpack.decrypt_image(image, verify=False)

    assert out[start + 1280:] == image[start + 1280:]
    assert out[start:start + 1280] != image[start:start + 1280]


def test_verification_rejects_a_block_that_does_not_decompress(monkeypatch):
    """The LZ4 oracle is what makes a decryption checkable without knowing the plaintext."""
    monkeypatch.setattr(unpack, "decrypt_block0", lambda b: b"\x00" * len(b))
    image = build_bundle(b"\x50hello", node_path="CAB-x")
    # Mark block 0 as LZ4 so the oracle runs: flags live in the block-info table.
    patched = bytearray(image)
    info = parse(image)
    offset = patched.index(struct.pack(">IIH", len(b"\x50hello"), len(b"\x50hello"), 0))
    struct.pack_into(">IIH", patched, offset, 5, len(b"\x50hello"), 3)
    assert parse(bytes(patched)).blocks[0].compression == 3
    assert info.blocks[0].compression == 0

    with pytest.raises(ValueError):
        unpack.decrypt_image(bytes(patched), verify=True)


def test_a_truncated_block_is_reported_rather_than_padded(fake_cipher):
    image = build_bundle(b"payload" * 32)
    with pytest.raises(BundleError, match="block 0 runs to"):
        unpack.decrypt_image(image[:-16], verify=False)


# --------------------------------------------------------------------- output naming

def test_a_container_sub_file_is_named_by_index_and_id(tmp_path):
    target = unpack._relative_target(
        tmp_path / "stage", tmp_path / "vfs" / "0a" / "abc.bundle", tmp_path / "vfs",
        7, 0xE8D00087546FA3D9,
    )
    assert target == tmp_path / "stage" / "0a" / "abc" / "00007_e8d00087546fa3d9.bundle"


def test_a_bare_bundle_keeps_its_name(tmp_path):
    target = unpack._relative_target(
        tmp_path / "stage", tmp_path / "vfs" / "0a" / "abc.bundle", tmp_path / "vfs", None, None
    )
    assert target == tmp_path / "stage" / "0a" / "abc.bundle"


def test_a_bare_bundle_under_another_extension_gains_one():
    """The 337 .hd/.ld/.korean bundles are real UnityFS images; a suffix-driven reader
    such as unex walks past them unless they are named .bundle."""
    from pathlib import Path

    target = unpack._relative_target(
        Path("/stage"), Path("/vfs/0a/abc.bundle.korean"), Path("/vfs"), None, None
    )
    assert target.name == "abc.bundle.korean.bundle"
