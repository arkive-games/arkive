"""EFTable_AbilityEngrave + EFTable_Ability -> the engraving roster and its icons.

``AbilityEngrave`` is the roster: 95 distinct ``PrimaryKey`` values, each also a
row in ``Ability`` that carries the name key and the icon reference. ``Type``
splits them the way the game's own UI does — 1 = a general engraving any class
can slot (five levels), 2 = a class engraving (four levels, ``Class`` naming the
class it belongs to).

**Do not filter on ``Ability.IsEngraveAbility``.** It is true for 163 ability ids,
68 of which have no ``AbilityEngrave`` row at all — retired engravings still
carried for old tooltips. Filtering on the flag would ship 68 engravings the game
no longer offers, so the join drives the roster and the flag is ignored.

The growth ladder, its effect values and its combat-power amps
-------------------------------------------------------------

An engraving is not one row of numbers, it is a **5 x 13 grid**, and the client
ships every cell. Two id spaces and one packed code are the whole story:

* ``EFTable_AbilityMapping`` maps each roster id to a **second ability id**
  (``PrimaryKey`` -> ``MappingAbilityId``, and it happens to be ``id + 1000``,
  which is *not* relied on here). 43 of the 95 map; those 43 are exactly the
  general engravings. The mapped row is the reworked ("S3") engraving —
  ``Ability`` 118 is the old three-level 怨恨 with keys
  ``tip.name.ability_GRUDGE1..3``, while 1118 is the current one with 45 rows and
  keys ``tip.name.ability_S3_GRUDGE05..93``.
* Every one of those 45 rows carries ``OptionType00 = 28``, ``OptionKeyIndex00``
  pointing back at itself and ``OptionValue00`` holding a **growth code**. Its
  designer note (``Comment2``) spells the code out: 5 reads
  "스톤 0 / 영웅 4 / 전설 0 / 유물 0" (stone 0, epic 4, legend 0, relic 0), 6 reads
  "…전설 1", 13 reads "…전설 4 / 유물 4", 25 is the same as 5 with stone 1. So

      code = 20 * stone_level + 1 + 4 * grade_step + book_level

  with ``grade_step`` 0/1/2 for epic/legend/relic and ``book_level`` 1..4 —
  i.e. codes 2..13 are the twelve book states, code 1 is "nothing equipped",
  and each ability-stone level shifts the block by 20. Stone level 0 defines
  only codes 5..13 (the game does not show a partly-filled epic set without a
  stone); every other block defines all of 1..13. 61 cells, per engraving.
* **``EFTable_BattlePoint`` Type 10 is the engraving combat-power table.**
  ``ValueA`` = the mapped ability id, ``ValueB`` = the growth code, ``ValueC`` =
  amp x 1e-4. 26 general engravings carry a damage-dealer amp and 4 carry a
  support amp, all 61 cells each. **Type 11** is the same shape for the support
  *heal* channel and has exactly one occupant, 妙手回春 (1301) — mirroring how
  Types 33/34 and 20/21 split a system's two support channels.
* ``EFTable_AbilitySpecification`` holds the **raw effect** values the tooltip
  prints, keyed by the mapped ability id, with ``SecondaryKey`` selecting a
  growth *channel* and ``AbilityLevel`` the step inside it. ``SpecValue1..4`` are
  the numbers, ``EngraveTooltip`` the sentence they fill in.

Type 10 was previously read as "a per-item-group honing table"; it is not, and
the decode is certain rather than plausible because it reproduces the fan site's
whole engraving value set exactly, including its non-round numbers — 尖刺重锤's
0.1439 base is ``ValueC`` 1439 at code 9, and its stone column 0.0279/0.035/
0.0492/0.0559 is codes 29/49/69/89 minus code 9.

**The amps are coefficients, not effects.** For 怨恨 the two coincide (a 15%
boss-damage effect scores 0.15) which is what makes the pairing legible, but
尖刺重锤 grants 36% *crit damage* at code 5 and scores 0.1141 — so
``AbilitySpecification`` is the tooltip and Type 10/11 is the score, and neither
substitutes for the other.

**The grid is exactly additive over its two axes**, verified for all 31 grids at
every cell with a defined code 9 counterpart (155 cells checked per grid, zero
mismatches)::

    amp(stone, code) = amp(0, 9) + (amp(0, code) - amp(0, 9))
                                 + (amp(stone, 20 * stone + 9) - amp(0, 9))

That is why a two-dial UI ("relic books 0-4" x "stone 0-4" over a base) is
faithful and not an approximation. It is only checked for codes 5..13, because
stone level 0 defines no smaller code to compare against; the full grid is
emitted regardless, so a caller never has to reconstruct a cell.

Two traps in the channel numbering:

* ``SecondaryKey`` is **not** the grade number. 1 is the *base* — the effect with
  a full set of four epic books, i.e. growth code 5, and it has a single
  ``AbilityLevel`` row rather than four. 3 is the legend increment and 4 the
  relic increment (those two do line up with :data:`GRADES`), 0 is the ability
  stone, and **2 is unused**: it exists only on the four stone-penalty abilities
  and is all zeros with blank text there.
* The stone ladder is not a fixed multiple of the book step. It is
  ``[4, 5, 7, 8] x`` one unit for many engravings (怨恨: book step 0.75%, stone
  3/3.75/5.25/6%), but the unit is per-engraving and often is *not* the book
  step — 尖刺重锤's stone unit is 1.875 against a book step of 2.0, and
  肾上腺素 drives its stone off a different ``SpecValue`` slot than its books.
  So the ladder is read cell by cell, never derived from a single per-level
  number.

The ability stone's own downside is four separate abilities, 1800..1803 —
attack power, defence, attack speed and move speed down, ``AbilityStoneAbilityGroup``
4010 against 4000 for the 43 real ones. They do **not** use the growth code: they
have three levels, keyed by the stone's penalty level, and ``BattlePoint``
``ValueB`` is that level rather than a packed code. Only 1800 (attack power) costs
combat power, -0.02/-0.04/-0.06; the other three are free. ``AbilitySpecification``
pads channel 0 with an all-zero fourth row that has no ``Ability`` counterpart, so
the level count is read from ``Ability`` and not from the spec.

Finally, ``AbilityStoneBase`` puts a flat bonus behind a stone-level threshold:
every one of its 58 rows has ``LevelStage00 = 5`` and ``LevelOptionId = 9100``,
and ``AbilityStoneCarveOption`` 9100 is ``Type 2`` (a flat stat add) granting
``KeyStat 150 += 150`` at stone grades 2..6. The threshold of 5 is therefore the
client's, but the *combat power* of that bonus is not: no ``BattlePoint`` Type is
keyed by stat 150, and stat 150 has no name in any table (the same gap
:mod:`lostark.bracelets` documents for its unnamed stat ids). It is emitted as a
raw stat, not as an amp.

Icons: ``Icon`` + ``IconIndex`` is a **sprite file name**, resolved by a table
--------------------------------------------------------------------------

``Ability.Icon = 'Buff'`` with ``IconIndex = 71`` names the sprite ``Buff_71.png``,
and the client's own ``IconInfo.loa`` says which atlas page that sprite sits on and
where. :mod:`lostark.icons` parses that table (44,121 sprites over the same 1,147
pages the atlas packages hold) and is the only address used here; the arithmetic
this module previously did is gone, because **all three of its assumptions are
false**:

* Sprites are not stored in index order — ``Buff_61``/``Buff_62`` live on page
  ``Buff_3``, not between ``Buff_60`` and ``Buff_63`` on ``Buff_0``.
* Page order is not the numeric suffix — ``Ability_0.png`` is on page
  ``Ability_1``, ``Ability_207.png`` on page ``Ability_0``.
* The cell size is not fixed at 64x64 — the seven ``achieve_*``/``GL_Skill_01``
  engravings resolve to 128x128 sprites.

Concretely, of the 95 engravings the flat-index model placed **5** correctly, and a
uniform "index - 2" (which the two relocated Buff sprites make look right around
怨恨) placed **23**. The sprite table places all 95, and there is no longer any
:data:`ICONLESS` case: the seven engravings previously written off as having no
exported atlas resolve to real, on-theme art (尖刺重锤 a spiked mace, 愤怒之锤 a
war hammer, 先发制人 a backstab, 炮击强化 an artillery barrage).

Two independent confirmations of the resolved set, and the ``SkillBuff`` fallback
that is *not* needed any more, are recorded in :mod:`lostark.icons`.
"""

