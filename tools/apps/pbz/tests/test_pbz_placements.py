from pbz.maps import placements as placed
from pbz.maps.scan import scan_cell


def item(item_id, item_type="EItemTypes::Item", detail="EItemDetailType::None",
         material="EItemMaterialType::None", name="", subhead=""):
    return {
        "ItemId": item_id, "ItemType": item_type, "ItemDetailType": detail, "MaterialType": material,
        "ItemName": {"Key": name}, "Subhead": {"Key": subhead},
    }


ITEMS = {
    "R_01017": item("R_01017", "EItemTypes::BookPage", subhead="Reading_Xigu_Letter_017"),
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
    assert p.contents == [("WM_04", 2), ("Reading_Xigu_Letter_017", 1)]
    assert p.dust == (440, 440)


def test_dust_alone_is_a_dust_marker():
    p = placed.loot_placement({"actor": "x", "loc": [0, 0, 0], "loot": "a"}, "L",
                              {"a": loot_row(dust=180)}, ITEMS)
    assert p.kind == "dust" and p.name_key is None


def test_what_the_legend_tracks_is_left_to_it():
    rec = {"actor": "x", "loc": [0, 0, 0], "loot": "a"}
    assert placed.loot_placement(rec, "L", {"a": loot_row([("K_01001", 1)])}, ITEMS) is None
    assert placed.loot_placement(rec, "L", {"a": loot_row(weapons=[{"WeaponID": "W"}])}, ITEMS) is None


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
