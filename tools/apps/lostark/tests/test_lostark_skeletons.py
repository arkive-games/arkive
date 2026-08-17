"""Contract tests for UE3 bone-hierarchy recovery.

Synthetic tails, so they run without an extraction. Several cases exist because
a Codex review showed the original validation was weaker than it claimed: the
declared child counts were never compared with the parent links, so a blob whose
two disagreed entirely still passed.
"""

import struct

from lostark.skeletons import STRIDE, find_skeleton

NAMES = ["b_root", "bip001", "bip001-pelvis", "b_hand", "b_foot", "noise"]


def bone(name_idx=0, name_num=0, quat=(0.0, 0.0, 0.0, 1.0), pos=(1.0, 2.0, 3.0),
         children=0, parent=0) -> bytes:
    return (
        struct.pack("<ii", name_idx, name_num)
        + struct.pack("<i", 0)
        + struct.pack("<4f", *quat)
        + struct.pack("<3f", *pos)
        + struct.pack("<ii", children, parent)
        + b"\xff\xff\xff\xff"
    )


def chain(count: int, prefix: bytes = b"") -> bytes:
    """A simple parent-chain skeleton: 0 <- 1 <- 2 <- ..."""
    out = prefix + struct.pack("<i", count)
    for i in range(count):
        kids = 0 if i == count - 1 else 1
        out += bone(name_idx=i % len(NAMES), children=kids, parent=max(i - 1, 0))
    return out


def test_reads_a_valid_chain():
    bones, why = find_skeleton(chain(12), NAMES)
    assert why == ""
    assert bones is not None and len(bones) == 12
    assert bones[0].name == "b_root" and bones[0].parent == 0
    assert bones[5].parent == 4


def test_child_counts_must_match_the_parent_links():
    """The check that `sum(children) == count-1` alone cannot make.

    Every parent points backwards and the counts still sum to count-1, so the
    weaker test passes; only comparing per-bone counts against the actual links
    rejects it.
    """
    count = 8
    blob = struct.pack("<i", count)
    for i in range(count):
        # All children attributed to bone 0, but the links form a chain.
        blob += bone(children=count - 1 if i == 0 else 0, parent=max(i - 1, 0))
    bones, why = find_skeleton(blob, NAMES, scan_limit=0)
    assert bones is None
    assert "no valid bone array" in why


def test_rejects_a_root_pointing_at_a_later_bone():
    """A cycle the parents-precede-children rule cannot see on its own."""
    count = 8
    blob = struct.pack("<i", count)
    for i in range(count):
        parent = 7 if i == 0 else i - 1
        blob += bone(children=1 if i < count - 1 else 0, parent=parent)
    bones, _ = find_skeleton(blob, NAMES, scan_limit=0)
    assert bones is None


def test_rejects_nan_translations():
    """abs(nan) > 1e5 is False, so a magnitude test alone lets NaN through."""
    count = 8
    blob = struct.pack("<i", count)
    for i in range(count):
        pos = (float("nan"), 0.0, 0.0) if i == 3 else (1.0, 1.0, 1.0)
        blob += bone(children=1 if i < count - 1 else 0, parent=max(i - 1, 0), pos=pos)
    bones, _ = find_skeleton(blob, NAMES, scan_limit=0)
    assert bones is None


def test_rejects_non_unit_quaternions():
    count = 8
    blob = struct.pack("<i", count)
    for i in range(count):
        quat = (5.0, 0.0, 0.0, 0.0) if i == 2 else (0.0, 0.0, 0.0, 1.0)
        blob += bone(children=1 if i < count - 1 else 0, parent=max(i - 1, 0), quat=quat)
    bones, _ = find_skeleton(blob, NAMES, scan_limit=0)
    assert bones is None


def test_all_zero_bytes_are_not_a_skeleton():
    bones, _ = find_skeleton(b"\x00" * (4 + STRIDE * 40), NAMES)
    assert bones is None


def test_prefers_the_longest_candidate_over_an_earlier_short_one():
    """Returning the first match would hand back the decoy.

    The short array really is valid, so it is only distinguishable by being
    smaller — which is why the scan keeps looking instead of stopping.
    """
    decoy = chain(8)
    real = chain(60)
    bones, _ = find_skeleton(decoy + real, NAMES)
    assert bones is not None and len(bones) == 60


def test_reports_the_scan_limit_rather_than_a_bare_failure():
    """A skeleton past the cap must be distinguishable from malformed data."""
    tail = b"\x00" * 300 + chain(20)
    bones, why = find_skeleton(tail, NAMES, scan_limit=10)
    assert bones is None
    assert "first 10 bytes" in why


def test_rejects_a_name_index_outside_the_table():
    blob = chain(10, prefix=b"")
    bad = bytearray(blob)
    struct.pack_into("<i", bad, 4, len(NAMES) + 5)  # first bone's name index
    bones, _ = find_skeleton(bytes(bad), NAMES, scan_limit=0)
    assert bones is None
