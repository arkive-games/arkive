"""Assemble and write the data-lostark dataset."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

from . import (
    arkgrid,
    arkpassive,
    battlepoint,
    bracelets,
    classes,
    engravings,
    itemlevel,
    locales,
)
from .db import Tables

VERSION_FILE = "version.json"


def build(tables: Tables) -> dict[str, object]:
    """Every output file, keyed by its path relative to the data repo root."""
    coeffs = battlepoint.extract(tables)
    cores = arkgrid.extract(tables)
    gear = itemlevel.extract(tables)

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

    keys = set(arkgrid.localization_keys(cores))
    keys.update(classes.localization_keys(class_rows))
    keys.update(arkgrid.GRADE_NAME_KEYS.values())
    keys.update(arkpassive.localization_keys())
    keys.update(bracelets.localization_keys(bracelet_lines))
    keys.update(engravings.localization_keys(engraving_rows, engraving_penalties))
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
    # Support sub-classes are flagged by name, so the pass needs resolved text.
    class_rows = classes.extract(tables, names.get("zh-CN", {}))
    # Support class engravings are flagged by name too, so this pass also needs
    # resolved text.
    engraving_rows = engravings.extract(tables, names.get("zh-CN", {}))

    dataset: dict[str, object] = {
        "battlepoint/dps.json": coeffs[battlepoint.DPS],
        "battlepoint/support.json": coeffs[battlepoint.SUPPORT],
        "gear/item-levels.json": gear,
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
            # Stat ids the client names in code rather than in any table, so
            # these lines ship without a name key instead of an invented one.
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
            # 7 of the 95 have icon_slug null: their atlas group ships no
            # texture at all, so the UI must render a placeholder.
            "engravings": engraving_rows,
        },
        "classes.json": class_rows,
        VERSION_FILE: {
            "source": "lostark-explorer",
            "generatedAt": datetime.now(UTC).isoformat(),
            "locales": list(locales.LOCALES),
            "counts": {
                "itemLevels": len(gear),
                "arkCores": len(cores),
                "braceletLines": len(bracelet_lines),
                "engravings": len(engraving_rows),
                "engravingAmps": sum(
                    1
                    for e in engraving_rows.values()
                    if e["amp"]["dps"] or e["amp"]["support"] or e["heal_amp"]["support"]
                ),
                "localeKeys": len(keys),
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
