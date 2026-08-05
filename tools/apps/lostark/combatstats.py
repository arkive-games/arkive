"""Combat traits (战斗特性 / 전투 특성) and the combat power each point buys.

This is what the calculator used to model as a "远征队" (roster) panel with three
bare number boxes and two hard-coded fan-site rates. All of it except one number
is in the client, in a BattlePoint Type that was previously undecoded.

Naming the Type at all
----------------------

``GameMsg`` carries a **35-member** ``tip.name.enum_battlepointtype_*`` enum, and
``EFTable_BattlePoint`` has 35 distinct ``Type`` values. Laying the two side by
side, with the eleven Types already decoded as anchors (1 ``base_attack_point``,
2 ``base_health_point``, 3 ``level``, 4 ``weapon_quality``, 5/6/7 the three
``arkpassive_*``, 8 ``karma_evolutionrank``, 9 ``karma_leaplevel``,
10 ``ability_attack``, 11 ``ability_defense``) and the systems whose shape is
already known (19-21 the three ``bracelet_*``, 22 ``gem``, 23 ``esther_weapon``,
27 ``card_set``, 28 ``pet_specialty``, 29/30 ``arkgrid_core*``, 31/32
``arkgrid_gem*``, 33/34 ``trinity_orb*``) leaves a **gap-free bijection** in which
every remaining name lands on exactly one remaining Type::

    12 elixir_set                          24 transcendence_armor
    13 elixir_grade_attack                 25 transcendence_additional
    14 elixir_grade_defense                26 battlestat
    15 accessory_grinding_attack           …
    16 accessory_grinding_defense
    17 accessory_grinding_addontype_attack
    18 accessory_grinding_addontype_defense

Nothing is left over on either side, and the ``_attack``/``_defense`` pairs line up
with the roles the data actually has: 14, 16, 21, 30 and 34 are support-only, and
the three slots with no rows at all are ``0`` (``none``), ``18`` (accessory
grinding's support heal channel) and ``32`` (the ark-grid gem one) -- so the table
shows 32 distinct Types with 34 as the largest, exactly what a 35-member enum
predicts. **Type 26 is ``battlestat``.**

What Type 26 says
-----------------

Five rows, and every column is decodable::

    role     ValueA  ValueB
    dps      1, 2, 4      3
    support     2, 4      4

``ValueB`` is the rate x 1e-4 -- ``0.0003`` for a damage dealer and ``0.0004``
for a support, which are the two rates the fan site hard-codes. ``ValueA`` is the
combat-trait index 1-6, in the order the client uses everywhere:

* ``ArkPassive`` nodes ``1010100`` … ``1010600`` are named 会心 / 专长 / 压制 /
  迅捷 / 忍耐 / 异化 and their ``ArkPassiveOption`` rows grant global stat ids
  **15 … 20** in that same order, so the node's own ``1..6`` sub-index *is* this
  index. That is the anchor: ``ValueA`` 1/2/4 are 会心 / 专长 / 迅捷.
* ``PCLevel`` and ``ItemGradeOptionStatic`` both order their trait columns
  ``CriticalHit, Specialty, Oppression, Rapidity, Endurance, Mastery`` --
  two more tables agreeing on the same 1..6.

So the client says a damage dealer scores crit + specialty + swiftness and a
support scores specialty + swiftness only, at 0.0003 and 0.0004 per point. That is
**exactly** the fan site's split and both of its rates: three of six traits for
one role and two for the other is a distinctive enough pattern that the pairing is
a reading, not a guess.

What is NOT in the client
-------------------------

The fan site's ``COMBAT_STAT.base = 2160``. ``ValueC`` is ``0`` on all five rows,
so BattlePoint carries no base, and a scan of all 779 databases finds 2160 only as
row numbers, drop weights and three unrelated engraving amps. The game reads the
character's *actual* trait totals -- which come from accessories, the bracelet,
elixirs and ark passive -- so a fixed base is a fan-site convenience and the
honest model is to let the user enter the totals the game shows them.

Names
-----

``tip.name.enum_stattype_<key>`` resolves all six in both shipped locales
(会心/치명, 专长/특화, 压制/제압, 迅捷/신속, 忍耐/인내, 异화/숙련). Note this
contradicts a remark in :mod:`lostark.bracelets`: that module's scan looked for
the literal key *inside the 779 tables* and found nothing, which is true, but the
key does exist in ``GameMsg`` -- so the six trait names are recoverable after all,
and only the *stat ids* are absent from any table (they come from ``ArkPassive``
here).
"""

