"""Player classes and their two sub-classes.

A class is a row in ``EFTable_PC``; its display name lives in GameMsg under
``tip.name.enum_playerclass_<key>``. The ``PC.Name`` column is an internal name
that usually normalises onto that key, but not always — see ``NAME_ALIASES``.

Sub-classes are the two class engravings in ``EFTable_AbilityEngrave`` where
``Class`` is non-zero; their names come from ``Ability.Name`` via GameMsg. Ark
grid order cores are keyed by the same class id, so selecting a class narrows
each order slot to the six cores that class can equip.
"""

from __future__ import annotations

import re
from collections import defaultdict

from .db import Tables

PLAYERCLASS_PREFIX = "tip.name.enum_playerclass_"

# `PC.Name` normalises onto the GameMsg key for 27 of 29 classes. These two are
# legacy mismatches: Lost Ark's Gunlancer is Warlord internally, and Kimaster is
# Force Master. Neither has a `gunlancer`/`kimaster` string in the client at all,
# so there is nothing to derive the link from.
NAME_ALIASES = {
    "Gunlancer": "warlord",
    "Kimaster": "forcemaster",
}

# Sub-classes that play as supports rather than damage dealers.
#
# NOT marked anywhere in the client data that we could find. This list is taken
# from the reference fan site's own support-class selector (圣骑士 / 墨灵 /
# 吟游诗人), which is a source rather than a guess, but it is still second-hand
# and worth confirming against the game.
SUPPORT_SUBCLASS_NAMES = {
    "祝福光环",  # HolyKnight — Blessed Aura
    "迫切救赎",  # Bard — Desperate Salvation
    "盛放",      # YinYangShi (墨灵) — Full Bloom
    "绵绵细雨",  # WeatherArtist (幻雨) — Drizzle
}


def _normalise(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", name.lower())


def extract(tables: Tables, locale_names: dict[str, str] | None = None) -> list[dict]:
    """Every class that has ark grid cores, with its sub-classes.

    ``locale_names`` maps GameMsg keys to resolved text; when supplied it is used
    only to flag which sub-class is the support one, since that decision is made
    by name.
    """
    # class id -> the two class-engraving ability ids
    engravings: dict[int, list[int]] = defaultdict(list)
    for row in tables.read("AbilityEngrave"):
        if row["Class"]:
            engravings[row["Class"]].append(row["PrimaryKey"])

    ability_name: dict[int, str] = {}
    for row in tables.read("Ability"):
        name = row.get("Name")
        if isinstance(name, str) and name:
            ability_name[row["PrimaryKey"]] = name

    # Available player-class name keys, indexed by their normalised suffix.
    with tables.connect("GameMsg") as con:
        available = {
            _normalise(key[len(PLAYERCLASS_PREFIX) :]): key
            for (key,) in con.execute(
                'SELECT KEY FROM "GameMsg_Chinese" WHERE KEY LIKE ? AND MSG <> ""',
                (PLAYERCLASS_PREFIX + "%",),
            )
        }

    with_cores = sorted({row["PCClass"] for row in tables.read("ArkGridCore") if row["PCClass"]})
    pc = {row["PrimaryKey"]: row for row in tables.read("PC")}

    out: list[dict] = []
    for class_id in with_cores:
        row = pc.get(class_id)
        if row is None:
            continue
        internal = row["Name"]
        key = available.get(_normalise(NAME_ALIASES.get(internal, internal)))

        subclasses = []
        for ability_id in sorted(set(engravings.get(class_id, []))):
            name_key = ability_name.get(ability_id)
            if not name_key:
                continue
            label = (locale_names or {}).get(name_key)
            subclasses.append(
                {
                    "ability_id": ability_id,
                    "name_key": name_key,
                    # Support sub-classes take the heal component; the rest are
                    # damage dealers.
                    "role": "support" if label in SUPPORT_SUBCLASS_NAMES else "dps",
                }
            )

        out.append(
            {
                "id": class_id,
                "base_class": row["BaseClass"],
                "internal_name": internal,
                "name_key": key,
                "subclasses": subclasses,
            }
        )
    return out


def localization_keys(rows: list[dict]) -> list[str]:
    keys = {r["name_key"] for r in rows if r["name_key"]}
    keys |= {s["name_key"] for r in rows for s in r["subclasses"]}
    return sorted(keys)