from __future__ import annotations

import re
from collections import defaultdict
from pathlib import Path

from . import icons
from .battlepoint import DPS, SUPPORT
from .db import Tables

# Engraving Type as the client stores it in ``AbilityEngrave.Type``.
GENERAL = 1
CLASS = 2

NAME_KEY_PREFIX = "tip.name.ability_"

# Engravings with no icon. Empty, and kept as a named empty set rather than
# deleted: it was non-empty while icons were addressed arithmetically (seven
# engravings whose group looked like it had no exported page), and the sprite table
# resolves all 95. A future patch adding a sprite the extraction lacks would refill
# it, so callers keep the concept.
ICONLESS: set[str] = set()

# The engraving grade ladder, in the order the tooltip presents it. Both the label
# and the colour come from GameMsg: ``sys.tooltip.engrave_grade_<tier>`` is the
# name and ``sys.engrave.name_color_grade_<n>`` wraps a name in that tier's colour,
# so nothing here is a hand-picked hex value.
GRADES: list[dict[str, object]] = [
    {"grade": 1, "key": "basic", "name_key": "sys.tooltip.engrave_grade_rare"},
    {"grade": 2, "key": "epic", "name_key": "sys.tooltip.engrave_grade_epic"},
    {"grade": 3, "key": "legend", "name_key": "sys.tooltip.engrave_grade_legend"},
    {"grade": 4, "key": "relic", "name_key": "sys.tooltip.engrave_grade_relic"},
]

