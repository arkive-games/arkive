"""Bracelet option lines and their combat-power amps.

The bracelet is the Leap slot's accessory, and it is the one gear system the app
used to model from the fan site. Everything it hard-coded is in the client.

**Where the lines live.** A bracelet's roll pool is ``EFTable_ItemGradeOptionRandom``
filtered to ``GroupName LIKE 'sys.bracelet.%'``. ``PrimaryKey`` is the pool id —
for a shipped bracelet it *is* the bracelet item id, which is how
``ItemBraceletEnchant.OptionGroupId`` and ``ItemBraceletUpgrade.OptionConvertId``
point at it. ``GroupName`` is the client's own label key for the column the line
belongs to, which is why the three columns below are read rather than invented.

**One line = one row shape.** ``Type`` selects how the row addresses its effect,
and it is *not* a stat id:

===== ============================================ ===========================
Type  meaning                                      display text
===== ============================================ ===========================
2     flat stat: ``KeyStat`` += ``Value``           ``ItemOptionAlias`` (AliasType 1)
3     ``KeyIndex`` is an ``EFTable_Ability`` id     ``Ability.Desc``
4     ``KeyIndex`` is an ``EFTable_CombatEffect`` id ``CombatEffect.Desc``
54    ally attack-power amplify, += ``Value``       ``sys.bracelet.addontype_…``
59    ally damage amplify, += ``Value``             ``sys.bracelet.addontype_…``
===== ============================================ ===========================

``Ability`` is the right home for Type 3 despite the name: those rows carry a
``Comment1`` designer note reading "bracelet effect #N" and a ``Desc`` GameMsg key,
while their ``Name`` is a raw Korean literal rather than a key — so **read ``Desc``,
never ``Name``**, or zh-CN silently comes out blank.

**``value`` is percent x 100** for the rate-like lines: ``Ability`` 11061 reads "ally
attack power amplify +3%" and carries ``OptionValue = 300``, and 11064 reads +1.5% with
150. That is the divisor a caller needs for the two ``sys.bracelet.addontype_…``
templates, whose ``{1}`` placeholder is the percentage. Flat lines (max HP, weapon
attack) carry their number as-is.

**BattlePoint decode.** Three enum members name the bracelet
(``tip.name.enum_battlepointtype_bracelet_stattype`` /
``…_bracelet_addontype_attack`` / ``…_bracelet_addontype_defense``), and three
previously-undecoded Types carry it:

* **Type 20** — ``ValueA`` = the option's ``Type`` above (3 or 4), ``ValueB`` = the
  option id, ``ValueC`` = amp x 1e-4. All 144 of its ``ValueB`` values are bracelet
  option ids, exactly, with nothing left over.
* **Type 21** — same shape, support only, and its four ids (11181-11184 = "party
  shield / party heal +2…3.5%") are the defensive family. That is why 20 is read as
  ``addontype_attack`` and 21 as ``addontype_defense``; the enum's *numbering* is not
  recoverable from the extraction, so the attack/defense labels rest on 21 being
  support-only and defensive, mirroring ark grid core 29/30 and orb 33/34.
* **Type 19** — ``bracelet_stattype``: a *ratio*, not an amp.
  ``ValueA`` = 1 with ``ValueB`` = a stat id (damage dealer: 50 extra damage 0.7692,
  74 crit rate 0.7000, 76 crit damage 0.3333); ``ValueA`` = 2/3 with ``ValueB`` = 0 for
  the two support amplify channels (0.75 and 0.50). The line's amp is
  ``Value * ValueC / 1e8``.

Type 19 is what makes the decode certain rather than plausible: together, Types
19/20/21 reproduce **every one of the 45 distinct values** the fan site hard-coded
for bracelets, including its six non-integer ones — 0.0226644 is exactly
``680 * 3333 / 1e8`` (crit damage +6.8%), 0.030768 is ``400 * 7692 / 1e8`` (extra
damage +4.0%). Nothing is left unexplained on either role.

**Two divergences from the fan site** worth keeping:

* its support ``heal`` column is half the game's Type 21 amp, and it rounds the
  smallest one to 0.017 where half of 0.035 is 0.0175;
* it drops the whole 0.0225 grade of the support amplify lines (``Value`` 300 and 450),
  offering three where the game offers four.

**Stat names come from ArkPassive, not from any alias table.** No table maps a
``StatType`` id to a GameMsg key — a scan of all 779 databases for the literal
``enum_stattype_criticalhit`` finds nothing, which is what an earlier pass concluded
from. But the *key* exists in ``GameMsg``, and ``EFTable_ArkPassive`` supplies the
missing half of the join: nodes ``1010100`` … ``1010600`` are named 会心 / 专长 /
压制 / 迅捷 / 忍耐 / 异化 and their ``ArkPassiveOption`` rows grant stat ids
**15 … 20** in that order (see :mod:`lostark.combatstats`, which needs the same
anchor for BattlePoint Type 26). ``SkillBuff`` rows whose text reads 体力增加 pin
**6** to 体力 the same way. :data:`STAT_NAME_KEYS` is that mapping, and it names 52
of the 58 lines the module used to ship unnamed.

**What is still NOT in the extraction:** ``KeyStat`` **11**. Its one appearance
outside a bracelet is ``SkillBuff`` 7310, which carries no description, so there is
nothing to read a name off. Its six lines are still emitted with
``name_key = None``, because dropping them would show a column as shorter than the
game's; they carry no combat power (no BattlePoint Type is keyed by them), so a
caller can render them by group label and value alone.
"""

