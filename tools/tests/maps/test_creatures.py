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
    # each marker carries the pet identity, so emit can count a pet once
    assert all(m["petKey"] == "str_veh_A" for m in out)


def test_build_creature_markers_no_transform_returns_empty():
    index = {100: {"subtype": "creatureFeral", "descKey": "str_veh_A", "petName": "A"}}
    spawn = [{"NpcIdList": [{"Value": 100}], "Positions": [{"Location": {"X": 0, "Y": 0}}]}]
    assert build_creature_markers(spawn, None, index, _FakeL10N()) == []


def test_extract_world_l_a_emits_creature_markers():
    """Integration: parse the real World_L_A export and check creature markers.

    Requires the raw export (RAW_DATA_PATH from tools/.env, loaded by
    aion2.tools.__init__). The expected count band is wide because the
    deterministic (sorted) clusterer differs slightly from exploratory counts.
    """
    from aion2.tools.maps.extract import extract_map
    from aion2.tools.maps.l10n import L10N

    data = extract_map("World_L_A", L10N())
    creatures = [w for w in data["WorldMarkers"] if str(w["kind"]).startswith("creature")]
    assert 250 <= len(creatures) <= 500
    assert {w["kind"] for w in creatures} <= {
        "creatureIntellect", "creatureFeral", "creatureNature",
        "creatureTrans", "creatureSpecial",
    }
    for w in creatures:
        assert w["px"] and 0 <= w["px"][0] <= 8192 and 0 <= w["px"][1] <= 8192
        assert w["name_en"]      # localized pet name, non-empty
        assert w["count"] >= 1


def test_emit_frontend_routes_creature_marker():
    from aion2.tools.maps.emit_frontend import build_markers

    map_data = {
        "Name": "TestMap",
        "WorldMarkers": [
            {"kind": "creatureFeral", "px": [100.0, 200.0],
             "name_en": "Fossa", "name_zhCN": "波沙", "count": 7},
        ],
    }
    markers, locale = build_markers(map_data)
    m = next(m for m in markers if m["subtype"] == "creatureFeral")
    assert m["category"] == "creature"
    assert m["tier"] == 3
    assert m["x"] == 100.0 and m["y"] == 200.0
    assert locale[m["id"]]["name_en"] == "Fossa"
    assert locale[m["id"]]["desc_en"] == "7 spawn points"
    assert locale[m["id"]]["desc_zhCN"] == "7 处刷新点"


def test_emit_frontend_creature_index_is_per_pet():
    """The same pet counts once in the sidebar: every spawn cluster of a pet
    shares one indexInSubtype (what subtypeCounts tallies), while each cluster
    keeps a unique marker id."""
    from collections import Counter
    from aion2.tools.maps.emit_frontend import build_markers

    map_data = {
        "Name": "TestMap",
        "WorldMarkers": [
            {"kind": "creatureFeral", "px": [10.0, 10.0], "name_en": "A",
             "name_zhCN": "甲", "count": 3, "petKey": "str_veh_A"},
            {"kind": "creatureFeral", "px": [900.0, 900.0], "name_en": "A",
             "name_zhCN": "甲", "count": 2, "petKey": "str_veh_A"},
            {"kind": "creatureFeral", "px": [50.0, 50.0], "name_en": "B",
             "name_zhCN": "乙", "count": 1, "petKey": "str_veh_B"},
        ],
    }
    markers, _ = build_markers(map_data)
    feral = [m for m in markers if m["subtype"] == "creatureFeral"]
    assert len(feral) == 3
    assert len({m["id"] for m in feral}) == 3        # unique id per cluster
    idx_counts = Counter(m["indexInSubtype"] for m in feral)
    assert len(idx_counts) == 2                       # 2 distinct pets -> sidebar counts 2
    assert sorted(idx_counts.values()) == [1, 2]      # pet A's 2 clusters share 1 index; pet B: 1
