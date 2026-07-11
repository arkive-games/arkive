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
    ],
    "bosses": [
        {"key": "0", "characterId": "BOSS_Kitsunebi", "level": 12, "location": {"X": 5000, "Y": 5000, "Z": 0}},
    ],
    "palSpawns": [
        {"spawnerName": "sp1", "pals": [{"id": "SheepBall", "lvMin": 1, "lvMax": 3}], "location": {"X": 0, "Y": 0, "Z": 0}},
        {"spawnerName": "sp1", "pals": [{"id": "SheepBall", "lvMin": 1, "lvMax": 3}], "location": {"X": 50, "Y": 50, "Z": 0}},
        # Non-Paldeck dungeon monster (zukanIndex <= 0): must be dropped, not
        # surfaced as a marker/subtype/category.
        {"spawnerName": "dg1", "pals": [{"id": "YakushimaMonster001", "lvMin": 1, "lvMax": 1}], "location": {"X": 100, "Y": 100, "Z": 0}},
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


def test_boss_and_lifmunk_effigy_subtypes_are_completable(ds):
    # Boss encounters and effigy pickups are one-time: the taxonomy flags them
    # canComplete so the frontend offers completion tracking.
    for sub_id in ("fieldBoss", "wanted", "predator"):
        assert _subtype_row(ds, "boss", sub_id).get("canComplete") is True
    assert _subtype_row(ds, "effigy", "lifmunkEffigy").get("canComplete") is True


def test_non_completable_subtypes_omit_the_flag(ds):
    # Emit-only-when-true, like defaultActive: repeatable markers carry no key.
    assert "canComplete" not in _subtype_row(ds, "location", "fastTravel")
    assert "canComplete" not in _subtype_row(ds, "resource", "copper")