from __future__ import annotations

from collections import defaultdict

from .battlepoint import DPS, SUPPORT
from .db import Tables

# GroupName -> our key. The client's four labels; the first three are the ones every
# shipped bracelet pool offers, and are therefore the UI's three columns.
OPTION_GROUPS: list[dict[str, str]] = [
    {"key": "basic", "name_key": "sys.bracelet.option_group_01"},
    {"key": "combat_trait", "name_key": "sys.bracelet.option_group_02"},
    {"key": "engraving", "name_key": "sys.bracelet.option_group_03"},
    # Only the legacy pool 910000010 uses this one, and only for lines that the
    # tier 3/4 pools file under "engraving". Kept so the label is not lost.
    {"key": "special", "name_key": "sys.bracelet.option_group_04"},
]

# The three columns, in the client's own order.
COLUMN_KEYS = ["basic", "combat_trait", "engraving"]

_GROUP_KEY_BY_NAME = {g["name_key"]: g["key"] for g in OPTION_GROUPS}
_GROUP_ORDER = {g["key"]: i for i, g in enumerate(OPTION_GROUPS)}

# Slot headings the client uses above the two kinds of line, plus the slot's own name.
UI_KEYS: dict[str, str] = {
    "slot": "tip.name.enum_equipslot_bracelet",
    "title": "sys.bracelet.ui_title_bracelet_effect",
    "fixed_slot": "sys.bracelet.ui_title_fixed_enchant_slot",
    "random_slot": "sys.bracelet.ui_title_random_enchant_slot",
}

# Stat id -> GameMsg name key, for the ids ``ItemOptionAlias`` does not carry.
#
# NOT invented: 15-20 are anchored by ``ArkPassive`` nodes 1010100…1010600, whose own
# names are 会心 / 专长 / 压制 / 迅捷 / 忍耐 / 异化 and whose options grant exactly
# those ids in that order; 6 is anchored by the ``SkillBuff`` rows that grant it and
# read 体力增加. See the module docstring.
STAT_NAME_KEYS: dict[int, str] = {
    6: "tip.name.enum_stattype_con",
    15: "tip.name.enum_stattype_criticalhit",
    16: "tip.name.enum_stattype_specialty",
    17: "tip.name.enum_stattype_oppression",
    18: "tip.name.enum_stattype_rapidity",
    19: "tip.name.enum_stattype_endurance",
    20: "tip.name.enum_stattype_mastery",
}

# ItemGradeOptionRandom.Type values a bracelet line can take.
_TYPE_STAT = 2
_TYPE_ABILITY = 3
_TYPE_COMBAT_EFFECT = 4
_TYPE_AMPLIFY_ATTACK = 54
_TYPE_AMPLIFY_DAMAGE = 59

# The client's own template for the two support amplify channels. They are the only
# lines whose text is a bracelet-specific string rather than an effect description.
_AMPLIFY_NAME_KEYS = {
    _TYPE_AMPLIFY_ATTACK: "sys.bracelet.addontype_attack_power_amplify_multiplier",
    _TYPE_AMPLIFY_DAMAGE: "sys.bracelet.addontype_skill_group_status_effect_stat_multiplier",
}