# ``sys.engrave.name_color_grade_<n>`` -> the colour of grade n.
GRADE_COLOUR_KEYS = {g["grade"]: f"sys.engrave.name_color_grade_{g['grade']}" for g in GRADES}

# The three grades a book can actually be, in ladder order. Grade 1 (rare/basic)
# has a name and a colour but no place on the growth ladder: codes 2..13 are
# 3 grades x 4 levels exactly, and the client's own designer notes decompose them
# as 영웅 (epic) / 전설 (legend) / 유물 (relic).
BOOK_GRADES = [g["grade"] for g in GRADES if g["grade"] != 1]
BOOK_MAX_LEVEL = 4
STONE_MAX_LEVEL = 4

# One ability-stone level shifts the growth code by this much. Codes therefore run
# 20*stone + 1 .. 20*stone + 13.
_STONE_STRIDE = 20

# BattlePoint Types carrying engraving coefficients. 10 is the score amp for both
# roles; 11 is the support heal amp and has one occupant.
_BP_AMP = 10
_BP_HEAL_AMP = 11
_RATE_DIVISOR = 10_000

_ROLE_BY_PRIMARY_KEY = {1: DPS, 2: SUPPORT}

# AbilitySpecification.SecondaryKey -> our channel key. NOT the grade number: 1 is
# the base (a full set of four epic books, growth code 5) and 2 is unused, present
# only on the stone-penalty abilities and always zero.
CHANNELS: dict[int, str] = {0: "stone", 1: "base", 2: "unused", 3: "legend", 4: "relic"}

# The four stone-penalty abilities, in AbilityStoneAbilityGroup 4010 order.
PENALTY_GROUP = 4010
# ...and the group holding the 43 engravings a stone can grant.
STONE_ENGRAVING_GROUP = 4000

# Number of SpecValue/SpecName/... slots an AbilitySpecification row carries.
_SPEC_SLOTS = 4

