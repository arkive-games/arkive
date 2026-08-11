from __future__ import annotations

from vrising.markers.emit import build_marker_payload as _build_marker_payload
from vrising.markers.official_text import RESOURCE_TEXT_REFS
from vrising.markers.resource_icons import RESOURCE_ICONS, RESOURCE_ICON_SOURCES


def _boss(name: str, display: str) -> dict:
    return {
        "prefabName": name,
        "displayName": display,
        "level": 48,
        "act": "ActII",
        "region": "Dunley",
        "localizedNames": {
            "en-US": display,
            "zh-CN": display,
            "zh-TW": display,
        },
    }


def _localized(value: str) -> dict[str, str]:
    return {locale: value for locale in ("en-US", "zh-CN", "zh-TW")}


def _official_texts() -> dict:
    return {
        "byGuid": {},
        "resources": {
            detail: {"localizedNames": _localized(f"Official {detail}")}
            for detail in RESOURCE_TEXT_REFS
        },
        "waygate": {
            "localizedNames": _localized("Official Vampire Waygate"),
            "localizedDescriptions": _localized("Official waygate description"),
        },
        "cavePassage": {
            "localizedNames": _localized("Official Cave Passage"),
        },
    }


def build_marker_payload(*args):
    return _build_marker_payload(*args, official_texts=_official_texts())


def test_marker_payload_uses_unity_xz_for_the_map_and_keeps_height():
    payload = build_marker_payload(
        [
            {
                "worldPosition": [10.0, 3.5, 20.0],
                "resource": {"kind": "quartz", "detail": "quartz", "aggregate": False},
                "sourceCount": 1,
            }
        ],
        [],
    )
    (marker,) = payload["markers"]
    assert (marker["x"], marker["y"], marker["z"]) == (10.0, 20.0, 3.5)
    assert marker["subtype"] == "resource-quartz"
    assert marker["icon"] == "ResourceIcon_Quartz"


def test_every_public_resource_kind_has_one_reviewed_icon():
    expected = {
        "copper",
        "crystal",
        "emery",
        "gem",
        "iron",
        "mechanical",
        "quartz",
        "silver",
        "sulfur",
    }
    assert set(RESOURCE_ICONS) == expected
    assert set(RESOURCE_ICON_SOURCES) == expected
    assert len(set(RESOURCE_ICONS.values())) == len(expected)


def test_dense_ordinary_and_mixed_random_resources_are_not_emitted():
    ordinary = [
        {
            "worldPosition": [float(index), 0.0, 20.0],
            "resource": {"kind": kind, "detail": kind, "aggregate": True},
            "sourceCount": 1,
        }
        for index, kind in enumerate(("stone", "wood", "plant"))
    ]
    record = {
        "worldPosition": [10.0, 0.0, 20.0],
        "resource": {
            "kind": "random_mineral",
            "detail": "random_mineral_spawn",
            "aggregate": False,
        },
        "sourceCount": 1,
        "randomizedResources": {
            "settingsPrefabName": "RandomChain_Minerals_A",
            "outcomes": [
                {
                    "resource": {"kind": "stone", "detail": "stone"},
                    "probability": 0.75,
                },
                {
                    "resource": {"kind": "quartz", "detail": "quartz"},
                    "probability": 0.25,
                },
            ],
        },
    }
    payload = build_marker_payload(ordinary + [record], [])
    assert payload["markers"] == []
    assert payload["summary"]["omittedResourcePoints"] == {
        "plant": 1,
        "random_mineral": 1,
        "stone": 1,
        "wood": 1,
    }


def test_random_mechanical_chain_is_folded_into_mechanical_resources():
    record = {
        "worldPosition": [10.0, 0.0, 20.0],
        "resource": {
            "kind": "random_special",
            "detail": "random_mech_spawn",
            "aggregate": False,
        },
        "sourceCount": 1,
        "randomizedResources": {
            "settingsPrefabName": "RandomChain_Mechs_GloomRot_A",
            "outcomes": [
                {
                    "resource": {"kind": "mechanical", "detail": "mechanical_resource"},
                    "probability": 1.0,
                }
            ],
        },
    }
    payload = build_marker_payload([record], [])
    assert payload["markers"][0]["subtype"] == "resource-mechanical"
    assert payload["resourcePools"] == []


def test_developer_island_resources_are_not_emitted():
    payload = build_marker_payload(
        [
            {
                "chunkName": "Dev_Island_Chunk",
                "worldPosition": [10.0, 0.0, 20.0],
                "resource": {"kind": "quartz", "detail": "quartz", "aggregate": False},
                "sourceCount": 1,
            }
        ],
        [],
    )
    assert payload["markers"] == []
    assert payload["summary"]["nonPublicResourcePoints"] == 1


def test_fixed_boss_marker_keeps_level_and_real_spawn_position():
    payload = build_marker_payload(
        [],
        [{"boss": _boss("CHAR_Fixed", "Fixed"), "worldPosition": [7.0, 8.0, 9.0]}],
    )
    (marker,) = payload["markers"]
    assert marker["movement"] == "fixed"
    assert (marker["x"], marker["y"], marker["z"]) == (7.0, 9.0, 8.0)
    assert marker["bossLevel"] == 48