# BattlePoint Types, see the module docstring.
_BP_STAT_RATIO = 19
_BP_ADDON_ATTACK = 20
_BP_ADDON_DEFENSE = 21

# Type 19 ValueA: which key the ratio applies to.
_RATIO_CHANNEL_STAT = 1
_RATIO_CHANNEL_BY_OPTION_TYPE = {_TYPE_AMPLIFY_ATTACK: 2, _TYPE_AMPLIFY_DAMAGE: 3}

_RATE_DIVISOR = 10_000
_ROLE_BY_PRIMARY_KEY = {1: DPS, 2: SUPPORT}


def _pool_tier(pool_id: int) -> int | None:
    """The bracelet tier a roll pool belongs to, or ``None`` when it is not tiered.

    Shipped bracelet ids are ``2133xxxxx`` (tier 3) and ``2134xxxxx`` (tier 4) and the
    pool id equals the item id. Three pools (900000055, 900000339, 910000010) sit
    outside that numbering; they report ``None`` rather than being forced into a tier.
    """
    text = str(pool_id)
    if text.startswith("2133"):
        return 3
    if text.startswith("2134"):
        return 4
    return None


def _amps(tables: Tables) -> tuple[dict[str, dict[tuple[int, int], int]], dict[str, dict[int, int]]]:
    """BattlePoint bracelet coefficients as ``(addon_amps, stat_ratios)`` per role.

    ``addon_amps[role][(option_type, option_id)]`` is the raw ``ValueC`` of Type 20/21;
    ``stat_ratios[role][channel]`` is the raw ``ValueC`` of Type 19. Both stay scaled so
    the caller divides once, at the point it knows which formula applies.
    """
    addon: dict[str, dict[tuple[int, int], int]] = {DPS: {}, SUPPORT: {}}
    ratios: dict[str, dict[int, int]] = {DPS: {}, SUPPORT: {}}
    for row in tables.read("BattlePoint"):
        role = _ROLE_BY_PRIMARY_KEY.get(row["PrimaryKey"])
        if role is None:
            continue
        kind = row["Type"]
        if kind in (_BP_ADDON_ATTACK, _BP_ADDON_DEFENSE):
            addon[role][(row["ValueA"], row["ValueB"])] = row["ValueC"]
        elif kind == _BP_STAT_RATIO:
            # ValueA 1 keys by stat (ValueB); ValueA 2/3 are the support channels and
            # leave ValueB at 0, so the channel alone identifies the ratio.
            key = row["ValueB"] if row["ValueA"] == _RATIO_CHANNEL_STAT else row["ValueA"]
            ratios[role][key] = row["ValueC"]
    return addon, ratios


def _name_keys(tables: Tables) -> tuple[dict[int, str], dict[int, str], dict[int, str]]:
    """``(ability_desc, combat_effect_desc, stat_alias)`` GameMsg keys by id."""
    ability = {
        row["PrimaryKey"]: row["Desc"] for row in tables.read("Ability") if row["Desc"]
    }
    effect = {
        row["PrimaryKey"]: row["Desc"] for row in tables.read("CombatEffect") if row["Desc"]
    }
    stat: dict[int, str] = {}
    for row in tables.read("ItemOptionAlias"):
        # AliasType 1 is the stat alias; 2 keys by effect id and 3 by addon type, and
        # both of those duplicate text we already get from Desc.
        if row["AliasType"] == 1 and row["KeyStat"] and row["Name"]:
            stat.setdefault(row["KeyStat"], row["Name"])
    # The alias table wins where it has an entry; STAT_NAME_KEYS only fills the ids it
    # omits, so a future patch adding a real alias silently takes precedence.
    for stat_id, name_key in STAT_NAME_KEYS.items():
        stat.setdefault(stat_id, name_key)
    return ability, effect, stat


def option_groups() -> list[dict[str, str]]:
    """The client's four bracelet option groups, in its own order."""
    return [dict(g) for g in OPTION_GROUPS]