# Strings the engraving panel renders. Kept as keys so the UI reads like the
# client: a grade is "<n> 阶段刻印", a stone level is "<n>级", and the stone's own
# label is the ``spec_tooltip_grade_0`` entry rather than the word "stone".
UI_KEYS: dict[str, str] = {
    "panel_title": "sys.ability.engrave_spec_title",
    "empty": "sys.ability.engrave_spec_empty",
    # "{0} 阶段刻印" — the stage within a grade.
    "stage": "sys.tooltip.engrave_grade",
    "stage_negative": "sys.tooltip.engrave_grade_negative",
    "grade_and_stage": "sys.tooltip.engrave_option_next_grade",
    # Ability stone: the label, then its two level readouts.
    "stone": "sys.ability.spec_tooltip_grade_0",
    "stone_level": "sys.ability.engrave_spec_stone_success_level",
    "stone_penalty_level": "sys.ability.engrave_spec_stone_penalty_level",
    "stone_empty": "sys.ability.stone_empty_tooltip",
    "stone_mismatch": "sys.ability.stone_unselect_tooltip",
}


def slug(name_key: str) -> str:
    """A stable file-name slug for an engraving, from its GameMsg name key.

    ``tip.name.ability_RUTHLESS1`` -> ``ruthless``. The trailing digit is the
    ability *level* baked into the level-1 row's key, not part of the identity, so
    it is dropped. All 95 slugs are distinct; :func:`extract` asserts that, since a
    collision would silently overwrite an icon file.
    """
    stem = name_key.rsplit(NAME_KEY_PREFIX, 1)[-1]
    return re.sub(r"[^a-z0-9]+", "_", re.sub(r"\d+$", "", stem).lower()).strip("_")


def growth_code(stone: int, grade: int, level: int) -> int:
    """The client's packed growth code for one state of the engraving's two dials.

    ``stone`` is the ability-stone level 0-4, ``grade`` one of :data:`BOOK_GRADES`
    (2 epic, 3 legend, 4 relic) and ``level`` the book level 1-4 inside that grade.
    ``growth_code(0, 2, 4) == 5`` is the state the client calls "stone 0 / epic 4 /
    legend 0 / relic 0" and is the cheapest one it defines at stone level 0.
    """
    if not 0 <= stone <= STONE_MAX_LEVEL:
        raise ValueError(f"stone level out of range: {stone}")
    if grade not in BOOK_GRADES:
        raise ValueError(f"not a book grade: {grade}")
    if not 1 <= level <= BOOK_MAX_LEVEL:
        raise ValueError(f"book level out of range: {level}")
    step = BOOK_GRADES.index(grade) * BOOK_MAX_LEVEL + level
    return _STONE_STRIDE * stone + 1 + step


def growth_state(code: int) -> tuple[int, int | None, int]:
    """``code`` -> ``(stone_level, grade, book_level)``, the inverse of :func:`growth_code`.

    ``grade`` is ``None`` with ``book_level`` 0 for the codes ending in 1, which are
    the "no books equipped" state that only the stone blocks define.
    """
    stone, within = divmod(code, _STONE_STRIDE)
    step = within - 1
    if not 0 <= stone <= STONE_MAX_LEVEL or not 0 <= step <= len(BOOK_GRADES) * BOOK_MAX_LEVEL:
        raise ValueError(f"not a growth code: {code}")
    if step == 0:
        return stone, None, 0
    grade, level = divmod(step - 1, BOOK_MAX_LEVEL)
    return stone, BOOK_GRADES[grade], level + 1


