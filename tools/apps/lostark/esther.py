"""Esther (神选英雄 / 에스더) weapons: the names behind BattlePoint Type 23.

Type 23 is ``esther_weapon`` and its amps were already emitted -- what was missing
is what the six rows *are*, so the calculator offered a dropdown of six bare
percentages. Nothing new is decoded here; a four-table join turns each row into
the weapon a player would recognise.

``ValueB`` is an ``EstherOptionId``
----------------------------------

The six ``ValueB`` values are ``{1,2,3}100{106,108}``, and each is an
``ItemEvolutionCommon.EstherOptionId``. Only two of the eleven evolution stages
grant an Esther option, which is why there are six rows and not sixty::

    BattlePoint Type 23
      ValueA = the evolution stage minus 100 (6 or 8), redundant with ValueB
      ValueB = ItemEvolutionCommon.EstherOptionId
      ValueC = amp x 1e-4, identical for both roles

The chain to a name, all of it real joins::

    EstherOptionId
      -> ItemEvolutionCommon (PrimaryKey, SecondaryKey=stage)   the evolution track
      -> ItemQualityOption.EvolutionCommonId                    the weapon family
      -> Item.QualityOptionId                                   29 per-class weapons

Each of the four families is one **generation** of the Esther weapon -- 29 items,
one per class, ``Grade = 7`` (``tip.name.enum_itemgrade_esther``). For a Berserker
the four are 山之浩劫 / 山之浩劫·崇天 / 山之浩劫·无垠 / 山之浩劫·庄严, and every
generation covers exactly the same 29 classes.

Two things the join reveals that the amps alone do not
-----------------------------------------------------

* **Generations 3 and 4 share an amp.** ``ItemQualityOption`` routes generation 4
  (``24110000``) through ``EvolutionCommonId 241200000`` for stages 100-109, and
  *that* track reuses generation 3's ``3100106``/``3100108``. So a generation-4
  weapon at stage 6 or 8 scores what a generation-3 one does. That is the client's
  own wiring, not a fallback on our part.
* **``4100106``/``4100108`` are dead.** ``ItemEvolutionCommon`` defines them on
  track ``241100000``, but ``ItemQualityOption`` only reaches that track at stage
  **110**, which grants no Esther option -- so no equipped weapon can select them,
  and BattlePoint carries no row for them either. They are reported by
  :func:`unscored_option_ids` rather than dropped, because they are the concrete
  form of the fan site's "Esther values are estimates" note: the higher grades it
  publishes are content the client has stubbed and not wired up.

Class matching
--------------

An Esther weapon item names exactly one ``Item.For<Class>`` column, and that
suffix is the class's ``PC.Name`` under :func:`lostark.classes` normalisation --
including its two aliases, since the client calls the Gunlancer ``Warlord`` and the
Force Master ``Kimaster`` in ``PC`` but ``ForWarlord``/``ForForceMaster`` on items.
All 29 match on both sides; :func:`generations` raises if they ever stop matching,
because a silent miss would hide a class's weapon behind an empty dropdown.
"""

from __future__ import annotations

from collections import defaultdict

from .battlepoint import DPS, SUPPORT
from .classes import NAME_ALIASES, _normalise
from .db import Tables

# The BattlePoint Type named ``esther_weapon``.
BP_ESTHER_WEAPON = 23

_RATE_DIVISOR = 10_000
_ROLE_BY_PRIMARY_KEY = {1: DPS, 2: SUPPORT}

# Item.Grade of an Esther weapon, and the client's name for that grade.
ESTHER_GRADE = 7
GRADE_NAME_KEY = "tip.name.enum_itemgrade_esther"

# Strings the panel renders. ``stage`` is "第{0}阶段" and takes the evolution
# stage number; ``title`` is the client's own 神选英雄武器 label.
UI_KEYS: dict[str, str] = {
    "title": "sys.esther.conversion_ui_text_item_esther",
    "stage": "sys.esther.evolution_ui_evolution_grade_now",
    "stages_title": "sys.esther.evolution_ui_effect_list_title",
    "grade": GRADE_NAME_KEY,
    "none": "sys.common.none",
}

# ItemEvolutionCommon.SecondaryKey is 100 + the displayed evolution stage.
_STAGE_BASE = 100


def _amps(tables: Tables) -> dict[int, dict[str, float]]:
    """``EstherOptionId`` -> per-role amp, from BattlePoint Type 23."""
    out: dict[int, dict[str, float]] = defaultdict(dict)
    for row in tables.read("BattlePoint"):
        if row["Type"] != BP_ESTHER_WEAPON:
            continue
        role = _ROLE_BY_PRIMARY_KEY.get(row["PrimaryKey"])
        if role is None:
            continue
        out[row["ValueB"]][role] = row["ValueC"] / _RATE_DIVISOR
    return dict(out)


def _tracks(tables: Tables) -> dict[tuple[int, int], int]:
    """``(EvolutionCommonId, stage)`` -> ``EstherOptionId``, for the stages that have one."""
    return {
        (row["PrimaryKey"], row["SecondaryKey"]): row["EstherOptionId"]
        for row in tables.read("ItemEvolutionCommon")
        if row["EstherOptionId"]
    }


def _families(tables: Tables) -> dict[int, dict[int, int]]:
    """``QualityOptionId`` -> ``{stage: EvolutionCommonId}``.

    A generation's stages do not all travel the same track: generation 4 runs
    stages 100-109 through one ``EvolutionCommonId`` and stage 110 through another,
    so the stage has to be part of the key.
    """
    out: dict[int, dict[int, int]] = defaultdict(dict)
    for row in tables.read("ItemQualityOption"):
        if row["EvolutionCommonId"]:
            out[row["PrimaryKey"]][row["SecondaryKey"]] = row["EvolutionCommonId"]
    return dict(out)


