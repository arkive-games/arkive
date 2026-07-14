import pytest

from palworld.maps.emit import build_dataset
from palworld.maps.orientation import Orientation
from palworld.maps.transform import make_transform

LANGUAGES = ["en-US", "ja-JP", "de-DE", "es-ES", "es-MX", "fr-FR", "id-ID", "it-IT",
             "ko-KR", "pl-PL", "pt-BR", "ru-RU", "th-TH", "tr-TR", "vi-VN", "zh-CN", "zh-TW"]


def _names_by_lang():
    m = {lng: {"Kitsunebi": f"{lng} Kitsunebi", "SheepBall": f"{lng} SheepBall"} for lng in LANGUAGES}
    m["en-US"] = {"Kitsunebi": "Foxparks", "SheepBall": "Lamball"}
    m["ko-KR"] = {"Kitsunebi": "불꽃여우", "SheepBall": "도로롱"}
    return m


PARSED = {
    "bounds": {
        "MainWorld": {"min": {"X": -1099400, "Y": -724400}, "max": {"X": 349400, "Y": 724400}},
        "WorldTree": {"min": {"X": 347351.5, "Y": -818197}, "max": {"X": 689148.5, "Y": -476400}},
    },
    "pois": [
        {"subtype": "fastTravel", "sourceName": "FT_1", "location": {"X": 0, "Y": 0, "Z": 10}},
        {"subtype": "fastTravel", "sourceName": "FT_2", "location": {"X": 400000, "Y": -600000, "Z": 10}},
        {"subtype": "copper", "sourceName": "CU_1", "location": {"X": 100, "Y": 100, "Z": 0}},
        {"subtype": "ancientShrine", "sourceName": "SH_1", "location": {"X": 200, "Y": 200, "Z": 5},
         "reward": {"item": "Blueprint_Musket_4", "count": 1, "dogCoin": 20},
         "nameByLng": {lng: ("Musket Schematic" if lng == "en-US" else f"{lng} Musket") for lng in LANGUAGES}},
        # Warp altars: a same-map pair plus a cross-map pair (the World Tree
        # entrance on MainWorld ↔ the exit inside WorldTree bounds).
        {"subtype": "warpAltar", "sourceName": "WA_A", "location": {"X": 1000, "Y": 1000, "Z": 0},
         "warpPartnerSource": "WA_B"},
        {"subtype": "warpAltar", "sourceName": "WA_B", "location": {"X": 2000, "Y": 2000, "Z": 0},
         "warpPartnerSource": "WA_A"},
        {"subtype": "warpAltar", "sourceName": "WA_ENT", "location": {"X": 3000, "Y": 3000, "Z": 0},
         "warpPartnerSource": "WA_EXIT"},
        {"subtype": "warpAltar", "sourceName": "WA_EXIT", "location": {"X": 400000, "Y": -600000, "Z": 0},
         "warpPartnerSource": "WA_ENT"},
    ],
    "bosses": [
        {"key": "0", "characterId": "BOSS_Kitsunebi", "level": 12, "location": {"X": 5000, "Y": 5000, "Z": 0},
         "nightOnly": True},
    ],
    "wanted": [
        {"spawnerId": "BOSS_DarkTrader", "level": 59, "location": {"X": 6000, "Y": 6000, "Z": 0},
         "icon": "T_BOSS_NPC_DarkTrader",
         "nameByLng": {lng: ("Ram" if lng == "en-US" else f"{lng} Ram") for lng in LANGUAGES},
         "drops": [{"item": "BountyProof_1", "rate": 100, "min": 5, "max": 5},
                   {"item": "Money", "rate": 100, "min": 500, "max": 1000}]},
    ],
    "palSpawns": [
        {"spawnerName": "sp1", "pals": [{"id": "SheepBall", "lvMin": 1, "lvMax": 3}], "location": {"X": 0, "Y": 0, "Z": 0}},
        {"spawnerName": "sp1", "pals": [{"id": "SheepBall", "lvMin": 1, "lvMax": 3}], "location": {"X": 50, "Y": 50, "Z": 0}},
        # Non-Paldeck dungeon monster (zukanIndex <= 0): must be dropped, not
        # surfaced as a marker/subtype/category.
        {"spawnerName": "dg1", "pals": [{"id": "YakushimaMonster001", "lvMin": 1, "lvMax": 1}], "location": {"X": 100, "Y": 100, "Z": 0}},
        # Night-only spawn points: an all-night Kitsunebi cluster, plus a mixed
        # cluster (night + unrestricted point) far enough away (>> clusterRadius)
        # to stay separate.
        {"spawnerName": "ng1", "pals": [{"id": "Kitsunebi", "lvMin": 5, "lvMax": 7, "nightOnly": True}], "location": {"X": 200000, "Y": 0, "Z": 0}},
        {"spawnerName": "ng2", "pals": [{"id": "Kitsunebi", "lvMin": 6, "lvMax": 8, "nightOnly": True}], "location": {"X": 200050, "Y": 0, "Z": 0}},
        {"spawnerName": "mx1", "pals": [{"id": "Kitsunebi", "lvMin": 9, "lvMax": 10, "nightOnly": True}], "location": {"X": -300000, "Y": 0, "Z": 0}},
        {"spawnerName": "mx2", "pals": [{"id": "Kitsunebi", "lvMin": 9, "lvMax": 10}], "location": {"X": -300050, "Y": 0, "Z": 0}},
    ],
    "namesByLang": _names_by_lang(),
    "mapNames": {
        "MainWorld": {lng: ("Palpagos Islands" if lng == "en-US" else f"{lng} Main") for lng in LANGUAGES},
        "WorldTree": {lng: ("The World Tree" if lng == "en-US" else f"{lng} Tree") for lng in LANGUAGES},
    },
    "palMeta": {
        "SheepBall": {"zukanIndex": 2, "zukanIndexSuffix": ""},
        "Kitsunebi": {"zukanIndex": 5, "zukanIndexSuffix": ""},
        "YakushimaMonster001": {"zukanIndex": -1, "zukanIndexSuffix": ""},
    },
    "palIcons": ["T_Kitsunebi_icon_normal", "T_SheepBall_icon_normal"],
}


