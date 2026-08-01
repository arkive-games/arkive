from __future__ import annotations

from vrising.markers.classify import (
    aggregate_display_markers,
    classify_prefab,
    summarize_randomized_resources,
)
from vrising.markers.randomized import (
    RandomizedSpawnDefinition,
    RandomizedSpawnGroup,
    RandomizedSpawnOption,
)


def test_required_minerals_have_distinct_exact_classifications():
    expected = {
        "Chain_Resource_Copper01": "copper",
        "Chain_Resource_IronBig01": "iron",
        "Chain_Resource_SulfurMedium01": "sulfur",
        "Chain_Resource_Silver03": "silver",
        "Chain_Resource_Quartz02": "quartz",
        "Chain_Resource_Emery02": "emery",
        "Chain_Resource_GemFlawless_01": "gem",
    }
    for name, kind in expected.items():
        result = classify_prefab(name)
        assert result is not None
        assert result.kind == kind
        assert result.aggregate is False


def test_common_stone_wood_and_plant_fibre_are_aggregated():
    names = (
        "Chain_Resource_Rock01",
        "Chain_Tree_Pine_01",
        "Chain_Pickup_PlantfiberBush_02",
    )
    for name in names:
        result = classify_prefab(name)
        assert result is not None
        assert result.aggregate is True


def test_named_herbs_and_unusual_resources_remain_exact():
    names = (
        "Chain_Pickup_BloodRose_01",
        "Chain_Pickup_Lotus_01",
        "Chain_Pickup_GhostShroom_01",
        "Chain_Resource_Obsidian04",
        "Chain_Resource_BloodCrystal02",
        "Chain_Pickup_PlantfiberSunflower_01",
        "Chain_Noctem_RiftCrystalChild01",
    )
    for name in names:
        result = classify_prefab(name)
        assert result is not None
        assert result.aggregate is False


def test_decorative_spawn_chains_are_not_resources():
    assert classify_prefab("Chain_Noctem_BossThrone01") is None
    assert classify_prefab("Chain_Crate_Large_01") is None


def test_random_mineral_prefabs_are_not_mislabeled_as_one_certain_resource():
    result = classify_prefab("RandChain_Minerals_Type_A")
    assert result is not None
    assert result.kind == "random_mineral"
    assert result.aggregate is False


def test_randomized_plants_and_mechanical_resources_are_preserved():
    assert classify_prefab("RandChain_Vegetation_Type_A").kind == "random_plant"
    assert classify_prefab("RandChain_Mechs_Type_A").kind == "random_special"


def test_resource_containers_and_mine_carts_are_not_omitted():
    expected = {
        "Chain_Emery01_Barrel01": "emery",
        "Chain_Strongblade_Emery01_Crate02": "emery",
        "Chain_MineCart_01_Iron": "iron",
        "Chain_MineCart_01_Silver": "silver",
        "Chain_Resource_Mech03": "mechanical",
    }
    for name, kind in expected.items():
        result = classify_prefab(name)
        assert result is not None
        assert result.kind == kind
        assert result.aggregate is False


def test_randomized_resource_summary_preserves_weighted_outcomes():
    definition = RandomizedSpawnDefinition(
        prefab_id=1,
        prefab_name="RandChain_Minerals_Test",
        settings_prefab_id=2,
        settings_prefab_name="RandomChain_Minerals_Test",
        groups=(
            RandomizedSpawnGroup(
                weight=3.0,
                probability=0.75,
                options=(
                    RandomizedSpawnOption(
                        prefab_id=3,
                        prefab_name="Chain_Resource_Rock01",
                        weight=1.0,
                        probability=0.75,
                    ),
                ),
            ),
            RandomizedSpawnGroup(
                weight=1.0,
                probability=0.25,
                options=(
                    RandomizedSpawnOption(
                        prefab_id=4,
                        prefab_name="Chain_Resource_GemCrude_01",
                        weight=1.0,
                        probability=0.25,
                    ),
                ),
            ),
        ),
    )
    summary = summarize_randomized_resources(definition)
    probabilities = {
        outcome["resource"]["kind"]: outcome["probability"]
        for outcome in summary["outcomes"]
    }
    assert probabilities == {"gem": 0.25, "stone": 0.75}


def test_display_aggregation_preserves_exact_points_and_counts_dense_points():
    dense = classify_prefab("Chain_Tree_Pine_01")
    exact = classify_prefab("Chain_Resource_Quartz01")
    records = [
        {"worldPosition": [1.0, 0.0, 1.0], "resource": dense.to_dict()},
        {"worldPosition": [3.0, 0.0, 2.0], "resource": dense.to_dict()},
        {"worldPosition": [2.0, 0.0, 2.0], "resource": exact.to_dict()},
    ]
    display = aggregate_display_markers(records, grid_size=40.0)
    assert len(display) == 2
    tree = next(item for item in display if item["resource"]["kind"] == "wood")
    quartz = next(item for item in display if item["resource"]["kind"] == "quartz")
    assert tree["aggregated"] is True
    assert tree["sourceCount"] == 2
    assert tree["worldPosition"] == [2.0, 0.0, 1.5]
    assert quartz["aggregated"] is False
    assert quartz["sourceCount"] == 1
