from aion2.tools.maps.creatures import build_pet_source_index


def test_build_pet_source_index_maps_npc_to_subtype_and_name():
    vehicle_list = [
        {"Name": "KrallReg_01", "CreatureType": "ECreatureType::Intellect",
         "SoulItemName": "VehicleSoul_KrallReg_01", "Desc": {"Key": "str_veh_KrallReg_01"}},
        # shop/Special pet (no soul item) must be skipped:
        {"Name": "BlackDragon_01", "CreatureType": "ECreatureType::Special",
         "SoulItemName": "None", "Desc": {"Key": "str_veh_BlackDragon_01"}},
    ]
    item_table = [{"Name": "VehicleSoul_KrallReg_01", "ID": {"Value": 534660001}}]
    npc_loot = [
        {"NpcId": {"Value": 2100075}, "VehicleSoulItemId": {"Value": 534660001}},
        # NPC that drops no soul (VehicleSoulItemId 0) must be skipped:
        {"NpcId": {"Value": 9999}, "VehicleSoulItemId": {"Value": 0}},
    ]
    idx = build_pet_source_index(vehicle_list, item_table, npc_loot)
    assert set(idx.keys()) == {2100075}
    assert idx[2100075]["subtype"] == "creatureIntellect"
    assert idx[2100075]["descKey"] == "str_veh_KrallReg_01"


from aion2.tools.maps.creatures import cluster_points


def test_cluster_points_groups_within_radius():
    # two tight groups; radius 200 keeps them separate
    pts = [(0, 0), (50, 0), (0, 50), (1000, 1000), (1000, 1050)]
    out = cluster_points(pts, 200)
    assert len(out) == 2
    assert sorted(c["count"] for c in out) == [2, 3]
    # every cluster carries a centroid
    assert all("x" in c and "y" in c for c in out)


def test_cluster_points_deterministic_regardless_of_order():
    a = cluster_points([(0, 0), (10, 0), (1000, 0)], 200)
    b = cluster_points([(1000, 0), (10, 0), (0, 0)], 200)
    assert a == b


def test_cluster_points_empty():
    assert cluster_points([], 200) == []


from aion2.tools.maps.creatures import build_creature_markers


class _FakeTransform:
    def world_to_pixel(self, x, y):
        return (x, y)  # identity, so pixel == world for easy assertions


class _FakeL10N:
    def en(self, key):
        return {"str_veh_A": "PetA"}.get(key, "")

    def zh_cn(self, key):
        return {"str_veh_A": "宠物A"}.get(key, "")


def test_build_creature_markers_clusters_per_pet():
    index = {100: {"subtype": "creatureFeral", "descKey": "str_veh_A", "petName": "A"}}
    spawn = [
        {"NpcIdList": [{"Value": 100}],
         "Positions": [{"Location": {"X": 0, "Y": 0}}, {"Location": {"X": 40, "Y": 0}}]},
        {"NpcIdList": [{"Value": 100}],
         "Positions": [{"Location": {"X": 3000, "Y": 3000}}]},
        # NPC not in the index contributes nothing:
        {"NpcIdList": [{"Value": 777}], "Positions": [{"Location": {"X": 5, "Y": 5}}]},
    ]
    out = build_creature_markers(spawn, _FakeTransform(), index, _FakeL10N(), radius=200)
    assert len(out) == 2  # (0,0)+(40,0) merge; (3000,3000) separate
    assert all(m["kind"] == "creatureFeral" for m in out)
    assert all(m["name_en"] == "PetA" and m["name_zhCN"] == "宠物A" for m in out)
    assert sorted(m["count"] for m in out) == [1, 2]
    assert all(isinstance(m["px"], list) and len(m["px"]) == 2 for m in out)


def test_build_creature_markers_no_transform_returns_empty():
    index = {100: {"subtype": "creatureFeral", "descKey": "str_veh_A", "petName": "A"}}
    spawn = [{"NpcIdList": [{"Value": 100}], "Positions": [{"Location": {"X": 0, "Y": 0}}]}]
    assert build_creature_markers(spawn, None, index, _FakeL10N()) == []
