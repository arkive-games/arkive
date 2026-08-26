"""Shared helpers for the Ragnarok Online 3 pipeline.

The JSON writers are deliberately byte-compatible with the other pipelines'
output (``JSON.stringify(obj, null, 1)``): raw UTF-8, 1-space indent, and no
``.0`` on integral numbers.
"""

from __future__ import annotations

import json
import math
from pathlib import Path


def round2(v: float) -> float:
    """2-decimal round matching JS ``Math.round(v*100)/100`` (half toward +Inf)."""
    return math.floor(v * 100 + 0.5) / 100


def from_f32(v: float) -> float:
    """Drop the expansion noise ``struct.unpack('<f')`` leaves when widening to float64.

    A stored 0.08 comes back as 0.07999999821186066 and serializes in full, so a
    frontend formatting it as a percentage renders ``7.999999821186066%``. Seven
    significant digits is exactly what float32 guarantees, so this restores the
    authored value without inventing precision. ``round2`` is the wrong tool here:
    these are stat multipliers, and it would turn a 0.5% bonus into 1%.
    """
    return float(f"{v:.7g}")


def _canon(o):
    # Render integral floats as ints (JS: `1.0` serializes as `1`).
    if isinstance(o, bool):
        return o
    if isinstance(o, float):
        return int(o) if o.is_integer() else o
    if isinstance(o, dict):
        return {k: _canon(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_canon(v) for v in o]
    return o


def dumps(obj) -> str:
    """JSON string matching ``JSON.stringify(obj, null, 1)``."""
    return json.dumps(_canon(obj), ensure_ascii=False, indent=1)


def write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(dumps(obj), encoding="utf-8")


def read_json(path: Path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)
