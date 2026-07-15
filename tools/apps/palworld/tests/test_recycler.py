import json

import pytest

from palworld.env import optional_dir
from palworld.recycler import run_recycler

RAW = optional_dir("PALWORLD_RAW")


@pytest.mark.skipif(RAW is None or not RAW.exists(), reason="PALWORLD_RAW not set or raw Palworld export not available")
def test_recycler_integration(tmp_path):
    out = run_recycler(RAW, tmp_path)

    assert out["building"] == "AncientRelicRecycler"
    # Feeding World Tree Holy Water speeds the conversion up.
    assert out["boost"] == {"item": "WorldTreeHolyWater", "multiplier": 1.5}

    # One recipe per relic tier, in tier order, with doubling work amounts.
    recipes = out["recipes"]
    assert [r["input"] for r in recipes] == [f"WorldTreeRelic_{i:02d}" for i in range(1, 6)]
    assert [r["work"] for r in recipes] == [6000, 12000, 24000, 48000, 96000]

    # Tier 1: guaranteed wood + ore, then the rarer bonus slots.
    slots1 = recipes[0]["slots"]
    assert slots1[0]["prob"] == 100.0
    assert slots1[0]["items"] == [
        {"item": "Wood_WorldTree", "weight": 1.0, "min": 1, "max": 3, "grade": 1},
    ]
    assert slots1[1]["items"][0]["item"] == "WorldTreeOre"
    # Awakening-gem bonus slots: same 9-element pool at halving chances.
    gem_slots = [s for s in slots1 if len(s["items"]) == 9]
    assert [s["prob"] for s in gem_slots] == [10.0, 5.0, 2.5, 1.25, 0.63]
    assert {i["item"] for i in gem_slots[0]["items"]} == {
        f"PalAwakening_Material_{e}"
        for e in ("Water", "Electric", "Ground", "Grass", "Fire", "Ice", "Dragon", "Dark", "Neutral")
    }
    # Ancient Civilization Core slot.
    core = next(s for s in slots1 if s["items"][0]["item"] == "AncientParts2")
    assert core["prob"] == 20.0 and core["items"][0]["max"] == 1
    # Blueprint slot exists but is a long shot at tier 1.
    bp = next(s for s in slots1 if s["items"][0]["item"].startswith("Blueprint_"))
    assert bp["prob"] == 0.13 and len(bp["items"]) == 28

    # Tier 5 gains the mutation-implant slot (absent below tier 5) and the
    # blueprint slot jumps to 20%.
    slots5 = recipes[4]["slots"]
    mut = [s for s in slots5 if any(i["item"].startswith("PalPassiveSkillChange_Consumable_MutationPal") for i in s["items"])]
    assert len(mut) == 1 and mut[0]["prob"] == 19.44
    assert not any(
        i["item"].startswith("PalPassiveSkillChange_Consumable_MutationPal")
        for s in recipes[0]["slots"] for i in s["items"]
    )
    bp5 = next(s for s in slots5 if s["items"][0]["item"].startswith("Blueprint_"))
    assert bp5["prob"] == 20.0

    # The dataset the frontend fetches.
    on_disk = json.loads((tmp_path / "recycler.json").read_text(encoding="utf-8"))
    assert on_disk == out
