"""EFTable_ItemLevelOption -> gear stats indexed by item level, then piece id.

``SecondaryKey`` is the item level and ``PrimaryKey`` identifies the piece. The
game stores the same main-stat value once per class stat type (``Str``/``Agi``/
``Int``), which collapses to a single ``main`` — the distinction is which classes
can wear the piece, not a different number.

``Def`` and ``Res`` are kept even though combat power does not use them; they cost
nothing to carry and the fan site's decision to drop them is not worth copying.
"""

from __future__ import annotations

from collections import defaultdict

from .db import Tables


def extract(tables: Tables) -> dict[str, dict[str, dict[str, int]]]:
    """Gear stats as ``{item_level: {piece_id: {stat: value}}}``."""
    out: dict[str, dict[str, dict[str, int]]] = defaultdict(dict)

    for row in tables.read("ItemLevelOption"):
        level = str(row["SecondaryKey"])
        piece = str(row["PrimaryKey"])

        entry: dict[str, int] = {}
        main = row["Str"] or row["Agi"] or row["Int"]
        if main:
            entry["main"] = main
        if row["Con"]:
            entry["vitality"] = row["Con"]
        if row["MaxDam"]:
            entry["weapon_attack"] = row["MaxDam"]
        if row["Def"]:
            entry["defence"] = row["Def"]
        if row["Res"]:
            entry["resistance"] = row["Res"]

        if entry:
            out[level][piece] = entry

    return {level: dict(sorted(out[level].items())) for level in sorted(out, key=int)}