@pytest.fixture(scope="module")
def ds():
    return build_dataset(PARSED)


def test_two_maps_with_tiling(ds):
    assert [m["id"] for m in ds["maps"]] == ["MainWorld", "WorldTree"]
    m0 = ds["maps"][0]
    assert (m0["tileWidth"], m0["tileHeight"], m0["tilesCountX"], m0["tilesCountY"], m0["isVisible"]) == (1024, 1024, 8, 8, True)


def test_map_name_and_shortname_from_game_worldmap_l10n(ds):
    # Both the full name and the switcher shortName use the game's official
    # WorldMap name (parsed mapNames), not a hand-authored types.yaml label.
    en = ds["locales"]["en-US"]["maps"]
    assert en["MainWorld"]["name"] == "Palpagos Islands"
    assert en["MainWorld"]["shortName"] == "Palpagos Islands"
    assert en["WorldTree"]["name"] == "The World Tree"
    assert en["WorldTree"]["shortName"] == "The World Tree"
    assert ds["locales"]["zh-CN"]["maps"]["WorldTree"]["name"] == "zh-CN Tree"


def test_markers_assigned_with_stable_ids(ds):
    ft = [m for m in ds["markers"]["MainWorld"] if m["subtype"] == "fastTravel"]
    assert len(ft) == 1
    assert ft[0]["id"] == "MainWorld-fastTravel-1"
    assert ft[0]["indexInSubtype"] == 1
    assert ft[0]["images"] == [] and ft[0]["contributors"] == []
    assert isinstance(ft[0]["z"], (int, float))
    assert len([m for m in ds["markers"]["WorldTree"] if m["subtype"] == "fastTravel"]) == 1


def test_bosses_get_icon_and_localized_lv_names(ds):
    boss = next(m for m in ds["markers"]["MainWorld"] if m["subtype"] == "fieldBoss")
    assert boss["icon"] == "T_Kitsunebi_icon_normal"
    # Boss markers link back to their catchable pal so a pal page can list them.
    assert boss["pal"] == "Kitsunebi"
    assert ds["locales"]["en-US"]["markers"]["MainWorld"][boss["id"]]["name"] == "Foxparks Lv.12"
    assert ds["locales"]["ko-KR"]["markers"]["MainWorld"][boss["id"]]["name"] == "불꽃여우 Lv.12"


