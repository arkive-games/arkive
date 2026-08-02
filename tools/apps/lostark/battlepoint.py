"""EFTable_BattlePoint -> per-role combat power coefficients.

``PrimaryKey`` selects the role (1 = damage dealer, 2 = support). ``Type`` selects
which coefficient the row carries. The game stores rates as scaled integers, so
each Type carries its own divisor.

Only the Types below are decoded. The table has 35 distinct Types; the rest cover
systems this pipeline does not emit yet (engravings, gems, accessories, honing).
Undecoded rows are ignored rather than guessed at.
"""

from __future__ import annotations

from collections import defaultdict

from .db import Tables

DPS = "dps"
SUPPORT = "support"

_ROLE_BY_PRIMARY_KEY = {1: DPS, 2: SUPPORT}

# Type -> (output key, divisor). One row per role; ValueA holds the scaled rate.
_SCALARS = {
    1: ("base_rate", 1_000_000),
    2: ("heal_rate", 10_000),
    5: ("evolution_rate", 10_000),
    6: ("enlightenment_rate", 10_000),
    7: ("leap_rate", 10_000),
    9: ("leap_karma_rate", 10_000),
}

# ValueA = combat level, ValueB = amp x 1e-4. Levels 55-70.
_TYPE_COMBAT_LEVEL = 3

# ValueA = ArkGridCore id, ValueB = activated points, ValueC = amp x 1e-4.
_TYPE_ARK_CORE = 29

_RATE_DIVISOR = 10_000


def extract(tables: Tables) -> dict[str, dict]:
    """Combat power coefficients keyed by role."""
    out: dict[str, dict] = {DPS: {}, SUPPORT: {}}
    levels: dict[str, dict[str, float]] = defaultdict(dict)
    cores: dict[str, dict[str, dict[str, float]]] = defaultdict(lambda: defaultdict(dict))

    for row in tables.read("BattlePoint"):
        role = _ROLE_BY_PRIMARY_KEY.get(row["PrimaryKey"])
        if role is None:
            continue
        kind = row["Type"]

        if kind in _SCALARS:
            key, divisor = _SCALARS[kind]
            out[role][key] = row["ValueA"] / divisor
        elif kind == _TYPE_COMBAT_LEVEL:
            levels[role][str(row["ValueA"])] = row["ValueB"] / _RATE_DIVISOR
        elif kind == _TYPE_ARK_CORE:
            core = str(row["ValueA"])
            cores[role][core][str(row["ValueB"])] = row["ValueC"] / _RATE_DIVISOR

    for role in (DPS, SUPPORT):
        out[role]["combat_level_amp"] = dict(
            sorted(levels[role].items(), key=lambda kv: int(kv[0]))
        )
        out[role]["ark_core_values"] = {
            core: dict(sorted(points.items(), key=lambda kv: int(kv[0])))
            for core, points in sorted(cores[role].items(), key=lambda kv: int(kv[0]))
        }
    return out