def reworked_ability_ids(tables: Tables) -> dict[int, int]:
    """Roster engraving id -> the reworked ("S3") ability id that carries its numbers.

    ``EFTable_AbilityMapping`` stores each pair **both ways** — 94 rows for 47 pairs —
    so reading it as written gives 1118 -> 118 as readily as 118 -> 1118. The
    lower-numbered id of a pair is the roster one, and in every pair the other is
    exactly ``+ 1000``, but that arithmetic is an observation and not the join.

    43 of the 95 roster engravings appear, and they are exactly the general ones;
    class engravings have no reworked row, no per-level effect table and no
    combat-power amp (their power reaches the score through the enlightenment rate
    instead). The remaining four pairs are the stone-penalty abilities 800..803.
    """
    pairs: dict[int, int] = {}
    for row in tables.read("AbilityMapping"):
        other = row["MappingAbilityId"]
        if not other:
            continue
        low, high = sorted((row["PrimaryKey"], other))
        pairs[low] = high
    return dict(sorted(pairs.items()))


def growth_amps(tables: Tables) -> dict[str, dict[str, dict[int, dict[int, float]]]]:
    """Engraving combat-power coefficients, ``{kind: {role: {ability_id: {code: amp}}}}``.

    ``kind`` is ``"score"`` (BattlePoint Type 10) or ``"heal"`` (Type 11), ``role`` is
    ``dps``/``support``, ``ability_id`` is the *reworked* ability id and ``code`` a
    growth code. Amps are ``ValueC / 1e4`` and may be negative — the attack-power
    penalty engraving is in here too, keyed by its penalty level rather than a code.
    """
    out: dict[str, dict[str, dict[int, dict[int, float]]]] = {
        "score": {DPS: defaultdict(dict), SUPPORT: defaultdict(dict)},
        "heal": {DPS: defaultdict(dict), SUPPORT: defaultdict(dict)},
    }
    kinds = {_BP_AMP: "score", _BP_HEAL_AMP: "heal"}
    for row in tables.read("BattlePoint"):
        kind = kinds.get(row["Type"])
        role = _ROLE_BY_PRIMARY_KEY.get(row["PrimaryKey"])
        if kind is None or role is None:
            continue
        out[kind][role][row["ValueA"]][row["ValueB"]] = row["ValueC"] / _RATE_DIVISOR
    return {
        kind: {role: dict(sorted(grids.items())) for role, grids in roles.items()}
        for kind, roles in out.items()
    }


def _spec_rows(tables: Tables) -> dict[int, dict[int, dict[int, dict]]]:
    """``AbilitySpecification`` as ``{ability_id: {channel: {level: row}}}``."""
    rows: dict[int, dict[int, dict[int, dict]]] = defaultdict(lambda: defaultdict(dict))
    for row in tables.read("AbilitySpecification"):
        rows[row["PrimaryKey"]][row["SecondaryKey"]][row["AbilityLevel"]] = row
    return rows


def _channel_values(levels: dict[int, dict]) -> dict[int, list[float]]:
    """One channel's ``SpecValue1..4`` per level, in level order."""
    return {
        level: [levels[level][f"SpecValue{i}"] for i in range(1, _SPEC_SLOTS + 1)]
        for level in sorted(levels)
    }


def _spec_slots(levels: dict[int, dict]) -> list[dict]:
    """The named ``Spec<n>`` slots of a channel, as label metadata.

    Read off the rows rather than assumed, because a slot may carry a value with no
    name (the increment channels reuse the base channel's labels) and because the
    unit and the decimal count are per slot.
    """
    slots: list[dict] = []
    for index in range(1, _SPEC_SLOTS + 1):
        row = next(
            (r for r in (levels[level] for level in sorted(levels)) if r[f"SpecName{index}"]),
            None,
        )
        if row is None:
            continue
        slots.append(
            {
                "index": index,
                "name_key": row[f"SpecName{index}"],
                "desc_key": row[f"SpecDesc{index}"] or None,
                "unit_key": row[f"SpecUnit{index}"] or None,
                "digits": row[f"SpecDigit{index}"],
                "negative": bool(row[f"SpecValueNegative{index}"]),
            }
        )
    return slots


