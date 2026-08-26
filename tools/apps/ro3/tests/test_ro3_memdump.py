"""Tests for the read-only memory scanner's pure logic.

Nothing here touches a process: the carving is what decides whether a dumped region is worth
keeping, so it is the part worth pinning down.
"""

from __future__ import annotations

import ro3.memdump as md


def test_carve_finds_serialized_files_and_cabs():
    blob = b"\x00" * 32 + b"2022.3.62f3\x00" + b"\x11" * 8 + b"CAB-7e7da790" + b"\x00" * 16
    hits = md.carve(blob)
    kinds = sorted({k for _o, k in hits})

    assert kinds == ["cab", "serialized-file"]
    assert (32, "serialized-file") in hits


def test_carve_reports_every_occurrence():
    blob = b"CAB-a" + b"\x00" * 4 + b"CAB-b"
    assert [o for o, k in md.carve(blob) if k == "cab"] == [0, 9]


def test_carve_ignores_regions_without_unity_data():
    assert md.carve(bytes(range(256)) * 4) == []


def test_module_declares_read_only_access_only():
    # Guard the promise in the docstring: no write/inject primitives may creep in.
    src = (md.__file__ and open(md.__file__, encoding="utf-8").read()) or ""
    for forbidden in (
        "WriteProcessMemory",
        "CreateRemoteThread",
        "VirtualAllocEx",
        "VirtualProtectEx",
        "SuspendThread",
    ):
        assert forbidden not in src, forbidden
    assert "PROCESS_VM_WRITE" not in src
    assert "PROCESS_VM_READ" in src


def test_carve_accepts_only_decrypted_il2cpp_metadata():
    # decrypted: real IL2CPP version follows the magic
    good = md.IL2CPP_MAGIC + (29).to_bytes(4, "little") + b"\x00" * 32
    assert ("il2cpp-metadata" in {k for _o, k in md.carve(good)})

    # the shipped file keeps the magic but its version field is garbage - must NOT match,
    # otherwise every scan would flag the encrypted copy mapped from disk
    bad = md.IL2CPP_MAGIC + (1813808443).to_bytes(4, "little") + b"\x00" * 32
    assert "il2cpp-metadata" not in {k for _o, k in md.carve(bad)}
