"""Recover bone hierarchies from UE3 ``SkeletalMesh`` exports.

Input is what ``laex body <upk> --name _sk --out <dir>`` writes: one
``*.tail.bin`` per export plus ``names.txt``. UE3 tags only the property block,
so the skeleton lives in the untagged tail with nothing announcing where it
starts — the array is located by scanning and then *validated*, never assumed.

Only the skeleton is decoded. The vertex and index buffers of
``FStaticLODModel`` are NOT: an attempt to locate them by scanning for
in-bounds float triples matched packed tangents instead of positions (X and Y
ran 0..1 with a standard deviation of 0.01), which produced a mesh that
rendered as nothing. That failure is recorded here because it is the same
mistake twice: containment in a box that includes the origin accepts any run of
near-zero floats, exactly as containment in a map's AABB accepted six different
byte offsets. Getting the mesh out wants the real field order — from umodel's
UE3 reader — not another scan.

Layout, verified against ``pc_ft_00_sk`` (207 bones) and 101 other meshes:
stock UE3 apart from a 52-byte bone record rather than 48, the extra four bytes
being ``FColor BoneColor``.
"""

from __future__ import annotations

import math
import struct
from dataclasses import dataclass
from pathlib import Path

# FName(8) + flags(4) + FQuat(16) + FVector(12) + numChildren(4) + parent(4) + FColor(4)
STRIDE = 52

# How far into the tail to look. The array sits at +92 on every mesh seen, so
# this is generous; :func:`find_skeleton` reports the cap rather than returning
# a bare "not found", so a miss is distinguishable from a malformed record.
SCAN_LIMIT = 8192

# FName instance numbers and bone counts are bounded to keep the scan cheap.
# These are parser heuristics, not guarantees of the format: a real mesh
# exceeding them would be rejected, which is why exceeding them is reported.
MAX_NAME_NUMBER = 1 << 20
MAX_BONES = 4096


@dataclass(frozen=True)
class Bone:
    name: str
    parent: int
    children: int
    pos: tuple[float, float, float]
    quat: tuple[float, float, float, float]


def _candidate(tail: bytes, names: list[str], off: int) -> list[Bone] | None:
    """The bone array at ``off``, or ``None`` if it fails any check."""
    if off + 4 > len(tail):
        return None
    count = struct.unpack_from("<i", tail, off)[0]
    if not (8 <= count <= MAX_BONES) or off + 4 + count * STRIDE > len(tail):
        return None

    bones: list[Bone] = []
    for i in range(count):
        rec = off + 4 + i * STRIDE
        name_idx, name_num = struct.unpack_from("<ii", tail, rec)
        if not (0 <= name_idx < len(names)) or not (0 <= name_num <= MAX_NAME_NUMBER):
            return None
        quat = struct.unpack_from("<4f", tail, rec + 12)
        if not all(math.isfinite(c) for c in quat):
            return None
        if not 0.9 < math.sqrt(sum(c * c for c in quat)) < 1.1:
            return None
        pos = struct.unpack_from("<3f", tail, rec + 28)
        # isfinite first: abs(nan) > 1e5 is False, so a bare magnitude test lets
        # NaN through and poisons every transform computed from it downstream.
        if not all(math.isfinite(c) and abs(c) < 1e5 for c in pos):
            return None
        children, parent = struct.unpack_from("<ii", tail, rec + 40)
        if not (0 <= parent < count) or not (0 <= children < count):
            return None
        # Root's parent is itself; everyone else points strictly backwards. The
        # root check matters: without it bone 0 may point at a later bone and
        # form a cycle that the ordering rule alone cannot see.
        if i == 0 and parent != 0:
            return None
        if i > 0 and parent >= i:
            return None
        bones.append(Bone(names[name_idx], parent, children, pos, quat))

    # The declared child counts must match the hierarchy the parents describe.
    # Summing them to count-1 does NOT establish this — the sum is satisfied by
    # any distribution, so a blob whose numChildren disagree entirely with its
    # parent links passes that weaker test.
    actual = [0] * count
    for i, bone in enumerate(bones):
        if i:
            actual[bone.parent] += 1
    if any(actual[i] != bones[i].children for i in range(count)):
        return None
    return bones


def find_skeleton(
    tail: bytes, names: list[str], scan_limit: int = SCAN_LIMIT
) -> tuple[list[Bone] | None, str]:
    """The best bone array in ``tail``, plus a reason when there is none.

    Returns the LONGEST valid candidate, not the first: a short spurious array
    earlier in the tail would otherwise win and yield a silently wrong skeleton
    with real-looking bone names.
    """
    if len(tail) < 4 + STRIDE:
        return None, "tail too short to hold a bone array"
    best: list[Bone] | None = None
    for off in range(0, min(len(tail) - 4, scan_limit) + 1):
        found = _candidate(tail, names, off)
        if found and (best is None or len(found) > len(best)):
            best = found
    if best is None:
        return None, f"no valid bone array in the first {scan_limit} bytes"
    return best, ""


def load_dump(directory: Path) -> tuple[list[str], list[Path]]:
    """The name table and every ``*.tail.bin`` in a ``laex body`` output."""
    names_file = directory / "names.txt"
    if not names_file.exists():
        raise FileNotFoundError(f"{names_file} is missing; run `laex body --out {directory}` first")
    names = names_file.read_text(encoding="utf-8", errors="replace").splitlines()
    return names, sorted(directory.glob("*.tail.bin"))


def as_json(mesh: str, package: str, bones: list[Bone]) -> dict[str, object]:
    return {
        "mesh": mesh,
        "package": package,
        "boneCount": len(bones),
        "bones": [
            {
                "name": b.name,
                "parent": b.parent,
                "children": b.children,
                "pos": list(b.pos),
                "quat": list(b.quat),
            }
            for b in bones
        ],
    }