def _class_ids(tables: Tables) -> dict[str, int]:
    """Normalised class name -> ``PC.PrimaryKey``, matching :mod:`lostark.classes`."""
    return {
        _normalise(NAME_ALIASES.get(row["Name"], row["Name"])): row["PrimaryKey"]
        for row in tables.read("PC")
        if row["Name"]
    }


def _weapons(tables: Tables) -> dict[int, dict[str, dict[str, object]]]:
    """``QualityOptionId`` -> ``{class id: {item_id, name_key, internal_name}}``.

    Only ``Grade = ESTHER_GRADE`` items are taken. Raises when an item names more
    or fewer than one class, or names a class ``PC`` does not have: both would mean
    the ``For<Class>`` convention has changed and the mapping can no longer be
    trusted.
    """
    class_ids = _class_ids(tables)
    quality_ids = sorted(_families(tables))
    out: dict[int, dict[str, dict[str, object]]] = defaultdict(dict)
    with tables.connect("Item") as con:
        columns = [r[1] for r in con.execute("PRAGMA table_info(Item)") if r[1].startswith("For")]
        selected = ["PrimaryKey", "Name", "QualityOptionId", *columns]
        quoted = ", ".join(f'"{c}"' for c in selected)
        placeholders = ",".join("?" * len(quality_ids))
        # Explicit columns and a WHERE: EFTable_Item is 129,910 rows over 250-odd
        # columns and a full SELECT * scan of it costs about a minute.
        for row in con.execute(
            f"SELECT {quoted} FROM Item"
            f" WHERE Grade = ? AND QualityOptionId IN ({placeholders})",
            (ESTHER_GRADE, *quality_ids),
        ):
            named = [c[len("For") :] for c in columns if row[c]]
            if len(named) != 1:
                raise ValueError(f"Esther weapon {row['PrimaryKey']} names {len(named)} classes")
            internal = named[0]
            class_id = class_ids.get(_normalise(internal))
            if class_id is None:
                raise ValueError(
                    f"Esther weapon {row['PrimaryKey']} is for unknown class {internal}"
                )
            out[row["QualityOptionId"]][str(class_id)] = {
                "item_id": str(row["PrimaryKey"]),
                "name_key": row["Name"],
                "internal_name": internal,
            }
    return dict(out)


def generations(tables: Tables) -> list[dict[str, object]]:
    """The Esther weapon generations, each with its class weapons and scored stages.

    ``index`` is the generation number read off the ``QualityOptionId`` (``2N110000``)
    rather than from the list position, so a new generation slots in by id. Only
    stages that carry an ``EstherOptionId`` are listed -- the other nine grant
    weapon attack and item level, which the gear tables already cover.
    """
    amps = _amps(tables)
    tracks = _tracks(tables)
    families = _families(tables)
    weapons = _weapons(tables)

    out: list[dict[str, object]] = []
    for quality_id in sorted(families):
        by_class = weapons.get(quality_id)
        if not by_class:
            continue
        stages: list[dict[str, object]] = []
        for stage, track in sorted(families[quality_id].items()):
            option_id = tracks.get((track, stage))
            if option_id is None:
                continue
            amp = amps.get(option_id)
            if amp is None:
                # An option the client defines but BattlePoint does not score.
                # Reported by unscored_option_ids(), not emitted as a choice.
                continue
            stages.append(
                {
                    "stage": stage - _STAGE_BASE,
                    "esther_option_id": str(option_id),
                    "evolution_common_id": str(track),
                    "amp": amp,
                }
            )
        out.append(
            {
                "key": str(quality_id),
                "index": _generation_index(quality_id),
                "quality_option_id": str(quality_id),
                "weapons": dict(sorted(by_class.items(), key=lambda kv: int(kv[0]))),
                "stages": stages,
            }
        )
    return out


def _generation_index(quality_option_id: int) -> int:
    """``2N110000`` -> ``N``, the generation number the client's own id encodes."""
    text = str(quality_option_id)
    if len(text) != 8 or not text.startswith("2"):
        raise ValueError(f"not an Esther quality-option id: {quality_option_id}")
    return int(text[1])


def unscored_option_ids(tables: Tables) -> list[str]:
    """``EstherOptionId`` values the client defines but nothing can reach, sorted.

    An option is unreachable when ``ItemQualityOption`` never routes an equippable
    stage to the track that defines it, or when BattlePoint carries no amp for it.
    Both hold for ``4100106``/``4100108``.
    """
    amps = _amps(tables)
    tracks = _tracks(tables)
    reachable = {
        tracks[(track, stage)]
        for stages in _families(tables).values()
        for stage, track in stages.items()
        if (track, stage) in tracks
    }
    return sorted(
        str(option_id)
        for option_id in set(tracks.values())
        if option_id not in reachable or option_id not in amps
    )


def localization_keys(rows: list[dict[str, object]]) -> list[str]:
    """Every GameMsg key the Esther weapon picker renders, deduplicated and sorted."""
    keys = set(UI_KEYS.values())
    for generation in rows:
        for weapon in dict(generation["weapons"]).values():  # type: ignore[arg-type]
            name_key = weapon["name_key"]
            if name_key:
                keys.add(str(name_key))
    return sorted(keys)