def _effect_channels(channels: dict[int, dict[int, dict]]) -> list[dict]:
    """The non-empty growth channels of one engraving, in :data:`CHANNELS` order.

    A channel whose every value is zero is dropped. That is what removes the
    ``…_2`` slot, whose GameMsg text is the empty string in both locales — keeping
    it would ship a blank tooltip key and fail the locale contract.
    """
    out: list[dict] = []
    for channel in sorted(channels):
        levels = channels[channel]
        values = _channel_values(levels)
        if not any(any(v for v in row) for row in values.values()):
            continue
        first = levels[min(levels)]
        out.append(
            {
                "channel": channel,
                "key": CHANNELS.get(channel, str(channel)),
                "tooltip_key": first["EngraveTooltip"] or None,
                "specs": _spec_slots(levels),
                "values": {str(level): row for level, row in values.items()},
            }
        )
    return out


def effect_values(tables: Tables) -> dict[str, list[dict]]:
    """Raw per-level effect values, ``{reworked_ability_id: [channel, …]}``.

    These are the numbers the tooltip prints — percentages, seconds, counts — and
    **not** combat power. Use :func:`growth_amps` for the score.
    """
    specs = _spec_rows(tables)
    return {
        str(ability_id): _effect_channels(channels)
        for ability_id, channels in sorted(specs.items())
    }


def stone_penalties(tables: Tables) -> list[dict]:
    """The four downside engravings an ability stone carves alongside the good one.

    ``AbilityStoneAbilityGroup`` :data:`PENALTY_GROUP` names them. Their levels come
    from ``Ability`` (three, one per stone penalty level) rather than from
    ``AbilitySpecification``, which pads a fourth all-zero row with no ability
    behind it. Only the attack-power one costs combat power.
    """
    ids = [
        row["AbilityId"]
        for row in tables.read("AbilityStoneAbilityGroup")
        if row["PrimaryKey"] == PENALTY_GROUP
    ]
    rows: dict[int, list[dict]] = defaultdict(list)
    for row in tables.read("Ability"):
        if row["PrimaryKey"] in ids:
            rows[row["PrimaryKey"]].append(row)
    amps = growth_amps(tables)
    effects = effect_values(tables)

    out: list[dict] = []
    for ability_id in ids:
        levels = sorted(rows[ability_id], key=lambda r: r["SecondaryKey"])
        first = levels[0]
        # The spec's stone channel carries the displayed percentage per level; trim it
        # to the levels the Ability table actually defines.
        channel = next(
            (c for c in effects.get(str(ability_id), []) if c["key"] == "stone"), None
        )
        values = channel["values"] if channel else {}
        out.append(
            {
                "ability_id": str(ability_id),
                "slug": slug(first["Name"]),
                "name_key": first["Name"],
                "desc_keys": {str(r["SecondaryKey"]): r["Desc"] for r in levels},
                "specs": channel["specs"] if channel else [],
                "tooltip_key": channel["tooltip_key"] if channel else None,
                "values": {
                    str(r["SecondaryKey"]): values.get(str(r["SecondaryKey"]), [])
                    for r in levels
                },
                "amp": {
                    role: {
                        str(level): amp
                        for level, amp in amps["score"][role].get(ability_id, {}).items()
                    }
                    for role in (DPS, SUPPORT)
                },
            }
        )
    return out


def stone_level_bonus(tables: Tables) -> dict[str, object]:
    """The flat bonus a stone grants once its engraving levels reach a threshold.

    ``AbilityStoneBase.LevelStage00`` is the threshold and ``LevelOptionId`` the
    option; both are uniform across all 58 stones. The option is
    ``AbilityStoneCarveOption`` ``Type 2`` — a flat ``KeyStat += Value`` — and the
    stat has no name in any table, so it ships as a number with a stat id and no
    label rather than an invented one. It carries **no** combat-power amp: no
    BattlePoint Type is keyed by that stat.
    """
    stones = list(tables.read("AbilityStoneBase"))
    thresholds = {row["LevelStage00"] for row in stones}
    options = {row["LevelOptionId"] for row in stones}
    if len(thresholds) != 1 or len(options) != 1:
        raise ValueError(f"stone level bonus is not uniform: {thresholds}, {options}")
    option_id = options.pop()
    grades: dict[str, dict[str, int]] = {}
    for row in tables.read("AbilityStoneCarveOption"):
        if row["PrimaryKey"] != option_id:
            continue
        grades[str(row["Grade"])] = {
            "option_type": row["Type"],
            "stat": row["KeyStat"],
            "value": row["Value00"],
        }
    return {
        "threshold": thresholds.pop(),
        "option_id": str(option_id),
        "by_grade": dict(sorted(grades.items(), key=lambda kv: int(kv[0]))),
    }


