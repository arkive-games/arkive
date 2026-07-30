"""Shared helpers for the STS2 pipeline.

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


def models_by_group(raw: Path, group: str) -> list[dict]:
    """The mined model list for one group of ``models.json`` (Cards, Characters, …).

    ``raw`` is ``STS2_RAW`` — a gdex export root, which holds ``models.json``
    beside the mirrored ``res/`` tree.
    """
    data = read_json(Path(raw) / "models.json")
    return data.get("groups", {}).get(group, {}).get("models", [])