from __future__ import annotations

from .battlepoint import DPS, SUPPORT
from .db import Tables

# The BattlePoint Type named ``battlestat``; see the module docstring.
BP_BATTLE_STAT = 26

_RATE_DIVISOR = 10_000
_ROLE_BY_PRIMARY_KEY = {1: DPS, 2: SUPPORT}

# The six combat traits. ``index`` is BattlePoint Type 26's ``ValueA`` and the
# ``ArkPassive`` node sub-index; ``stat`` is the global stat id those nodes grant.
STATS: list[dict[str, object]] = [
    {"index": 1, "stat": 15, "key": "criticalhit", "node": 1010100},
    {"index": 2, "stat": 16, "key": "specialty", "node": 1010200},
    {"index": 3, "stat": 17, "key": "oppression", "node": 1010300},
    {"index": 4, "stat": 18, "key": "rapidity", "node": 1010400},
    {"index": 5, "stat": 19, "key": "endurance", "node": 1010500},
    {"index": 6, "stat": 20, "key": "mastery", "node": 1010600},
]

NAME_KEY_PREFIX = "tip.name.enum_stattype_"

# Panel heading: the client's own 战斗特性 section title from the character sheet.
UI_KEYS: dict[str, str] = {"title": "sys.characterinfo.stat_info_combat"}


def stats() -> list[dict[str, object]]:
    """The six combat traits with their GameMsg name keys, in client order."""
    return [
        {
            "index": s["index"],
            "stat": s["stat"],
            "key": s["key"],
            "name_key": f"{NAME_KEY_PREFIX}{s['key']}",
        }
        for s in STATS
    ]


def rates(tables: Tables) -> dict[str, dict[str, float]]:
    """``{role: {trait index: combat power per point}}`` from BattlePoint Type 26.

    Only the traits the role scores appear -- three for a damage dealer, two for a
    support. A trait absent from a role's map contributes nothing, which is data
    rather than a gap: the client grants no combat power for 压制 / 忍耐 / 异化 to
    either role, and none for 会心 to a support.
    """
    out: dict[str, dict[str, float]] = {DPS: {}, SUPPORT: {}}
    known = {int(s["index"]) for s in STATS}
    for row in tables.read("BattlePoint"):
        if row["Type"] != BP_BATTLE_STAT:
            continue
        role = _ROLE_BY_PRIMARY_KEY.get(row["PrimaryKey"])
        if role is None:
            continue
        index = row["ValueA"]
        if index not in known:
            raise ValueError(f"BattlePoint Type 26 names combat trait {index}, which has no entry")
        out[role][str(index)] = row["ValueB"] / _RATE_DIVISOR
    return {role: dict(sorted(v.items(), key=lambda kv: int(kv[0]))) for role, v in out.items()}


def verify_stat_ids(tables: Tables) -> dict[int, int]:
    """Trait index -> the global stat id its ``ArkPassive`` node grants.

    Recomputes the anchor instead of trusting :data:`STATS`: node ``10101<n>00``
    must grant stat ``14 + n``. Raises when the extraction disagrees, which is the
    signal that the 1..6 index has been re-cut by a patch and Type 26's ``ValueA``
    can no longer be read as a trait.
    """
    options: dict[int, set[int]] = {}
    wanted = {int(s["node"]): int(s["index"]) for s in STATS}
    for row in tables.read("ArkPassiveOption"):
        node = row["PrimaryKey"]
        if node not in wanted:
            continue
        for slot in range(3):
            if row[f"AddonOption{slot}"] == 2 and row[f"AddonOptionStat{slot}"]:
                options.setdefault(node, set()).add(row[f"AddonOptionStat{slot}"])
    out: dict[int, int] = {}
    for spec in STATS:
        node = int(spec["node"])
        found = options.get(node, set())
        if found != {int(spec["stat"])}:
            raise ValueError(
                f"ArkPassive node {node} grants {sorted(found)}, expected [{spec['stat']}]"
            )
        out[int(spec["index"])] = int(spec["stat"])
    return out


def localization_keys() -> list[str]:
    """Every GameMsg key the combat-trait panel renders, deduplicated and sorted."""
    keys = {f"{NAME_KEY_PREFIX}{s['key']}" for s in STATS}
    keys |= set(UI_KEYS.values())
    return sorted(keys)
