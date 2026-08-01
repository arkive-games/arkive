from __future__ import annotations

from vrising.markers.emit import build_marker_payload


def _boss(name: str, display: str) -> dict:
    return {
        "prefabName": name,
        "displayName": display,
        "level": 48,
        "act": "ActII",
        "region": "Dunley",
    }


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
