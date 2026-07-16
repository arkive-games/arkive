import pytest

from palworld.maps.emit import build_dataset
from palworld.maps.orientation import Orientation
from palworld.maps.transform import make_transform

LANGUAGES = ["en-US", "ja-JP", "de-DE", "es-ES", "es-MX", "fr-FR", "id-ID", "it-IT",
             "ko-KR", "pl-PL", "pt-BR", "ru-RU", "th-TH", "tr-TR", "vi-VN", "zh-CN", "zh-TW"]


def _names_by_lang():
    # Keys are lowercased, matching extract._read_pal_names' casefolded output.
    m = {lng: {"kitsunebi": f"{lng} Kitsunebi", "sheepball": f"{lng} SheepBall"} for lng in LANGUAGES}
    m["en-US"] = {"kitsunebi": "Foxparks", "sheepball": "Lamball"}
    m["ko-KR"] = {"kitsunebi": "불꽃여우", "sheepball": "도로롱"}
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
        # Dungeon portal: carries its SpawnAreaId + the localized dungeon name.
        {"subtype": "dungeon", "sourceName": "DP_1", "location": {"X": 300, "Y": 300, "Z": 0},
         "dungeonArea": "Forest001",
         "nameByLng": {lng: ("Mountain Stream Grotto" if lng == "en-US" else f"{lng} Grotto") for lng in LANGUAGES}},
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
        # Fractional world coords: the per-pal spawns file rounds to integers.
        {"spawnerName": "sp2", "pals": [{"id": "PinkCat", "lvMin": 4, "lvMax": 6}], "location": {"X": 123.6, "Y": -77.4, "Z": 12.5}},
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
    "predators": [
        {"pal": "PREDATOR_SheepBall", "level": 30, "location": {"X": 7000, "Y": 7000, "Z": 0},
         "icon": "T_SheepBall_icon_normal",
         "nameByLng": {lng: ("Predator Lamball" if lng == "en-US" else f"{lng} Predator") for lng in LANGUAGES}},
    ],
    "namesByLang": _names_by_lang(),
    "mapNames": {
        "MainWorld": {lng: ("Palpagos Islands" if lng == "en-US" else f"{lng} Main") for lng in LANGUAGES},
        "WorldTree": {lng: ("The World Tree" if lng == "en-US" else f"{lng} Tree") for lng in LANGUAGES},
    },
    "palMeta": {
        "SheepBall": {"zukanIndex": 2, "zukanIndexSuffix": ""},
        "PinkCat": {"zukanIndex": 3, "zukanIndexSuffix": ""},
        "Kitsunebi": {"zukanIndex": 5, "zukanIndexSuffix": ""},
        "YakushimaMonster001": {"zukanIndex": -1, "zukanIndexSuffix": ""},
    },
    "palIcons": ["T_Kitsunebi_icon_normal", "T_SheepBall_icon_normal"],
    # Region trigger volumes (world units): a big surface region over the origin
    # markers, and a small tower volume enclosing the copper node — overlapping
    # in 2D but the tower separates in Z, so the copper marker resolves to the
    # more-specific tower while other origin markers fall to the surface region.
    "regionVolumes": [
        {"area": "Grass_001", "shape": "box", "x": 200, "y": 200, "z": 5,
         "hx": 5000, "hy": 5000, "hz": 1000, "yaw": 0},
        {"area": "Tower_Grass", "shape": "box", "x": 100, "y": 100, "z": 0,
         "hx": 50, "hy": 50, "hz": 50, "yaw": 0},
        # Named in the area table but with no placed markers inside — still emitted.
        {"area": "Frost_001", "shape": "sphere", "x": 300000, "y": 300000, "z": 0,
         "hx": 8000, "hy": 8000, "hz": 8000, "yaw": 0},
    ],
    "regionNames": {
        "Grass_001": {"en-US": "Windswept Island", "zh-CN": "zh Grass"},
        "Tower_Grass": {"en-US": "Rayne Tower (Grasslands)", "zh-CN": "zh Tower"},
        "Frost_001": {"en-US": "Astral Mountains"},
    },
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


def test_dungeon_portal_carries_area_and_name(ds):
    dg = [m for m in ds["markers"]["MainWorld"] if m["subtype"] == "dungeon"]
    assert len(dg) == 1
    assert dg[0]["dungeonArea"] == "Forest001"
    assert ds["locales"]["en-US"]["markers"]["MainWorld"][dg[0]["id"]]["name"] == "Mountain Stream Grotto"


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


def test_full_locale_trees(ds):
    assert list(ds["locales"].keys()) == LANGUAGES
    for lng in LANGUAGES:
        assert ds["locales"][lng]["maps"]["MainWorld"]["name"]
        assert ds["locales"][lng]["types"]["subtypes"]["fastTravel"]["name"]
    # WorldTree has no region volumes → its region tree stays empty.
    assert ds["regions"]["WorldTree"] == []
    for lng in LANGUAGES:
        assert ds["locales"][lng]["regions"]["WorldTree"] == {}


