from pbz.maps import placements as placed
from pbz.maps.scan import scan_cell


def item(item_id, item_type="EItemTypes::Item", detail="EItemDetailType::None",
         material="EItemMaterialType::None", name="", subhead="", desc="", book=None, page=0):
    return {
        "ItemId": item_id, "ItemType": item_type, "ItemDetailType": detail, "MaterialType": material,
        "ItemName": {"Key": name}, "Subhead": {"Key": subhead}, "ItemDescription": {"Key": desc},
        "IntegrationItemID": book or "None", "SequentialIndex": page,
    }


ITEMS = {
    "R_01017": item("R_01017", "EItemTypes::BookPage", subhead="Reading_Xigu_Letter_017",
                    desc="Reading_Xigu_Letter_017_Body", book="Book_01", page=2),
    "R_01018": item("R_01018", "EItemTypes::BookPage", book="Book_01", page=1),
    "Book_01": item("Book_01", "EItemTypes::Book", name="Book_01_Name"),
    "Weapon_Material_04": item("Weapon_Material_04", detail="EItemDetailType::Material",
                               material="EItemMaterialType::WeaponUpgradeMaterial", name="WM_04"),
    "K_01001": item("K_01001", detail="EItemDetailType::NarrativeItem", name="Key_01"),
}


def loot_row(items=(), dust=None, **equipment):
    entry = {
        "LootItems": [{"ItemId": i, "MinAmount": n, "MaxAmount": n} for i, n in items],
        "LootDusts": [{"MinDust": dust, "MaxDust": dust}] if dust else [],
        "Weapons": equipment.get("weapons", []), "Medicines": [], "Accessories": [],
    }
    return {"EntryDatas": [entry]}


def test_the_most_notable_item_names_the_marker():
    loot = {"a": loot_row([("Weapon_Material_04", 2), ("R_01017", 1)], dust=440)}
    p = placed.loot_placement({"actor": "x", "loc": [1, 2, 3], "loot": "a"}, "L", loot, ITEMS)
    assert p.kind == "notes"
    # Notes leave ItemName empty; their title is the Subhead.
    assert p.name_key == "Reading_Xigu_Letter_017"
    assert p.contents == [("WM_04", 2)]
    assert p.dust == (440, 440)
    # The page itself is written out: its book, its place in it, and its text.
    assert p.reading == [("Book_01_Name", "2/2", "Reading_Xigu_Letter_017_Body")]


def test_a_legend_chest_lists_what_its_actor_holds():
    loot = {"c": {"EntryDatas": [{
        "LootItems": [{"ItemId": "Weapon_Material_04", "MinAmount": 3, "MaxAmount": 3}],
        "LootDusts": [{"MinDust": 120, "MaxDust": 120}],
        "Weapons": [{"WeaponID": "Double"}], "Medicines": [], "Accessories": [{"AccessoryID": "AC_Attack"}],
    }]}}
    actors = {"BP_Chest_C_UAID_1": {"actor": "BP_Chest_C_UAID_1", "loot": "c"}}
    equipment = {"Double": "Weapon_Double", "AC_Attack": "Accessory_Attack"}
    got = placed.chest_contents("PBZ_Xigu_WP-BP_Chest_C_UAID_1", actors, loot, ITEMS, equipment)
    assert got == ([("Weapon_Double", 1), ("Accessory_Attack", 1), ("WM_04", 3)], (120, 120))
    # An actor the scan never saw holds nothing we can name.
    assert placed.chest_contents("PBZ_Xigu_WP-BP_Chest_C_UAID_2", actors, loot, ITEMS, equipment) is None


def test_only_the_legend_s_own_actor_is_left_out_not_its_neighbours():
    loot = {"d": loot_row(dust=300)}
    placements = {"L": [
        {"actor": "chest", "loc": [0, 0, 0], "loot": "d"},
        {"actor": "jar", "loc": [50, 0, 0], "loot": "d"},  # half a metre away, its own pickup
    ]}
    found = placed.collect(placements, loot, ITEMS, {}, {"chest"})
    assert [p.seed for p in found] == ["jar|d"]


def test_dust_alone_is_a_dust_marker():
    p = placed.loot_placement({"actor": "x", "loc": [0, 0, 0], "loot": "a"}, "L",
                              {"a": loot_row(dust=180)}, ITEMS)
    assert p.kind == "dust" and p.name_key is None


