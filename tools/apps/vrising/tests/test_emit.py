from __future__ import annotations

import pytest

from vrising.maps.emit import build_dataset as _build_dataset
from vrising.markers.official_text import (
    CAVE_PASSAGE_TEXT_REF,
    RESOURCE_TEXT_REFS,
    TYPE_NAME_GUIDS,
    WAYGATE_TEXT_REF,
)


def _official_texts() -> dict[str, dict[str, str]]:
    guids = TYPE_NAME_GUIDS | {
        ref.name_guid
        for ref in [
            *RESOURCE_TEXT_REFS.values(),
            WAYGATE_TEXT_REF,
            CAVE_PASSAGE_TEXT_REF,
        ]
    }
    return {
        guid: {locale: f"Official {guid}" for locale in ("en-US", "zh-CN", "zh-TW")}
        for guid in guids
    }


def build_dataset(parsed, regions, marker_payload=None):
    payload = {
        "markers": [],
        "labels": {},
        **(marker_payload or {}),
        "officialTexts": _official_texts(),
    }
    return _build_dataset(parsed, regions, payload)


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
        {"id": "poi_000", "name": "poi_000", "type": "poi",
         "borders": [[[10.0, 10.0], [20.0, 10.0], [20.0, 20.0], [10.0, 10.0]]]},
        {"id": "terr_000", "name": "terr_000", "type": "territory",
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


def test_unlocalized_region_geometry_does_not_create_markers():
    ds = build_dataset(_parsed(), _regions())
    assert ds["markers"]["Vardoran"] == []


def test_every_marker_has_the_contract_required_fields():
    ds = build_dataset(_parsed(), _regions())
    assert ds["markers"]["Vardoran"] == []


def test_additional_unlocalized_regions_still_do_not_create_markers():
    parsed = _parsed()
    parsed["entries"].append({
        "id": "poi_001", "kind": "poi", "index": 1, "accessId": [7, 8, 9],
        "center": [-100.0, -100.0], "min": [-110.0, -110.0], "max": [-90.0, -90.0],
        "aspect": [20.0, 20.0], "mask": "Texture2D/POIPolygon_1.png", "maskSize": [40, 40],
    })
    ds = build_dataset(parsed, _regions())
    assert ds["markers"]["Vardoran"] == []


def test_taxonomy_omits_unlocalized_region_marker_types():
    ds = build_dataset(_parsed(), _regions())
    categories = {cat["id"]: cat for cat in ds["types"]["categories"]}
    assert "regions" not in categories
    assert categories["bosses"]["pinVariant"] == "circular"
    assert categories["resources"]["pinVariant"] == "circular"
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
            "boss-fixed",
            "resource-quartz",
            "resource-iron",
            "resource-mechanical",
        }
        assert loc["markers"]["Vardoran"] == {}
        assert loc["regions"]["Vardoran"] == {}


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
        "labels": {
            "boss-test": {
                "name": "Test Boss",
                "localizedNames": {
                    "en-US": "Test Boss",
                    "zh-CN": "Test Boss",
                    "zh-TW": "Test Boss",
                },
            }
        },
        "resourcePools": [],
    }
    ds = build_dataset(_parsed(), _regions(), payload)
    marker = next(m for m in ds["markers"]["Vardoran"] if m["id"] == "boss-test")
    assert (marker["x"], marker["y"], marker["z"]) == (-12.0, 34.0, 2.0)
    for loc in ds["locales"].values():
        assert loc["markers"]["Vardoran"]["boss-test"]["name"] == "Test Boss"


def test_marker_payload_uses_game_localized_boss_names():
    payload = {
        "markers": [
            {
                "id": "boss-ziva",
                "category": "bosses",
                "subtype": "boss-fixed",
                "x": -12.0,
                "y": 34.0,
                "images": [],
                "contributors": [],
                "indexInSubtype": 1,
            }
        ],
        "labels": {
            "boss-ziva": {
                "name": "Ziva the Engineer",
                "localizedNames": {
                    "en-US": "Ziva the Engineer",
                    "zh-CN": "工程师齐瓦",
                    "zh-TW": "工程師齊瓦",
                },
            }
        },
        "resourcePools": [],
    }

    ds = build_dataset(_parsed(), _regions(), payload)

    assert ds["locales"]["en-US"]["markers"]["Vardoran"]["boss-ziva"]["name"] == (
        "Ziva the Engineer"
    )
    assert ds["locales"]["zh-CN"]["markers"]["Vardoran"]["boss-ziva"]["name"] == (
        "工程师齐瓦"
    )
    assert ds["locales"]["zh-TW"]["markers"]["Vardoran"]["boss-ziva"]["name"] == (
        "工程師齊瓦"
    )


def test_unresolved_regions_have_no_user_facing_locale_labels():
    ds = build_dataset(_parsed(), _regions())
    assert all(not loc["regions"]["Vardoran"] for loc in ds["locales"].values())


def test_an_unreviewed_calibration_is_refused():
    import vrising.maps.emit as emit

    original = emit.CALIBRATION_METHOD
    emit.CALIBRATION_METHOD = "guess"
    try:
        with pytest.raises(RuntimeError, match="CALIBRATION_METHOD"):
            build_dataset(_parsed(), _regions())
    finally:
        emit.CALIBRATION_METHOD = original
