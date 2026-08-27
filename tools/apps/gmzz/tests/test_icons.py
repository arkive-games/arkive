"""The goods -> icon join, and the ordering that keeps the two repos consistent."""

from __future__ import annotations

import json

import pytest

from gmzz import icons as icons_mod


GOODS = [
    {"ID": 30101, "SystemItemID": 2000235},
    {"ID": 30801, "SystemItemID": 2000235},  # HIGH_ tier: shares art with its base tier
    {"ID": 30102, "SystemItemID": 2000236},
]
ITEMS = {"2000235": {"icon": "2000235"}, "2000236": {"icon": "2000236"}}


@pytest.fixture
def stub_items(monkeypatch):
    monkeypatch.setattr(icons_mod, "load_table", lambda excel, name: ITEMS)


def test_resolves_every_goods_row(stub_items, tmp_path):
    assert icons_mod.goods_icon_ids(tmp_path, GOODS) == {
        "30101": "2000235", "30801": "2000235", "30102": "2000236",
    }


def test_raises_when_an_item_has_no_icon(stub_items, tmp_path):
    # Skipping would leave a hole in the wiki and hide a broken join.
    with pytest.raises(RuntimeError, match="no icon"):
        icons_mod.goods_icon_ids(tmp_path, GOODS + [{"ID": 39999, "SystemItemID": 111}])


def _layout(tmp_path, pngs: list[str]):
    raw = tmp_path / "raw"
    (raw / icons_mod.ICON_SOURCE).mkdir(parents=True)
    data_out = tmp_path / "data"
    (data_out / "traintrade").mkdir(parents=True)
    (data_out / "traintrade" / "goods.json").write_text(json.dumps(GOODS), encoding="utf-8")
    from PIL import Image
    for name in pngs:
        Image.new("RGBA", (4, 4), (1, 2, 3, 255)).save(raw / icons_mod.ICON_SOURCE / f"{name}.png")
    return raw, data_out, tmp_path / "res"


def test_writes_one_webp_per_distinct_icon(stub_items, tmp_path):
    raw, data_out, res_out = _layout(tmp_path, ["2000235", "2000236"])
    assert icons_mod.build(tmp_path, raw, data_out, res_out) == 2
    assert sorted(p.name for p in (res_out / icons_mod.OUT_SUBDIR).iterdir()) == [
        "2000235.webp", "2000236.webp",
    ]
    mapping = json.loads((data_out / "traintrade" / "icons.json").read_text(encoding="utf-8"))
    assert mapping["30801"] == mapping["30101"] == "2000235"


def test_a_partial_export_writes_nothing_at_all(stub_items, tmp_path):
    # data-gmzz and resource-gmzz are committed separately, so a run that wrote the
    # mapping and then failed would ship a dataset naming images that do not exist.
    raw, data_out, res_out = _layout(tmp_path, ["2000235"])
    with pytest.raises(FileNotFoundError, match="partial export"):
        icons_mod.build(tmp_path, raw, data_out, res_out)
    assert not (data_out / "traintrade" / "icons.json").exists()
    assert not (res_out / icons_mod.OUT_SUBDIR).exists()