def extract(tables: Tables, locale_names: dict[str, str] | None = None) -> dict[str, dict]:
    """The engraving roster as ``{engraving_id: {...}}``, in client id order.

    ``levels`` maps each level the game offers to the engraving points it costs —
    ``AbilityEngrave.SecondaryKey`` -> ``AbilityPoint``. General engravings have
    five levels and class engravings four, which is why the count is read per
    engraving instead of assumed.

    ``locale_names`` maps GameMsg keys to resolved text and is used only to mark
    the support class engravings, the same way :mod:`lostark.classes` does it —
    the client marks no engraving as damage or support, so the decision is made by
    name against ``classes.SUPPORT_SUBCLASS_NAMES``.
    """
    from .classes import SUPPORT_SUBCLASS_NAMES

    ability: dict[int, dict] = {}
    for row in tables.read("Ability"):
        # SecondaryKey is the engraving level; level 1 carries the shared name and
        # icon, and every level of an engraving repeats them.
        if row["PrimaryKey"] not in ability or row["SecondaryKey"] == 1:
            ability[row["PrimaryKey"]] = row

    grouped: dict[int, list[dict]] = {}
    for row in tables.read("AbilityEngrave"):
        # Class engravings are excluded: the rework turned them into class
        # identities rather than engravings, and the client agrees — the 52 of
        # them have no AbilityMapping entry, no AbilitySpecification rows and no
        # BattlePoint Type 10 grid. Keeping them would list 52 things a player
        # cannot equip, every one of them scoring zero.
        if row["Type"] == CLASS:
            continue
        grouped.setdefault(row["PrimaryKey"], []).append(row)

    reworked = reworked_ability_ids(tables)
    amps = growth_amps(tables)
    effects = effect_values(tables)

    out: dict[str, dict] = {}
    for engraving_id, rows in sorted(grouped.items()):
        rows.sort(key=lambda r: r["SecondaryKey"])
        first = rows[0]
        a = ability[engraving_id]
        name_key = a["Name"]
        key = slug(name_key)
        label = (locale_names or {}).get(name_key)
        reworked_id = reworked.get(engraving_id)
        out[str(engraving_id)] = {
            "slug": key,
            "type": first["Type"],
            "class_id": first["Class"] or None,
            "name_key": name_key,
            "desc_key": a["Desc"] or None,
            "icon": a["Icon"],
            "icon_index": a["IconIndex"],
            # None for the seven with no exported atlas, so the frontend can fall
            # back instead of requesting a file that was never written.
            "icon_slug": None if key in ICONLESS else key,
            "levels": {str(r["SecondaryKey"]): r["AbilityPoint"] for r in rows},
            # Support only where the class engraving is the support sub-class;
            # general engravings are not marked either way by the client.
            "role": (
                "support"
                if first["Type"] == CLASS and label in SUPPORT_SUBCLASS_NAMES
                else "dps"
                if first["Type"] == CLASS
                else None
            ),
            # The reworked ability id everything below is keyed by; None for the 52
            # class engravings, which the rework left without their own tables.
            "reworked_id": str(reworked_id) if reworked_id else None,
            # Combat power per growth code. Empty per role where the game grants
            # none — a defensive engraving scores nothing, and that is data, not a
            # gap. ``heal_amp`` is the support heal channel, BattlePoint Type 11.
            "amp": {
                role: {
                    str(code): amp
                    for code, amp in amps["score"][role].get(reworked_id, {}).items()
                }
                for role in (DPS, SUPPORT)
            },
            "heal_amp": {
                role: {
                    str(code): amp
                    for code, amp in amps["heal"][role].get(reworked_id, {}).items()
                }
                for role in (DPS, SUPPORT)
            },
            # Raw tooltip values per growth channel — percentages and counts, not
            # combat power. See :func:`effect_values`.
            "effect": effects.get(str(reworked_id), []),
        }

    slugs = [e["slug"] for e in out.values()]
    if len(set(slugs)) != len(slugs):
        raise ValueError("engraving slugs collide; icon files would overwrite each other")
    return out