def test_fixed_boss_marker_includes_its_reviewed_portrait():
    prefab = "CHAR_Gloomrot_Iva_VBlood"
    payload = build_marker_payload(
        [],
        [{"boss": _boss(prefab, "Ziva"), "worldPosition": [7.0, 8.0, 9.0]}],
    )

    assert payload["markers"][0]["images"] == [f"bosses/{prefab}.webp"]
    assert payload["markers"][0]["icon"] == f"BossPortrait_{prefab}"


def test_fixed_boss_marker_keeps_official_localized_names():
    boss = _boss("CHAR_Gloomrot_Iva_VBlood", "Ziva the Engineer")
    boss["localizedNames"] = {
        "en-US": "Ziva the Engineer",
        "zh-CN": "工程师齐瓦",
        "zh-TW": "工程師齊瓦",
    }
    payload = build_marker_payload(
        [],
        [{"boss": boss, "worldPosition": [7.0, 8.0, 9.0]}],
    )

    label = next(iter(payload["labels"].values()))
    assert label["localizedNames"] == boss["localizedNames"]


def test_roaming_boss_emits_one_marker_with_an_ordered_chunk_corridor():
    prefab = "CHAR_Bandit_Chaosarrow_VBlood"
    boss = _boss(prefab, "Lidia the Chaos Archer")
    boss["localizedNames"] = {
        "en-US": "Lidia the Chaos Archer",
        "zh-CN": "混沌弓箭手莉迪亚",
        "zh-TW": "混沌弓箭手莉迪亞",
    }
    payload = build_marker_payload(
        [],
        [],
        [
            {
                "boss": boss,
                "routePrecision": "chunk-corridor",
                "route": [
                    {"worldPosition": [10.0, 0.0, 20.0]},
                    {"worldPosition": [30.0, 0.0, 40.0]},
                    {"worldPosition": [50.0, 0.0, 60.0]},
                ],
            }
        ],
    )

    (marker,) = payload["markers"]
    assert marker["subtype"] == "boss-roaming"
    assert marker["movement"] == "roaming"
    assert marker["routePrecision"] == "chunk-corridor"
    assert marker["route"] == [
        {"x": 10.0, "y": 20.0, "z": 0.0},
        {"x": 30.0, "y": 40.0, "z": 0.0},
        {"x": 50.0, "y": 60.0, "z": 0.0},
    ]
    assert marker["icon"] == f"BossPortrait_{prefab}"
    assert payload["summary"]["roamingBossMarkers"] == 1
    assert payload["summary"]["roamingRouteStops"] == 3


def test_waygate_marker_keeps_its_reviewed_position_precision():
    payload = build_marker_payload(
        [],
        [],
        [],
        [
            {
                "kind": "waygate",
                "waygateId": "navigation-waygate-9-10",
                "chunkName": "Farbane_Mid18_Waypoint_Territory",
                "worldPosition": [-1722.5, 10.0, -1462.5],
                "positionPrecision": "authored-transform",
            }
        ],
    )

    (marker,) = payload["markers"]
    assert marker["category"] == "navigation"
    assert marker["subtype"] == "navigation-waygate"
    assert marker["positionPrecision"] == "authored-transform"
    assert marker["id"] == "navigation-waygate-9-10"
    assert marker["icon"] == "MapIcon_RespawnGateway"
    assert payload["summary"]["navigationMarkers"] == 1
    label = next(iter(payload["labels"].values()))
    assert label["localizedNames"]["zh-CN"] == "Official Vampire Waygate"
    assert label["localizedDescriptions"]["zh-CN"] == "Official waygate description"


def test_cave_passage_marker_keeps_official_pair_and_authored_position():
    payload = build_marker_payload(
        [],
        [],
        [],
        [
            {
                "kind": "cave-passage",
                "endpointId": "navigation-cave-passage-6-10-0",
                "pairedEndpointId": "navigation-cave-passage-15-20-0",
                "worldPosition": [-2097.25, 5.0, -1573.0],
                "positionPrecision": "authored-transform",
                "connection": "bidirectional",
                "connectionGroup": 1,
            },
            {
                "kind": "cave-passage",
                "endpointId": "navigation-cave-passage-15-20-0",
                "pairedEndpointId": "navigation-cave-passage-6-10-0",
                "worldPosition": [-683.25, 0.0, 8.25],
                "positionPrecision": "authored-transform",
                "connection": "bidirectional",
                "connectionGroup": 1,
            },
        ],
    )

    first, second = payload["markers"]
    assert first["subtype"] == "navigation-cave-passage"
    assert first["icon"] == "MapIcon_CavePassage"
    assert first["positionPrecision"] == "authored-transform"
    assert first["pairedMarkerId"] == second["id"]
    assert second["pairedMarkerId"] == first["id"]
    assert first["connection"] == "bidirectional"
    assert first["connectionGroup"] == second["connectionGroup"] == 1
    assert payload["summary"]["cavePassageMarkers"] == 2
    assert payload["summary"]["cavePassagePairs"] == 1
    assert payload["labels"][first["id"]]["localizedNames"]["en-US"] == (
        "Official Cave Passage"
    )
