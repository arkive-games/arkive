"""The Ark Passive trees — 进化 / 顿悟 / 飞跃 — and their karma medallions.

Names and colours come from GameMsg rather than being written here:
``tip.name.enum_arkpassivegroup_*`` is the enum behind ``ArkPassive.Group``, so
it is the client's own label for each tree.

The tree colours also settled how the medallion sheet splits.
``tip.name.karma_{tree}01`` wraps each karma name in its tree's colour — gold
``#f1d594``, blue ``#83e9ff``, green ``#c2ea55`` — and the 18 icons on page
``use_12`` of ``EFUI_ICONATLAS_U`` run six gold, six blue, six green, in
``Group`` order 0, 1, 2. That is evidence for the mapping rather than the usual
"everyone knows Evolution is orange".

Point totals score through BattlePoint Types 5/6/7 (one flat rate per point).
Only two of the three trees carry a second dial: Evolution has a karma rank
(Type 8) and Leap a karma level (Type 9); Enlightenment has neither, which is
why ``rank_scores``/``level_scores`` are stated per tree instead of assumed.
"""

from __future__ import annotations

# Group index -> the client's own key set for that tree.
TREES: list[dict[str, object]] = [
    {
        "key": "evolution",
        "group": 0,
        "name_key": "tip.name.enum_arkpassivegroup_evolution",
        "karma_name_key": "tip.name.karma_evolution01",
        "colour": "#f1d594",
        "tiers": 6,
        # BattlePoint Type 8 (karma stage step) keys off the evolution rank.
        "rank_scores": True,
        "level_scores": False,
    },
    {
        "key": "enlightenment",
        "group": 1,
        # The enum spells this one "enlightenment"; the UI keys spell it
        # "enlightment". Both exist in the client, so neither is a typo to fix.
        "name_key": "tip.name.enum_arkpassivegroup_enlightenment",
        "karma_name_key": "tip.name.karma_enlightenment01",
        "colour": "#83e9ff",
        "tiers": 6,
        "rank_scores": False,
        "level_scores": False,
    },
    {
        "key": "leap",
        "group": 2,
        "name_key": "tip.name.enum_arkpassivegroup_leap",
        "karma_name_key": "tip.name.karma_leap01",
        "colour": "#c2ea55",
        "tiers": 6,
        # BattlePoint Type 9 keys off the leap karma level.
        "rank_scores": False,
        "level_scores": True,
    },
]

# Number formats the game itself uses, so the cards read like the client:
# "{0}P" for points, "{0}阶位" for a tier, "{0}/{1}级" for a level.
UI_KEYS: dict[str, str] = {
    "title": "sys.arkpassive.ui_title",
    "point": "sys.arkpassive.ui_title_arkpassive_point",
    "tier": "sys.arkpassive.ui_title_list_item_tier",
    "level": "sys.arkpassive.ui_title_arkpassive_level",
    "total_point": "sys.arkpassive.ui_title_total_point",
}


def trees() -> list[dict[str, object]]:
    """The three trees, in the client's ``Group`` order."""
    return [dict(t) for t in TREES]


def localization_keys() -> list[str]:
    """Every GameMsg key the Ark Passive cards render."""
    keys = list(UI_KEYS.values())
    for tree in TREES:
        keys.append(str(tree["name_key"]))
        keys.append(str(tree["karma_name_key"]))
    return keys