def test_pal_spawns_cluster_with_lv_range(ds):
    spawns = [m for m in ds["markers"]["MainWorld"] if m["subtype"] == "SheepBall"]
    assert len(spawns) == 1
    assert spawns[0]["icon"] == "T_SheepBall_icon_normal"
    assert spawns[0]["count"] == 2
    assert ds["locales"]["en-US"]["markers"]["MainWorld"][spawns[0]["id"]]["description"] == "Lv.1–3"
    assert ds["locales"]["ko-KR"]["markers"]["MainWorld"][spawns[0]["id"]]["description"] == "Lv.1–3"


def test_night_only_spawn_clusters_flagged(ds):
    # nightOnly only when EVERY point in the cluster is night-restricted; a
    # mixed cluster spawns in daytime too, and pure day clusters carry no key.
    kits = [m for m in ds["markers"]["MainWorld"] if m["subtype"] == "Kitsunebi"]
    assert len(kits) == 2
    night = next(m for m in kits if m["x"] > 0)
    mixed = next(m for m in kits if m["x"] < 0)
    assert night["nightOnly"] is True
    assert "nightOnly" not in mixed
    sheep = next(m for m in ds["markers"]["MainWorld"] if m["subtype"] == "SheepBall")
    assert "nightOnly" not in sheep
    # Night-restricted field bosses pass the flag through to their marker.
    boss = next(m for m in ds["markers"]["MainWorld"] if m["subtype"] == "fieldBoss")
    assert boss["nightOnly"] is True


def test_enemy_category_pals_are_hidden(ds):
    # Wild non-Paldeck creatures (zukanIndex <= 0) are dropped: no "enemy"
    # category, no subtype, no markers.
    cat_ids = {c["name"] for c in ds["types"]["categories"]}
    assert "enemy" not in cat_ids
    all_subs = {row["id"] for cat in ds["types"]["categories"] for row in cat["subtypes"]}
    assert "YakushimaMonster001" not in all_subs
    for mid in ds["markers"]:
        assert not any(m["subtype"] == "YakushimaMonster001" for m in ds["markers"][mid])
    assert "YakushimaMonster001" not in ds["locales"]["en-US"]["types"]["subtypes"]


def test_ancient_shrine_carries_reward_and_name(ds):
    sh = [m for m in ds["markers"]["MainWorld"] if m["subtype"] == "ancientShrine"]
    assert len(sh) == 1
    assert sh[0]["category"] == "location"
    assert sh[0]["reward"] == {"item": "Blueprint_Musket_4", "count": 1, "dogCoin": 20}
    assert ds["locales"]["en-US"]["markers"]["MainWorld"][sh[0]["id"]]["name"] == "Musket Schematic"


def test_resource_subtypes_carry_item_icons(ds):
    # Resource nodes render with the game's item icon (not a bare colored dot).
    resource = next(c for c in ds["types"]["categories"] if c["name"] == "resource")
    by_id = {s["id"]: s for s in resource["subtypes"]}
    assert by_id["copper"]["icon"] == "T_itemicon_Material_CopperOre"
    assert by_id["coal"]["icon"] == "T_itemicon_Material_Coal"


def test_publishes_world_pixel_params(ds):
    assert ds["maps"][0]["worldBounds"] == {"min": {"x": -1099400, "y": -724400}, "max": {"x": 349400, "y": 724400}}
    assert ds["maps"][0]["orientation"] == {"pxAxis": "Y", "flipX": False, "flipY": True}


def test_raw_world_coords_reproduce_pixel(ds):
    ft = next(m for m in ds["markers"]["MainWorld"] if m["id"] == "MainWorld-fastTravel-1")
    assert ft["x"] == 0 and ft["y"] == 0
    t = make_transform(PARSED["bounds"]["MainWorld"], Orientation("Y", False, True), 8192, 8192)
    px, py = t({"X": ft["x"], "Y": ft["y"]})
    assert px == pytest.approx(4096, abs=1e-3)
    assert py == pytest.approx(1975.62, abs=0.1)