def option_lines(tables: Tables) -> list[dict]:
    """Every distinct bracelet option line, with its per-role combat-power amp.

    A line is identified by ``(option_type, stat, effect_id, value)`` — the same line
    recurs across pools, and its declared ``BraceletOptionGrade`` is *not* stable
    across them (169 of 347 lines appear at more than one grade), so the grades a line
    was seen at are reported as a set instead of being folded into its identity.

    ``amp`` is the fraction of combat power the line contributes, per role, and is
    ``0.0`` when the game grants none — the basic and combat-trait columns score
    nothing here, and emitting them as absent would read as missing data.
    """
    addon, ratios = _amps(tables)
    ability_desc, effect_desc, stat_alias = _name_keys(tables)

    grades: dict[tuple, set[int]] = defaultdict(set)
    tiers: dict[tuple, set[int]] = defaultdict(set)
    group_names: dict[tuple, set[str]] = defaultdict(set)
    for row in tables.read("ItemGradeOptionRandom"):
        name = str(row["GroupName"])
        if not name.startswith("sys.bracelet."):
            continue
        key = (row["Type"], row["KeyStat"], row["KeyIndex"], row["Value"])
        grades[key].add(row["BraceletOptionGrade"])
        group_names[key].add(name)
        tier = _pool_tier(row["PrimaryKey"])
        if tier is not None:
            tiers[key].add(tier)

    out: list[dict] = []
    for key in grades:
        option_type, stat, effect_id, value = key
        # 16 lines are filed under "engraving" by the tier 3/4 pools and under
        # "special" by the legacy one. The tiered pools win, because those are the
        # bracelets a player equips.
        names = group_names[key]
        if len(names) > 1:
            names = names - {"sys.bracelet.option_group_04"}
        group_name = sorted(names)[0]

        if option_type == _TYPE_ABILITY:
            name_key = ability_desc.get(effect_id)
        elif option_type == _TYPE_COMBAT_EFFECT:
            name_key = effect_desc.get(effect_id)
        elif option_type == _TYPE_STAT:
            name_key = stat_alias.get(stat)
        else:
            name_key = _AMPLIFY_NAME_KEYS.get(option_type)

        amp = {}
        for role in (DPS, SUPPORT):
            if option_type in (_TYPE_ABILITY, _TYPE_COMBAT_EFFECT):
                raw = addon[role].get((option_type, effect_id), 0)
                amp[role] = raw / _RATE_DIVISOR
            else:
                channel = (
                    stat
                    if option_type == _TYPE_STAT
                    else _RATIO_CHANNEL_BY_OPTION_TYPE.get(option_type, 0)
                )
                ratio = ratios[role].get(channel, 0)
                amp[role] = value * ratio / (_RATE_DIVISOR * _RATE_DIVISOR)

        out.append(
            {
                "id": _line_id(option_type, stat, effect_id, value),
                "group_key": _GROUP_KEY_BY_NAME[group_name],
                "option_type": option_type,
                "stat": stat or None,
                "effect_id": str(effect_id) if effect_id else None,
                "value": value,
                "grades": sorted(grades[key]),
                "tiers": sorted(tiers[key]),
                "name_key": name_key,
                "amp": amp,
            }
        )
    out.sort(
        key=lambda line: (
            _GROUP_ORDER[line["group_key"]],
            line["option_type"],
            line["stat"] or 0,
            int(line["effect_id"] or 0),
            line["value"],
        )
    )
    return out


def _line_id(option_type: int, stat: int, effect_id: int, value: int) -> str:
    """A stable id for a line, readable enough to grep for in a bug report."""
    if option_type in (_TYPE_ABILITY, _TYPE_COMBAT_EFFECT):
        return f"e{option_type}-{effect_id}"
    if option_type == _TYPE_STAT:
        return f"s{stat}-{value}"
    return f"a{option_type}-{value}"


def localization_keys(lines: list[dict]) -> list[str]:
    """Every GameMsg key the bracelet columns render, deduplicated and sorted.

    Includes the group labels and the slot headings, because a column with no heading
    is as broken as a line with no text.
    """
    keys = {line["name_key"] for line in lines if line["name_key"]}
    keys |= {g["name_key"] for g in OPTION_GROUPS}
    keys |= set(UI_KEYS.values())
    return sorted(keys)


def unnamed_stats(lines: list[dict]) -> list[int]:
    """Stat ids whose name the extraction cannot supply, sorted.

    Reported rather than hidden: a caller that renders these lines has to fall back to
    the group label, and it should be able to see how many are affected.
    """
    return sorted({line["stat"] for line in lines if line["stat"] and not line["name_key"]})
