"""Recycler stage: emit the Ancient Civilization Relic Recycler conversion odds.

The recycler (``BP_BuildObject_AncientRelicRecycler``) consumes one of the five
World Tree relic items and rolls an item lottery. Sources:

* ``Blueprint/MapObject/BuildObject/BP_BuildObject_AncientRelicRecycler`` —
  the ``PalMapObjectRecyclerParameterComponent``'s ``RelicItemSettings`` map
  each input relic to a field-lottery name plus ``RequiredWorkAmount``, and
  carry the work-speed boost item (``BoostItemId`` ×
  ``RecycleBoostSpeedMultiplier``).
* ``Common/DT_FieldLotteryNameDataTable`` + ``Item/DT_ItemLotteryDataTable`` —
  the shared lottery machinery (see ``dungeons.py``): up to 15 slots rolled
  independently at ``ItemSlotN_ProbabilityPercent``; within a slot the item is
  weight-drawn with a count range.

Output:
  data-palworld/recycler.json   {building, boost, recipes: [{input, work, slots}]}

Item / building names come from the catalog locale files, so no locale output.

Run: ``uv run python -m palworld.recycler`` (from the ``tools`` dir).
"""

from __future__ import annotations

from pathlib import Path

from .dungeons import _lottery_slots
from .env import require_dir
from .maps.common import read_rows, round2, write_json

_BP = "Blueprint/MapObject/BuildObject/BP_BuildObject_AncientRelicRecycler.json"


def _recycler_params(raw: Path) -> dict:
    """``Properties`` of the blueprint's ``PalMapObjectRecyclerParameterComponent``."""
    import json

    for obj in json.loads((raw / _BP).read_text(encoding="utf-8")):
        if obj.get("Type") == "PalMapObjectRecyclerParameterComponent" and obj.get("Properties"):
            return obj["Properties"]
    raise RuntimeError(f"recycler: no PalMapObjectRecyclerParameterComponent in {_BP}")


def run_recycler(raw: Path, data_out: Path) -> dict:
    raw, data_out = Path(raw), Path(data_out)

    params = _recycler_params(raw)
    field_rows = read_rows(raw / "DataTable/Common/DT_FieldLotteryNameDataTable.json")
    by_field: dict[str, list] = {}
    for r in read_rows(raw / "DataTable/Item/DT_ItemLotteryDataTable.json").values():
        by_field.setdefault(r.get("FieldName"), []).append(r)

    recipes = []
    for setting in params.get("RelicItemSettings") or []:
        item = (setting.get("Key") or {}).get("Key")
        value = setting.get("Value") or {}
        lottery = (value.get("LotteryName") or {}).get("Key")
        slots = _lottery_slots(field_rows, by_field, lottery) if lottery else None
        if not item or not slots:
            print(f"recycler: skipping input {item}: lottery {lottery} missing or empty")
            continue
        recipes.append({
            "input": item,
            "work": round2(value.get("RequiredWorkAmount", 0.0)),
            "slots": slots,
        })

    out: dict = {"building": "AncientRelicRecycler", "recipes": recipes}
    boost_item = (params.get("BoostItemId") or {}).get("Key")
    if boost_item and boost_item != "None":
        out["boost"] = {
            "item": boost_item,
            "multiplier": round2(params.get("RecycleBoostSpeedMultiplier", 1.0)),
        }

    write_json(data_out / "recycler.json", out)
    print(f"recycler: {len(recipes)} recipes, boost={boost_item}")
    return out


if __name__ == "__main__":
    from .version import stamp_version

    run_recycler(require_dir("PALWORLD_RAW"), require_dir("PALWORLD_DATA_OUT"))
    stamp_version(require_dir("PALWORLD_DATA_OUT"))
