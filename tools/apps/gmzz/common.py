"""Shared helpers for the GMZZ pipeline.

The JSON writers match the other pipelines' formatting (``JSON.stringify(obj,
null, 1)``): raw UTF-8, 1-space indent, and no ``.0`` on integral numbers.

They differ in one way, deliberately: keys are sorted. The client stores rows in
Lua hash tables, whose iteration order is arbitrary between runs, so unsorted
output would churn the content digest — and every browser's cache with it — even
when nothing changed.
"""

from __future__ import annotations

import json
from pathlib import Path


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
    return json.dumps(_canon(obj), ensure_ascii=False, indent=1, sort_keys=True)


def write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(dumps(obj), encoding="utf-8")


def read_json(path: Path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def is_nonempty_file(path: Path) -> bool:
    return path.is_file() and path.stat().st_size > 0


def ordered_rows(payload):
    """Rows keyed by a numeric id become a list sorted by that id.

    The client stores them in a hash table, so iteration order is arbitrary and
    would otherwise churn the content digest on every run.
    """
    if isinstance(payload, dict) and payload and all(k.lstrip("-").isdigit() for k in payload):
        return [payload[k] for k in sorted(payload, key=int)]
    return payload