def _effect_keys(channels: list[dict]) -> set[str]:
    """Every GameMsg key one engraving's growth channels reference."""
    keys: set[str] = set()
    for channel in channels:
        if channel["tooltip_key"]:
            keys.add(channel["tooltip_key"])
        for spec in channel["specs"]:
            keys |= {spec["name_key"], spec["desc_key"], spec["unit_key"]} - {None}
    return keys


def localization_keys(
    engravings: dict[str, dict], penalties: list[dict] | None = None
) -> list[str]:
    """Every GameMsg key the engraving panel renders, deduplicated and sorted.

    Includes the per-channel tooltips and spec labels of the growth ladder, because
    a level whose text is missing is as broken as one whose number is. ``penalties``
    is :func:`stone_penalties`' output; it is optional so the roster alone still
    resolves, but omitting it drops the stone downside's strings.
    """
    keys = set(UI_KEYS.values())
    keys |= {str(g["name_key"]) for g in GRADES}
    keys |= set(GRADE_COLOUR_KEYS.values())
    keys |= {e["name_key"] for e in engravings.values() if e["name_key"]}
    keys |= {e["desc_key"] for e in engravings.values() if e["desc_key"]}
    for engraving in engravings.values():
        keys |= _effect_keys(engraving.get("effect", []))
    for penalty in penalties or []:
        keys.add(penalty["name_key"])
        keys |= {k for k in penalty["desc_keys"].values() if k}
        if penalty["tooltip_key"]:
            keys.add(penalty["tooltip_key"])
        for spec in penalty["specs"]:
            keys |= {spec["name_key"], spec["desc_key"], spec["unit_key"]} - {None}
    return sorted(keys)


def locate(
    atlas_root: Path, icon_info: Path, group: str, index: int
) -> tuple[Path, tuple[int, int, int, int]] | None:
    """Resolve ``(group, index)`` to an atlas page and a crop box, or None.

    A thin wrapper over :func:`lostark.icons.locate` for a one-off lookup: it
    reparses ``IconInfo.loa`` on every call, so a loop over many icons should build
    the sprite table and page index once (see :func:`write_icons`).

    None means the sprite table has no such sprite, or its page is missing from the
    extraction. Neither is an error here — the caller decides.
    """
    return icons.locate(
        icons.sprite_table(icon_info), icons.pages(atlas_root), group, index
    )


def write_icons(
    engravings: dict[str, dict], atlas_root: Path, icon_info: Path, out_dir: Path
) -> tuple[list[str], list[str]]:
    """Write one ``<slug>.png`` per engraving at the sprite's own size.

    Returns ``(written, missing)`` slugs. Nothing is upscaled or padded to a common
    size: the frontend gets the game's own pixels — 64x64 for 88 of the 95 and
    128x128 for the seven that live on the ``Achieve_*`` pages — and sizes them
    with CSS.
    """
    from PIL import Image

    sprites = icons.sprite_table(icon_info)
    pages = icons.pages(atlas_root)
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    written: list[str] = []
    missing: list[str] = []
    for engraving in sorted(engravings.values(), key=lambda e: e["slug"]):
        found = icons.locate(sprites, pages, engraving["icon"], engraving["icon_index"])
        if found is None:
            missing.append(engraving["slug"])
            continue
        page, box = found
        with Image.open(page) as image:
            image.convert("RGBA").crop(box).save(out_dir / f"{engraving['slug']}.png")
        written.append(engraving["slug"])
    return written, missing
