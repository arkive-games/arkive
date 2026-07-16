import pytest

from palworld.merchants import CARAVAN_ID, collect_merchants
from palworld.env import optional_dir
from palworld.maps.common import read_rows

RAW = optional_dir("PALWORLD_RAW")

pytestmark = pytest.mark.skipif(
    RAW is None or not RAW.exists(),
    reason="PALWORLD_RAW not set or unavailable",
)


@pytest.fixture(scope="module")
def result():
    item_rows = read_rows(RAW / "DataTable/Item/DT_ItemDataTable_Common.json")
    return collect_merchants(RAW, item_rows, set(item_rows)), item_rows


def test_merchant_entries(result):
    (merchants, _), _ = result
    by_id = {m["id"]: m for m in merchants}

    # every merchant is well-formed
    for m in merchants:
        assert m["id"] and m["nameKey"] and m["currency"]
        assert m["products"] and all(p["item"] and "price" in p for p in m["products"])

    # currency resolution: special shops vs gold default.
    assert by_id["Medal_Shop_1"]["currency"] == "DogCoin"
    assert by_id["Bounty_Shop_1"]["currency"] == "BountyProof_1"
    assert by_id["Arena_Shop_1"]["currency"] == "BattleTicket"
    assert by_id["Village_Shop_1"]["currency"] == "Money"

    # name-key classification (vendor-stem aware: Volcano _Shop_2 is a weapon vendor).
    assert by_id["Village_Shop_1"]["nameKey"] == "general"
    assert by_id["Volcano_Shop_2"]["nameKey"] == "weapon"
    assert by_id["Medal_Shop_1"]["nameKey"] == "medal"


def test_caravan_aggregate(result):
    (merchants, _), _ = result
    by_id = {m["id"]: m for m in merchants}
    caravan_groups = [m for m in merchants if m["id"].startswith("Caravan_Shop_")]
    assert caravan_groups, "individual caravan shops still emitted"
    agg = by_id[CARAVAN_ID]
    assert agg["nameKey"] == "caravan"
    # the aggregate's item set is the union of the individual caravan shops.
    union = {p["item"] for m in caravan_groups for p in m["products"]}
    assert {p["item"] for p in agg["products"]} == union


def test_item_merchant_sources(result):
    (_, item_sources), _ = result
    # Village clothier sells the base hat schematic for gold (item Price).
    head = item_sources["Blueprint_Head003_1"]
    assert {"kind": "merchant", "merchant": "Village_Shop_1", "price": 500, "currency": "Money"} in head
    # A caravan-sold item collapses onto the single Caravan merchant (no
    # Caravan_Shop_* target survives in the item's chips).
    for src in item_sources.values():
        assert all(
            not s["merchant"].startswith("Caravan_Shop_") for s in src if s["kind"] == "merchant"
        )