def test_what_the_legend_tracks_is_left_to_it():
    rec = {"actor": "x", "loc": [0, 0, 0], "loot": "a"}
    keys = frozenset({"K_01001"})
    assert placed.loot_placement(rec, "L", {"a": loot_row([("K_01001", 1)])}, ITEMS, legend_items=keys) is None
    assert placed.loot_placement(rec, "L", {"a": loot_row(weapons=[{"WeaponID": "W"}])}, ITEMS) is None


def test_a_keepsake_the_legend_never_lists_is_a_story_item():
    rec = {"actor": "x", "loc": [0, 0, 0], "loot": "a"}
    p = placed.loot_placement(rec, "L", {"a": loot_row([("K_01001", 1)])}, ITEMS, legend_items=frozenset())
    assert p.kind == "storyItem" and p.name_key == "Key_01"


def test_inline_pickups_and_flow_grants_are_placed_like_loot():
    pickups = {"actor": "jar", "loc": [0, 0, 0], "pickups": [["Weapon_Material_04", 3]]}
    p = placed.loot_placement(pickups, "L", {}, ITEMS)
    assert (p.kind, p.contents, p.seed) == ("weaponMaterial", [("WM_04", 3)], "jar|pickups")
    flow = {"actor": "npc", "loc": [0, 0, 0], "flow": "/Game/Q/BPF_A"}
    p = placed.loot_placement(flow, "L", {}, ITEMS, flow_items={"/Game/Q/BPF_A": [["K_01001", 1]]})
    assert (p.kind, p.seed) == ("storyItem", "npc|flow")
    # A flow that hands nothing out is no marker.
    assert placed.loot_placement(flow, "L", {}, ITEMS, flow_items={}) is None


def test_reforge_talismans_are_consumables_and_blackstone_is_not():
    talisman = item("Return_Weapon_1", detail="EItemDetailType::AddAttribute")
    talisman["bCanSell"] = True
    blackstone = item("Item_001", detail="EItemDetailType::AddAttribute")
    blackstone["bCanSell"] = False
    assert placed.item_kind(talisman) == "consumable"
    assert placed.item_kind(blackstone) == "progression"


def codex_row(cls, order, aliases=(), boss=True):
    return {
        "EnemyClass": {"AssetPathName": f"/Game/X/{cls}.{cls}_C"},
        "AliasEnemyClasses": [{"AssetPathName": f"/Game/X/{a}.{a}_C"} for a in aliases],
        "bIsBoss": boss, "DisplayOrder": order,
        "EnemyName": {"Key": f"BossName_{cls}"},
        "WhiteIcon": {"AssetPathName": f"/Game/G/T_{cls}_w.T_{cls}_w"},
    }


def test_boss_phases_in_one_arena_collapse_to_the_first():
    codex = {"p1": codex_row("Boss", 1), "p2": codex_row("Boss_P2", 2), "mob": codex_row("Mob", 3, boss=False)}
    placements = {"L": [
        {"actor": "s2", "loc": [100, 0, 0], "spawns": "Boss_P2_C"},
        {"actor": "s1", "loc": [0, 0, 0], "spawns": "Boss_C"},
        {"actor": "s3", "loc": [0, 0, 0], "spawns": "Mob_C"},
        {"actor": "s4", "loc": [90000, 0, 0], "spawns": "Boss_P2_C"},
    ]}
    found = placed.boss_placements(placements, codex)
    assert [(p.name_key, p.world[0]) for p in found] == [("BossName_Boss", 0), ("BossName_Boss_P2", 90000)]
    assert found[0].icon == "T_Boss_w"


def test_scan_follows_root_components_and_attach_parents():
    lvl = "Level'W:PersistentLevel'"
    exports = [
        {"Type": "BP_Table_C", "Name": "Table", "Outer": {"ObjectName": lvl},
         "Properties": {"RootComponent": {"ObjectName": "SceneComponent'W:PersistentLevel.Table.Root'"}}},
        {"Type": "SceneComponent", "Name": "Root", "Outer": {"ObjectName": "BP_Table_C'W:PersistentLevel.Table'"},
         "Properties": {"RelativeLocation": {"X": 100, "Y": 200, "Z": 300}}},
        {"Type": "BP_Rubbish_C", "Name": "Jar", "Outer": {"ObjectName": lvl},
         "Properties": {"Loot Item ID": "Xigu.R_01017",
                        "RootComponent": {"ObjectName": "SceneComponent'W:PersistentLevel.Jar.Root'"}}},
        {"Type": "SceneComponent", "Name": "Root", "Outer": {"ObjectName": "BP_Rubbish_C'W:PersistentLevel.Jar'"},
         "Properties": {"RelativeLocation": {"X": 1, "Y": 2, "Z": 3},
                        "AttachParent": {"ObjectName": "SceneComponent'W:PersistentLevel.Table.Root'"}}},
    ]
    assert scan_cell(exports) == [
        {"actor": "Jar", "type": "BP_Rubbish_C", "loc": [101.0, 202.0, 303.0], "loot": "Xigu.R_01017"},
    ]


