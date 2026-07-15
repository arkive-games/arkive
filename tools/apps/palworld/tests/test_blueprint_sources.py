import pytest

from palworld.blueprint_sources import (
    KIND_ORDER,
    collect_sources,
    dungeon_lottery_items,
    recycler_output_items,
)
from palworld.env import optional_dir
from palworld.maps.common import read_rows

RAW = optional_dir("PALWORLD_RAW")
DATA_OUT = optional_dir("PALWORLD_DATA_OUT")

pytestmark = pytest.mark.skipif(
    RAW is None or not RAW.exists() or DATA_OUT is None or not DATA_OUT.exists(),
    reason="PALWORLD_RAW / PALWORLD_DATA_OUT not set or unavailable",
)

# The known area keys; game-L10N ones are labelled via labels.json `area`,
# the rest by app-side strings. A new key appearing here means the frontend
# needs a label for it.
AREAS = {"Grass", "Forest", "Desert", "Snow", "Volcano", "Sakurajima",
         "DarkIsland", "SkyIsland", "WorldTree", "Yakushima",
         "Oilrig", "OilrigMini", "OilrigLarge"}


@pytest.fixture(scope="module")
def sources():
    item_rows = read_rows(RAW / "DataTable/Item/DT_ItemDataTable_Common.json")
    return collect_sources(RAW, DATA_OUT, item_rows, set(item_rows))


def test_lottery_channels(sources):
    # A tier-2 katana schematic: locked chests + fishing + supply drops +
    # faction camps across several regions, with slot-math chances.
    kinds = {(s["kind"], s.get("area")) for s in sources["Blueprint_Katana_2"]}
    assert ("chest", "Desert") in kinds
    assert ("fishing", "Volcano") in kinds
    assert ("supply", "Desert") in kinds
    assert ("camp", "Snow") in kinds  # camp variants collapse onto the area
    for s in sources["Blueprint_Katana_2"]:
        assert 0 < s["chance"] <= 100
        assert s.get("grade", 1) >= 1

    # Oil-rig pools split by rig size; treasure maps point at the map item.
    all_entries = [s for lst in sources.values() for s in lst]
    assert {s["area"] for s in all_entries if s["kind"] == "oilrig"} == {
        "Oilrig", "OilrigMini", "OilrigLarge"
    }
    tm = [s for s in all_entries if s["kind"] == "treasureMap"]
    assert tm and all(s["item"].startswith("TreasureMap") for s in tm)
    assert any(s["kind"] == "salvage" and s["rank"] == 2 for s in all_entries)

    # Every area key is a known one (see AREAS docstring).
    assert {s["area"] for s in all_entries if "area" in s} <= AREAS
    # Entries are kind-discriminated and ordered by KIND_ORDER within an item.
    for lst in sources.values():
        ranks = [KIND_ORDER.index(s["kind"]) for s in lst]
        assert ranks == sorted(ranks)


def test_shrines(sources):
    # FurArmor+3 schematic is a placed Ancient Shrine reward (markers join —
    # unplaced pickup-table test rows must not count).
    shrine = [s for s in sources["Blueprint_FurArmor_4"] if s["kind"] == "shrine"]
    assert shrine and shrine[0]["count"] >= 1


def test_merchants(sources):
    def merchant(iid):
        return next(s for s in sources[iid] if s["kind"] == "merchant")

    # Village clothier sells the base hat schematics for gold (item Price).
    assert merchant("Blueprint_Head003_1") == {
        "kind": "merchant", "shop": "village", "price": 500, "currency": "Money",
    }
    # Medal trader prices in Dog Coins, arena shop in Battle Tickets.
    assert merchant("Blueprint_Spear_ForestBoss_5") == {
        "kind": "merchant", "shop": "medal", "price": 600, "currency": "DogCoin",
    }
    assert merchant("Blueprint_OctaviaRevolver_5") == {
        "kind": "merchant", "shop": "arena", "price": 1300, "currency": "BattleTicket",
    }


def test_raid_and_arena(sources):
    # The Yakushima raid relic schematic drops ONLY from the hard summon.
    assert sources["Blueprint_YakushimaBoss002_Relic"] == [
        {"kind": "raid", "pal": "YakushimaBoss002", "chance": 100},
    ]
    # Arena first-clear schematics carry the rank row name.
    arena = [s for s in sources["Blueprint_HandGun_Default_2"] if s["kind"] == "arena"]
    assert {"kind": "arena", "rank": "Silver"} in arena


def test_sibling_dataset_lookups():
    dungeon = dungeon_lottery_items(DATA_OUT)
    recycler = recycler_output_items(DATA_OUT)
    assert dungeon and any(i.startswith("Blueprint_") for i in dungeon)
    assert recycler and any(i.startswith("Blueprint_") for i in recycler)
