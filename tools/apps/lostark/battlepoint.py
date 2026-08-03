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

# ValueA = weapon quality 0-100, ValueB = amp x 1e-4. Damage dealer only --
# support has no weapon-quality amp. The table is 4-decimal rounded and is NOT
# reproducible by the quadratic the fan site fits to it.
_TYPE_WEAPON_QUALITY = 4

# ValueA = amp x 1e-4 gained per karma evolution stage.
_TYPE_KARMA_STAGE_STEP = 8

# ValueA = ArkGridCore id, ValueB = activated points, ValueC = amp x 1e-4.
_TYPE_ARK_CORE = 29

# ValueA = gem tier (3 or 4), ValueB = gem level 1-10, ValueC = amp x 1e-4.
# Verified against the fan site: tier 4 levels 6-10 reproduce its dpsGemData
# battle values exactly. The game additionally covers tier 3 and levels 1-5,
# which the fan site omits.
_TYPE_GEM = 22

# ValueA = ArkGridGemOption group id, ValueB = option level, ValueC = amp x 1e-4.
# Joins 720/720 against EFTable_ArkGridGemOption (PrimaryKey, SecondaryKey).
_TYPE_GEM_OPTION = 31

# Paradise orb (TrinityOrbItem). The two roles use different columns:
#   Type 33 (dps)     ValueA = orb id, ValueB = points, ValueC = amp x 1e-4
#   Type 34 (support) ValueA = orb id, ValueB = heal amp x 1e-4, ValueC unused
# The support value is a flat 130 -> 0.013, matching the fan site's hardcoded
# heal amp -- but the game grants it to four orb ids, not the single one the fan
# site special-cases.
_TYPE_ORB_DPS = 33
_TYPE_ORB_SUPPORT = 34

_RATE_DIVISOR = 10_000


def extract(tables: Tables) -> dict[str, dict]:
    """Combat power coefficients keyed by role."""
    out: dict[str, dict] = {DPS: {}, SUPPORT: {}}
    levels: dict[str, dict[str, float]] = defaultdict(dict)
    quality: dict[str, dict[str, float]] = defaultdict(dict)
    cores: dict[str, dict[str, dict[str, float]]] = defaultdict(lambda: defaultdict(dict))
    gem_options: dict[str, dict[str, dict[str, float]]] = defaultdict(lambda: defaultdict(dict))
    gems: dict[str, dict[str, dict[str, float]]] = defaultdict(lambda: defaultdict(dict))
    orbs: dict[str, dict[str, dict[str, float]]] = defaultdict(dict)

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
        elif kind == _TYPE_WEAPON_QUALITY:
            quality[role][str(row["ValueA"])] = row["ValueB"] / _RATE_DIVISOR
        elif kind == _TYPE_KARMA_STAGE_STEP:
            out[role]["karma_stage_step"] = row["ValueA"] / _RATE_DIVISOR
        elif kind == _TYPE_ARK_CORE:
            core = str(row["ValueA"])
            cores[role][core][str(row["ValueB"])] = row["ValueC"] / _RATE_DIVISOR
        elif kind == _TYPE_GEM:
            gems[role][str(row["ValueA"])][str(row["ValueB"])] = row["ValueC"] / _RATE_DIVISOR
        elif kind == _TYPE_GEM_OPTION:
            group = str(row["ValueA"])
            gem_options[role][group][str(row["ValueB"])] = row["ValueC"] / _RATE_DIVISOR
        elif kind == _TYPE_ORB_DPS:
            orbs[role][str(row["ValueA"])] = {
                "points": row["ValueB"],
                "amp": row["ValueC"] / _RATE_DIVISOR,
            }
        elif kind == _TYPE_ORB_SUPPORT:
            orbs[role][str(row["ValueA"])] = {"heal_amp": row["ValueB"] / _RATE_DIVISOR}

    for role in (DPS, SUPPORT):
        out[role]["combat_level_amp"] = dict(
            sorted(levels[role].items(), key=lambda kv: int(kv[0]))
        )
        # Damage dealer only; omitted rather than emitted empty for support.
        if quality[role]:
            out[role]["weapon_quality_amp"] = dict(
                sorted(quality[role].items(), key=lambda kv: int(kv[0]))
            )
        out[role]["ark_core_values"] = {
            core: dict(sorted(points.items(), key=lambda kv: int(kv[0])))
            for core, points in sorted(cores[role].items(), key=lambda kv: int(kv[0]))
        }
        out[role]["gem_option_values"] = {
            group: dict(sorted(levels_.items(), key=lambda kv: int(kv[0])))
            for group, levels_ in sorted(gem_options[role].items(), key=lambda kv: int(kv[0]))
        }
        out[role]["gem_values"] = {
            tier: dict(sorted(levels_.items(), key=lambda kv: int(kv[0])))
            for tier, levels_ in sorted(gems[role].items(), key=lambda kv: int(kv[0]))
        }
        out[role]["orb_values"] = dict(sorted(orbs[role].items(), key=lambda kv: int(kv[0])))
    return out