def test_region_polygons_in_pixel_space_with_localized_names(ds):
    regions = {r["id"]: r for r in ds["regions"]["MainWorld"]}
    # One RegionInstance per named volume, typed by key.
    assert regions["Grass_001"]["type"] == "region"
    assert regions["Tower_Grass"]["type"] == "tower"
    # Box → 4 corners + closing point, all inside the 8192² pixel grid.
    ring = regions["Grass_001"]["borders"][0]
    assert len(ring) == 5 and ring[0] == ring[-1]
    assert all(0 <= px <= 8192 and 0 <= py <= 8192 for px, py in ring)
    # Sphere → 24-gon (+ close).
    assert len(regions["Frost_001"]["borders"][0]) == 25
    # Localized names come from the area-data → world-map-text join; missing
    # langs fall back to en-US.
    assert ds["locales"]["en-US"]["regions"]["MainWorld"]["Grass_001"]["name"] == "Windswept Island"
    assert ds["locales"]["zh-CN"]["regions"]["MainWorld"]["Tower_Grass"]["name"] == "zh Tower"
    assert ds["locales"]["fr-FR"]["regions"]["MainWorld"]["Frost_001"]["name"] == "Astral Mountains"


def test_markers_stamped_with_containing_region(ds):
    by_sub = {}
    for mk in ds["markers"]["MainWorld"]:
        by_sub.setdefault(mk["subtype"], []).append(mk)
    # Copper node (100,100,z0) sits inside both the surface region and the tower,
    # but the smaller tower wins via its 3D (Z) containment.
    assert by_sub["copper"][0]["region"] == "Tower_Grass"
    # A fast-travel point at the origin is outside the tower's Z band → the
    # surface region is the 2D fallback.
    assert by_sub["fastTravel"][0]["region"] == "Grass_001"
    # The WorldTree-bound fast-travel point has no volume → no region field.
    wt = [m for m in ds["markers"]["WorldTree"] if m["subtype"] == "fastTravel"]
    assert wt and "region" not in wt[0]


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


# --- per-pal exact spawn points (spawns/<palId>.json) ------------------------


def test_spawns_exact_points_with_integer_coords(ds):
    # Every pre-cluster placement survives as one exact point; coords round to
    # integer world cm (half toward +Inf, matching round2's convention).
    sb = ds["spawns"]["SheepBall"]["maps"]["MainWorld"]
    assert sb["points"] == [
        {"x": 0, "y": 0, "z": 0, "lvMin": 1, "lvMax": 3},
        {"x": 50, "y": 50, "z": 0, "lvMin": 1, "lvMax": 3},
    ]
    assert ds["spawns"]["PinkCat"]["maps"]["MainWorld"]["points"] == [
        {"x": 124, "y": -77, "z": 13, "lvMin": 4, "lvMax": 6},
    ]


def test_spawns_include_boss_points(ds):
    # Field bosses and predators back-link into the catchable pal's file so the
    # detail map needs exactly one fetch. Night-restricted bosses keep the flag.
    ki = ds["spawns"]["Kitsunebi"]["maps"]["MainWorld"]
    assert ki["bosses"] == [{"x": 5000, "y": 5000, "z": 0, "kind": "fieldBoss", "level": 12, "nightOnly": True}]
    sb = ds["spawns"]["SheepBall"]["maps"]["MainWorld"]
    assert sb["bosses"] == [{"x": 7000, "y": 7000, "z": 0, "kind": "predator", "level": 30}]


def test_spawns_keep_per_point_night_flag(ds):
    # Exact points carry nightOnly per placement (emit-only-when-true) — even
    # inside a mixed cluster, where the cluster marker itself gets no flag.
    pts = ds["spawns"]["Kitsunebi"]["maps"]["MainWorld"]["points"]
    assert pts == [
        {"x": -300050, "y": 0, "z": 0, "lvMin": 9, "lvMax": 10},
        {"x": -300000, "y": 0, "z": 0, "lvMin": 9, "lvMax": 10, "nightOnly": True},
        {"x": 200000, "y": 0, "z": 0, "lvMin": 5, "lvMax": 7, "nightOnly": True},
        {"x": 200050, "y": 0, "z": 0, "lvMin": 6, "lvMax": 8, "nightOnly": True},
    ]
    # Unrestricted pals carry no key anywhere.
    assert all("nightOnly" not in p for p in ds["spawns"]["SheepBall"]["maps"]["MainWorld"]["points"])


def test_spawns_drop_non_paldeck_and_empty_maps(ds):
    # Non-Paldeck creatures get no file; maps without content are omitted.
    assert "YakushimaMonster001" not in ds["spawns"]
    assert "WorldTree" not in ds["spawns"]["SheepBall"]["maps"]


def test_run_emit_writes_and_prunes_spawn_files(tmp_path):
    import json

    from palworld.maps.emit import run_emit

    parsed_dir = tmp_path / "parsed"
    parsed_dir.mkdir()
    (parsed_dir / "parsed.json").write_text(json.dumps(PARSED), encoding="utf-8")
    out = tmp_path / "out"
    # A leftover file from a previous run (pal renamed/removed) must not survive.
    stale = out / "spawns" / "OldPal.json"
    stale.parent.mkdir(parents=True)
    stale.write_text("{}", encoding="utf-8")
    run_emit(parsed_dir, out)
    assert (out / "spawns" / "SheepBall.json").exists()
    assert (out / "spawns" / "Kitsunebi.json").exists()
    assert not stale.exists()