def test_culture_text_prefers_the_decoded_json(tmp_path):
    import json

    from pbz.locres import read_culture
    (tmp_path / "Game.json").write_text(json.dumps({"Default": {"k": "文"}}, ensure_ascii=False), encoding="utf-8")
    assert read_culture(tmp_path) == {"Default": {"k": "文"}}


def test_locks_come_from_blockers_and_doors():
    from pbz.maps import features
    shaqi = {"锁镰": {"BrokenBlockerTag": {"TagName": "GameplayEvent.BreakBlocker.Gap.Activate"},
                      "WeaponName": {"Key": "PhantomEdges_014"},
                      "WeaponMapIcon": {"AssetPathName": "/Game/UI/T_Map_Need_X.T_Map_Need_X"}}}
    items = {"K_01004": item("K_01004", name="Item_Key_04")}
    defaults = {"/Game/B/BP_GapBlocker.BP_GapBlocker_C": {
        "NeedAbilityContainer": ["GameplayEvent.BreakBlocker.Gap.Activate"]}}
    placements = {"L": [
        {"actor": "gap", "type": "BP_GapBlocker_C", "loc": [0, 0, 0],
         "cls": "/Game/B/BP_GapBlocker.BP_GapBlocker_C", "props": {}},
        {"actor": "latch", "type": "BP_Block_Door_C", "loc": [1, 0, 0], "cls": None,
         "props": {"DoorType": features.LATCH}},
        {"actor": "lock", "type": "BP_Block_Gate_C", "loc": [2, 0, 0], "cls": None,
         "props": {"DoorType": features.LOCK, "Check Items": [{"Key": "K_01004", "Value": 1}]}},
        {"actor": "fog", "type": "BP_FogDoor_C", "loc": [3, 0, 0], "cls": None,
         "props": {"DoorType": features.LATCH}},
    ]}
    got = features.lock_placements(placements, defaults, shaqi, items)
    assert [(p.kind, p.name_key, p.icon, p.desc_template) for p in got] == [
        ("phantomEdgeLock", "PhantomEdges_014", "T_Map_Need_X", "UI_Map_41"),
        ("latchedDoor", "UI_Map_15", None, None),
        ("lockedDoor", "LockedDoor", None, "UI_Map_40"),
    ]
    assert got[-1].contents == [("Item_Key_04", 1)]


def test_a_lock_door_without_a_key_is_still_a_locked_door():
    from pbz.maps import features
    placements = {"L": [{"actor": "gate", "type": "BP_Block_Gate_C", "loc": [0, 0, 0], "cls": None,
                         "props": {"DoorType": features.LOCK}}]}
    [p] = features.lock_placements(placements, {}, {}, {})
    assert (p.kind, p.name_key, p.contents, p.desc_template) == ("lockedDoor", "LockedDoor", [], None)


def test_npc_names_need_a_whole_name_and_a_clear_majority():
    from pbz.maps.features import npc_name_key
    speakers = {
        "Dlg_A_LaoGenTou_1": "Character_Imp_16", "Dlg_A_LaoGenTou_2": "Character_Imp_16",
        "Dlg_B_LuJieYuan_1": "Character_XSSL_1",
        "Dlg_C_FeiZei_1": "Character_LJC_25", "Dlg_C_FeiZei_2": "Character_LJC_26",
    }
    assert npc_name_key("BP_NPC_LaoGenTou_C", speakers) == "Character_Imp_16"
    assert npc_name_key("BP_NPC_LaoGenTou_WhiteFlower_01_C", speakers) == "Character_Imp_16"
    assert npc_name_key("BP_NPC_LuJieYuan_Wife_C", speakers) is None  # not her husband
    assert npc_name_key("BP_NPC_FeiZei_C", speakers) is None  # two thieves, no majority
    assert npc_name_key("BP_NPC_Ending_LaoGenTou_C", speakers) is None
