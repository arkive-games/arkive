"""Assemble and write the data-lostark dataset."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

from . import arkgrid, battlepoint, classes, itemlevel, locales
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

    keys = set(arkgrid.localization_keys(cores))
    keys.update(classes.localization_keys(class_rows))
    keys.update(arkgrid.GRADE_NAME_KEYS.values())
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

    dataset: dict[str, object] = {
        "battlepoint/dps.json": coeffs[battlepoint.DPS],
        "battlepoint/support.json": coeffs[battlepoint.SUPPORT],
        "gear/item-levels.json": gear,
        "arkgrid/cores.json": cores,
        "arkgrid/slots.json": {"dps": slots, "support": support_slots},
        "classes.json": class_rows,
        VERSION_FILE: {
            "source": "lostark-explorer",
            "generatedAt": datetime.now(UTC).isoformat(),
            "locales": list(locales.LOCALES),
            "counts": {
                "itemLevels": len(gear),
                "arkCores": len(cores),
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
