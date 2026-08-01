from __future__ import annotations

import pytest

from vrising.maps.emit import build_dataset


def _parsed():
    return {
        "mapImage": "Texture2D/ZoneMap_Wilderness_VRisingWorld.png",
        "mapSize": [6080, 6080],
        "entries": [
            {"id": "poi_000", "kind": "poi", "index": 0, "accessId": [1, 2, 3],
             "center": [-500.0, -300.0], "min": [-550.0, -325.0], "max": [-450.0, -275.0],
             "aspect": [100.0, 50.0], "mask": "Texture2D/POIPolygon_0.png", "maskSize": [200, 100]},
            {"id": "terr_000", "kind": "territory", "index": 0, "accessId": [4, 5, 6],
             "center": [-900.0, -700.0], "min": [-950.0, -750.0], "max": [-850.0, -650.0],
             "aspect": [100.0, 100.0], "mask": "Texture2D/Territory_0.png", "maskSize": [200, 200]},
        ],
        "unionBounds": {"min": [-950.0, -750.0], "max": [-450.0, -275.0]},
    }


def _regions():
    return [
        {"id": "poi_000", "name": "POI 1-2-3", "type": "poi",
         "borders": [[[10.0, 10.0], [20.0, 10.0], [20.0, 20.0], [10.0, 10.0]]]},
        {"id": "terr_000", "name": "Territory 4-5-6", "type": "territory",
         "borders": [[[30.0, 30.0], [40.0, 30.0], [40.0, 40.0], [30.0, 30.0]]]},
    ]


def test_maps_json_carries_the_tile_grid_and_the_calibration():
    ds = build_dataset(_parsed(), _regions())
    (m,) = ds["maps"]
    assert m["id"] == "Vardoran"
    assert (m["tileWidth"], m["tileHeight"]) == (1216, 1216)
    assert (m["tilesCountX"], m["tilesCountY"]) == (5, 5)
    assert m["tileWidth"] * m["tilesCountX"] == 6080
    assert set(m["worldBounds"]) == {"min", "max"}
    assert set(m["orientation"]) == {"pxAxis", "flipX", "flipY"}
    assert m["isVisible"] is True


def test_markers_are_raw_world_coordinates_not_pixels():
    ds = build_dataset(_parsed(), _regions())
    markers = ds["markers"]["Vardoran"]
    poi = next(m for m in markers if m["id"] == "poi_000")
    # The entry's CenterPosWS, untransformed — the engine projects it.
    assert (poi["x"], poi["y"]) == (-500.0, -300.0)


def test_every_marker_has_the_contract_required_fields():
    ds = build_dataset(_parsed(), _regions())
    for m in ds["markers"]["Vardoran"]:
        assert isinstance(m["id"], str) and m["id"]
        assert m["subtype"] in {"poi", "territory"}
        assert m["images"] == []
        assert m["contributors"] == []
        assert isinstance(m["indexInSubtype"], int)
        assert m["region"] == m["id"]


def test_index_in_subtype_counts_per_subtype_from_one():
    parsed = _parsed()
    parsed["entries"].append({
        "id": "poi_001", "kind": "poi", "index": 1, "accessId": [7, 8, 9],
        "center": [-100.0, -100.0], "min": [-110.0, -110.0], "max": [-90.0, -90.0],
        "aspect": [20.0, 20.0], "mask": "Texture2D/POIPolygon_1.png", "maskSize": [40, 40],
    })
    ds = build_dataset(parsed, _regions())
    by_id = {m["id"]: m for m in ds["markers"]["Vardoran"]}
    assert by_id["poi_000"]["indexInSubtype"] == 1
    assert by_id["poi_001"]["indexInSubtype"] == 2
    assert by_id["terr_000"]["indexInSubtype"] == 1


def test_taxonomy_carries_both_subtypes_with_icons():
    ds = build_dataset(_parsed(), _regions())
    categories = {cat["id"]: cat for cat in ds["types"]["categories"]}
    cat = categories["regions"]
    assert cat["id"] == "regions"
    ids = {s["id"]: s for s in cat["subtypes"]}
    assert set(ids) == {"poi", "territory"}
    assert ids["poi"]["icon"] == "MapIcon_CavePassage"
    assert ids["territory"]["defaultActive"] is True
    assert categories["bosses"]["pinVariant"] == "pin"
    assert {s["id"] for s in categories["resources"]["subtypes"]} >= {
        "resource-quartz",
        "resource-copper",
        "resource-iron",
        "resource-silver",
        "resource-mechanical",
    }


def test_locales_cover_every_language_and_namespace():
    ds = build_dataset(_parsed(), _regions())
    assert set(ds["locales"]) == {"en-US", "zh-CN", "zh-TW"}
    for lng, loc in ds["locales"].items():
        assert loc["maps"]["Vardoran"]["name"], lng
        assert set(loc["types"]["subtypes"]) >= {
            "poi",
            "territory",
            "boss-fixed",
            "resource-quartz",
            "resource-iron",
            "resource-mechanical",
        }
        assert set(loc["markers"]["Vardoran"]) == {"poi_000", "terr_000"}
        assert set(loc["regions"]["Vardoran"]) == {"poi_000", "terr_000"}


def test_marker_payload_is_merged_without_changing_world_coordinates():
    payload = {
        "markers": [
            {
                "id": "boss-test",
                "category": "bosses",
                "subtype": "boss-fixed",
                "x": -12.0,
                "y": 34.0,
                "z": 2.0,
                "images": [],
                "contributors": [],
                "indexInSubtype": 1,
            }
        ],
        "labels": {"boss-test": {"name": "Test Boss", "description": "Level 1"}},
        "resourcePools": [],
    }
    ds = build_dataset(_parsed(), _regions(), payload)
    marker = next(m for m in ds["markers"]["Vardoran"] if m["id"] == "boss-test")
    assert (marker["x"], marker["y"], marker["z"]) == (-12.0, 34.0, 2.0)
    for loc in ds["locales"].values():
        assert loc["markers"]["Vardoran"]["boss-test"]["name"] == "Test Boss"


def test_region_labels_are_identical_across_locales():
    """Region labels are access ids, not names — translating them would be
    inventing text the game never shipped."""
    ds = build_dataset(_parsed(), _regions())
    names = {lng: loc["regions"]["Vardoran"]["poi_000"]["name"] for lng, loc in ds["locales"].items()}
    assert len(set(names.values())) == 1
    assert "1-2-3" in names["en-US"]


def test_an_unreviewed_calibration_is_refused():
    import vrising.maps.emit as emit

    original = emit.CALIBRATION_METHOD
    emit.CALIBRATION_METHOD = "guess"
    try:
        with pytest.raises(RuntimeError, match="CALIBRATION_METHOD"):
            build_dataset(_parsed(), _regions())
    finally:
        emit.CALIBRATION_METHOD = original