def test_empty_regions_and_full_locale_trees(ds):
    assert ds["regions"]["MainWorld"] == []
    assert list(ds["locales"].keys()) == LANGUAGES
    for lng in LANGUAGES:
        assert ds["locales"][lng]["maps"]["MainWorld"]["name"]
        assert ds["locales"][lng]["types"]["subtypes"]["fastTravel"]["name"]
        assert ds["locales"][lng]["regions"]["MainWorld"] == {}


def test_default_active_flag_only_on_curated_subtypes(ds):
    # Exactly the first three location subtypes are the map's default selection;
    # every other subtype omits the flag so it starts hidden.
    flagged = {
        row["id"]
        for cat in ds["types"]["categories"]
        for row in cat["subtypes"]
        if row.get("defaultActive")
    }
    assert flagged == {"fastTravel", "eagleStatue", "tower"}


def test_npc_category_ordered_before_pal(ds):
    order = [c["id"] for c in ds["types"]["categories"]]
    assert order.index("npc") < order.index("pal")


def _subtype_row(ds, cat_id, sub_id):
    cat = next(c for c in ds["types"]["categories"] if c["id"] == cat_id)
    return next(s for s in cat["subtypes"] if s["id"] == sub_id)


def test_one_time_subtypes_are_completable(ds):
    # One-time encounters/pickups (bosses, effigies, shrine clears, note
    # collection) are flagged canComplete so the frontend offers completion
    # tracking.
    for sub_id in ("fieldBoss", "wanted", "predator"):
        assert _subtype_row(ds, "boss", sub_id).get("canComplete") is True
    assert _subtype_row(ds, "effigy", "lifmunkEffigy").get("canComplete") is True
    assert _subtype_row(ds, "location", "ancientShrine").get("canComplete") is True
    assert _subtype_row(ds, "collectible", "note").get("canComplete") is True


def test_wanted_carries_drops_and_lv_name(ds):
    w = [m for m in ds["markers"]["MainWorld"] if m["subtype"] == "wanted"]
    assert len(w) == 1
    assert w[0]["drops"] == [
        {"item": "BountyProof_1", "rate": 100, "min": 5, "max": 5},
        {"item": "Money", "rate": 100, "min": 500, "max": 1000},
    ]
    assert ds["locales"]["en-US"]["markers"]["MainWorld"][w[0]["id"]]["name"] == "Ram Lv.59"


def test_warp_altars_cross_reference_partner_markers(ds):
    # Each warp altar marker resolves its partner's FINAL marker id (assigned
    # after per-map sorting), as a map-qualified ref so cross-map pairs work.
    mw = {m["id"]: m for m in ds["markers"]["MainWorld"] if m["subtype"] == "warpAltar"}
    assert mw["MainWorld-warpAltar-1"]["warpTo"] == {"map": "MainWorld", "id": "MainWorld-warpAltar-2"}
    assert mw["MainWorld-warpAltar-2"]["warpTo"] == {"map": "MainWorld", "id": "MainWorld-warpAltar-1"}
    # Cross-map pair: entrance on MainWorld ↔ exit on WorldTree.
    assert mw["MainWorld-warpAltar-3"]["warpTo"] == {"map": "WorldTree", "id": "WorldTree-warpAltar-1"}
    wt = [m for m in ds["markers"]["WorldTree"] if m["subtype"] == "warpAltar"]
    assert len(wt) == 1
    assert wt[0]["warpTo"] == {"map": "MainWorld", "id": "MainWorld-warpAltar-3"}
    # Non-warp markers never carry the field.
    assert all("warpTo" not in m for m in ds["markers"]["MainWorld"] if m["subtype"] != "warpAltar")


def test_non_completable_subtypes_omit_the_flag(ds):
    # Emit-only-when-true, like defaultActive: repeatable markers carry no key.
    assert "canComplete" not in _subtype_row(ds, "location", "fastTravel")
    assert "canComplete" not in _subtype_row(ds, "resource", "copper")
