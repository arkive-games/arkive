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
