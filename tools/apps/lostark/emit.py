"""Assemble and write the data-lostark dataset."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

from . import (
    arkgrid,
    arkpassive,
    avatars,
    battlepoint,
    bracelets,
    classes,
    combatstats,
    engravings,
    esther,
    itemlevel,
    items,
    locales,
)
from .db import Tables

VERSION_FILE = "version.json"


def build(tables: Tables) -> dict[str, object]:
    """Every output file, keyed by its path relative to the data repo root."""
    coeffs = battlepoint.extract(tables)
    cores = arkgrid.extract(tables)
    gear = itemlevel.extract(tables)
    gear_items = items.extract(tables)

    orphans: dict[str, list[str]] = {}
    for role in (battlepoint.DPS, battlepoint.SUPPORT):
        kept, dropped = arkgrid.partition_values(coeffs[role]["ark_core_values"], cores)
        coeffs[role]["ark_core_values"] = kept
        orphans[role] = dropped

    slots = arkgrid.slots(tables, cores, coeffs[battlepoint.DPS]["ark_core_values"])
    support_slots = arkgrid.slots(
        tables, cores, coeffs[battlepoint.SUPPORT]["ark_core_values"]
    )

    class_rows = classes.extract(tables)
    bracelet_lines = bracelets.option_lines(tables)
    engraving_rows = engravings.extract(tables)
    engraving_penalties = engravings.stone_penalties(tables)
    stone_bonus = engravings.stone_level_bonus(tables)
    avatar_options = avatars.options(tables)
    avatar_combined = avatars.combined_slot(tables)
    esther_generations = esther.generations(tables)

    keys = set(arkgrid.localization_keys(cores))
    keys.update(classes.localization_keys(class_rows))
    gear_keys = items.localization_keys(gear_items)
    keys.update(gear_keys)
    keys.update(arkgrid.GRADE_NAME_KEYS.values())
    keys.update(arkpassive.localization_keys())
    keys.update(bracelets.localization_keys(bracelet_lines))
    keys.update(engravings.localization_keys(engraving_rows, engraving_penalties))
    keys.update(avatars.localization_keys())
    keys.update(combatstats.localization_keys())
    keys.update(esther.localization_keys(esther_generations))
    for group in (slots, support_slots):
        for slot in group:
            keys.add(slot["name_key"])
            for variants in slot["by_class"].values():
                for variant in variants:
                    keys.add(variant["name_key"])
                    for grade in variant["grades"].values():
                        keys.update(grade["options"].values())
    # A few option descriptions reference keys absent from one locale, so skip
    # rather than fail the whole emit on them.
    names = locales.resolve(tables, sorted(keys), missing="skip")
    # Gear labels are the one place a missing string is not survivable: the
    # selector would fall back to a bare numeric id, which is the very thing
    # these names exist to replace. So they are checked rather than skipped.
    for locale, table in names.items():
        blank = [key for key in gear_keys if not (table.get(key) or "").strip()]
        if blank:
            raise KeyError(
                f"{locale}: {len(blank)} gear name key(s) missing or blank, "
                f"e.g. {blank[:5]}"
            )
    # Support sub-classes are flagged by name, so the pass needs resolved text.
    class_rows = classes.extract(tables, names.get("zh-CN", {}))
    # Support class engravings are flagged by name too, so this pass also needs
    # resolved text.
    engraving_rows = engravings.extract(tables, names.get("zh-CN", {}))

    dataset: dict[str, object] = {
        "battlepoint/dps.json": coeffs[battlepoint.DPS],
        "battlepoint/support.json": coeffs[battlepoint.SUPPORT],
        "gear/item-levels.json": gear,
        "gear/items.json": gear_items,
        "arkgrid/cores.json": cores,
        "arkgrid/slots.json": {"dps": slots, "support": support_slots},
        "arkpassive/trees.json": {
            "trees": arkpassive.trees(),
            "uiKeys": arkpassive.UI_KEYS,
        },
        "bracelets/options.json": {
            "groups": bracelets.option_groups(),
            "columns": bracelets.COLUMN_KEYS,
            "uiKeys": bracelets.UI_KEYS,
            "lines": bracelet_lines,
            # Only KeyStat 11 is still unnamed: ArkPassive and SkillBuff
            # recover 6 and 15-20, so bracelets.STAT_NAME_KEYS covers the rest.
            # Its one non-bracelet appearance (SkillBuff 7310) has no text.
            "unnamedStats": bracelets.unnamed_stats(bracelet_lines),
        },
        "engravings/list.json": {
            "grades": engravings.GRADES,
            "gradeColourKeys": {
                str(k): v for k, v in engravings.GRADE_COLOUR_KEYS.items()
            },
            "uiKeys": engravings.UI_KEYS,
            "bookGrades": engravings.BOOK_GRADES,
            "bookMaxLevel": engravings.BOOK_MAX_LEVEL,
            "stoneMaxLevel": engravings.STONE_MAX_LEVEL,
            "channels": {str(k): v for k, v in engravings.CHANNELS.items()},
            "stonePenalties": engraving_penalties,
            "stoneLevelBonus": stone_bonus,
            # Every engraving now resolves to an icon: IconInfo.loa turns
            # Icon + IconIndex into a sprite file name rather than a cell
            # coordinate, so nothing is left unaddressable. icon_slug is still
            # nullable in the contract in case that changes.
            "engravings": engraving_rows,
        },
        "avatars/options.json": {
            "uiKeys": avatars.UI_KEYS,
            "slots": avatars.slots(),
            "grades": avatars.GRADES,
            "options": avatar_options,
            # A 上下装 garment fills the upper AND lower slot and its amp is
            # exactly their sum, so it needs no slot of its own -- recorded
            # rather than dropped.
            "combinedSlot": avatar_combined,
            "mainStatPercentStats": {
                str(k): v for k, v in avatars.MAIN_STAT_PERCENT_STATS.items()
            },
        },
        "combat/stats.json": {
            "uiKeys": combatstats.UI_KEYS,
            "stats": combatstats.stats(),
        },
        "esther/weapons.json": {
            "uiKeys": esther.UI_KEYS,
            "generations": esther_generations,
            # Options the client defines but no equipped weapon can reach.
            "unscoredOptionIds": esther.unscored_option_ids(tables),
        },
        "classes.json": class_rows,
        VERSION_FILE: {
            "source": "lostark-explorer",
            "generatedAt": datetime.now(UTC).isoformat(),
            "locales": list(locales.LOCALES),
            "counts": {
                "itemLevels": len(gear),
                "gearWeapons": len(gear_items["weapons"]),
                "gearSets": len(gear_items["sets"]),
                "arkCores": len(cores),
                "braceletLines": len(bracelet_lines),
                "engravings": len(engraving_rows),
                "avatarOptions": len(avatar_options),
                "estherWeapons": sum(len(g["weapons"]) for g in esther_generations),
                "engravingAmps": sum(
                    1
                    for e in engraving_rows.values()
                    if e["amp"]["dps"] or e["amp"]["support"] or e["heal_amp"]["support"]
                ),
                # The emitted tables, not the requested set: a key can resolve
                # under different casing, so the two differ.
                "localeKeys": max((len(t) for t in names.values()), default=0),
                "arkGridSlots": len(slots),
                "classes": len(class_rows),
            },
            # Not silently dropped: BattlePoint carries core ids with no definition.
            "droppedArkCoreValues": {role: len(ids) for role, ids in orphans.items()},
        },
    }
    for locale, table in names.items():
        dataset[f"locales/{locale}.json"] = table
    return dataset


def write(dataset: dict[str, object], out_dir: Path, source: Path | None = None) -> None:
    """Write ``dataset`` under ``out_dir``.

    Refuses to write inside ``source`` so a mistyped ``LOSTARK_DATA_OUT`` cannot
    scribble into the extracted client tree.
    """
    out_dir = Path(out_dir).resolve()
    if source is not None:
        src = Path(source).resolve()
        if out_dir == src or src in out_dir.parents:
            raise ValueError(f"refusing to write inside the source tree: {out_dir}")

    for name, payload in dataset.items():
        path = out_dir / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
