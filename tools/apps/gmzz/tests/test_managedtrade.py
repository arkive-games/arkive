import json

import pytest

from gmzz import icons as icons_mod
from gmzz import managedtrade as mt


def test_managedtrade_exports_every_table_but_the_stale_events():
    assert set(mt.TABLES) == {
        "ManagedTradeGoodsData",
        "ManagedTradeSiteData",
        "ManagedTradeRouteData",
        "ManagedTradeCaravanData",
        "ManagedTradeCaravanPartData",
        "ManagedTradeCaravanPropData",
        "ManagedTradeQuestData",
        "ManagedTradeConstData",
    }


def _payload(**overrides):
    payload = {
        "goods.json": [{"Id": 5101, "Weight": 15}],
        "sites.json": [{"Id": 101, "SpecialtyGoods": [5101]}, {"Id": 102, "SpecialtyGoods": []}],
        "routes.json": [{"RouteId": 1, "SiteA": 101, "SiteB": 102}],
        "commissions.json": [{"QuestId": 1001, "GoodsId": 5101}],
    }
    payload.update(overrides)
    return payload


def test_reference_check_accepts_a_consistent_dataset():
    mt.check_references(_payload())


@pytest.mark.parametrize(
    "override",
    [
        {"sites.json": [{"Id": 101, "SpecialtyGoods": [1001]}]},
        {"routes.json": [{"RouteId": 1, "SiteA": 101, "SiteB": 999}]},
        {"commissions.json": [{"QuestId": 1001, "GoodsId": 1001}]},
    ],
)
def test_reference_check_rejects_a_dangling_id(override):
    # The event table is dropped for naming goods that no longer exist; the
    # shipped tables must not be allowed to drift the same way unnoticed.
    with pytest.raises(RuntimeError, match="dangling"):
        mt.check_references(_payload(**override))


def test_reference_check_rejects_a_weightless_good():
    # The page divides by weight to rank goods by margin per unit of load.
    with pytest.raises(RuntimeError, match="no Weight"):
        mt.check_references(_payload(**{"goods.json": [{"Id": 5101, "Weight": 0}]}))


def test_formulas_must_both_be_present(monkeypatch, tmp_path):
    rows = {"1": {"Name": "TradeWar_BuyPrice", "Formula": "x"}, "2": {"Name": "Other", "Formula": "y"}}
    monkeypatch.setattr(mt, "load_table", lambda excel, name: rows)
    with pytest.raises(RuntimeError, match="TradeWar_SellPrice"):
        mt.formulas(tmp_path)
    rows["3"] = {"Name": "TradeWar_SellPrice", "Formula": "z"}
    assert set(mt.formulas(tmp_path)) == {"TradeWar_BuyPrice", "TradeWar_SellPrice"}


def test_icons_stage_writes_a_mapping_per_emitted_mode(monkeypatch, tmp_path):
    items = {"2000235": {"icon": "2000235"}, "2000243": {"icon": "2000243"}}
    monkeypatch.setattr(icons_mod, "load_table", lambda excel, name: items)
    raw = tmp_path / "raw"
    (raw / icons_mod.ICON_SOURCE).mkdir(parents=True)
    from PIL import Image

    for name in items:
        Image.new("RGBA", (4, 4), (1, 2, 3, 255)).save(raw / icons_mod.ICON_SOURCE / f"{name}.png")
    data_out = tmp_path / "data"
    (data_out / "traintrade").mkdir(parents=True)
    (data_out / "managedtrade").mkdir(parents=True)
    (data_out / "traintrade" / "goods.json").write_text(json.dumps([{"ID": 30101, "SystemItemID": 2000235}]))
    (data_out / "managedtrade" / "goods.json").write_text(json.dumps([{"Id": 5101, "ItemDisplayId": 2000243}]))

    assert icons_mod.build(tmp_path, raw, data_out, tmp_path / "res") == 2
    read = lambda sub: json.loads((data_out / sub / "icons.json").read_text(encoding="utf-8"))
    assert read("traintrade") == {"30101": "2000235"}
    assert read("managedtrade") == {"5101": "2000243"}


def test_icons_stage_needs_at_least_one_mode(tmp_path):
    with pytest.raises(FileNotFoundError, match="no goods.json"):
        icons_mod.build(tmp_path, tmp_path, tmp_path / "data", tmp_path / "res")
