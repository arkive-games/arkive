import json
from pathlib import Path

import pytest

from palworld.env import optional_dir
from palworld.maps.extract import L10N_LANG_TAGS, _actor_location, run_extract

RAW = optional_dir("PALWORLD_RAW")


def _wj(path: Path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj), encoding="utf-8")


def _make_fixture_raw(root: Path) -> Path:
    raw = root / "Content" / "Pal"
    _wj(raw / "DataTable/WorldMapUIData/DT_WorldMapUIData.json", [{"Rows": {
        "MainMap": {"landScapeRealPositionMin": {"X": 0, "Y": 0}, "landScapeRealPositionMax": {"X": 100, "Y": 100}},
        "Tree": {"landScapeRealPositionMin": {"X": 200, "Y": 200}, "landScapeRealPositionMax": {"X": 300, "Y": 300}},
    }}])
    _wj(raw / "Maps/MainWorld_5/PL_MainWorld5.json", [])
    # A world-partition cell holding a healing spring and a warp altar (both
    # world-partition-only classes) so the cell scan surfaces the new subtypes.
    _wj(raw / "Maps/MainWorld_5/PL_MainWorld5/_Generated_/MainGrid_L0_test.json", [
        {"Type": "BP_LevelObject_HealSpring_C", "Name": "HS1",
         "Properties": {"RootComponent": {"ObjectPath": "cell.1"}}},
        {"Properties": {"RelativeLocation": {"X": 500000, "Y": -600000, "Z": 100}}},
        {"Type": "BP_LevelObject_SkylandWarpAlter_C", "Name": "WA1",
         "Properties": {"RootComponent": {"ObjectPath": "cell.3"}}},
        {"Properties": {"RelativeLocation": {"X": -700000, "Y": 0, "Z": 40000}}},
    ])
    # World-map display names (base = ja SourceString; L10N folders below).
    _wj(raw / "DataTable/Text/DT_WorldMap_Common_Text_Common.json", [{"Rows": {
        "WORLDMAP_NAME_MainMap": {"TextData": {"SourceString": "ja-JP Main"}},
        "WORLDMAP_NAME_Tree": {"TextData": {"SourceString": "ja-JP Tree"}},
    }}])
    for rel in ["DataTable/UI/DT_BossSpawnerLoactionData.json",
                "DataTable/Spawner/DT_PalWildSpawner.json",
                "DataTable/Spawner/DT_PalSpawnerPlacement.json",
                "DataTable/Character/DT_PalBossNPCIcon.json",
                "DataTable/Character/DT_PalMonsterParameter.json",
                "DataTable/Text/DT_PalNameText_Common.json"]:
        _wj(raw / rel, [{"Rows": {}}])
    # Dirs run_extract walks (cells grep, sheet blueprints, pal icons).
    for rel in ["Maps/MainWorld_5/PL_MainWorld5/_Generated_",
                "Blueprint/Spawner/SheetsVariant", "Texture/PalIcon/Normal"]:
        (raw / rel).mkdir(parents=True, exist_ok=True)
    for folder, tag in L10N_LANG_TAGS.items():
        _wj(root / "Content" / "L10N" / folder / "Pal/DataTable/Text/DT_PalNameText_Common.json", [{"Rows": {
            "PAL_NAME_Alpaca": {"TextData": {"SourceString": "멜파카" if tag == "ko-KR" else f"{tag} Alpaca"}},
        }}])
        _wj(root / "Content" / "L10N" / folder / "Pal/DataTable/Text/DT_WorldMap_Common_Text_Common.json", [{"Rows": {
            "WORLDMAP_NAME_MainMap": {"TextData": {"LocalizedString": f"{tag} Main"}},
            "WORLDMAP_NAME_Tree": {"TextData": {"LocalizedString": f"{tag} Tree"}},
        }}])
    return raw


def test_actor_location_unattached_is_world():
    # Actor whose root component has no AttachParent: RelativeLocation IS its
    # world location (fast-travel/tower/dungeon actors work this way).
    exports = [
        {"Name": "a", "Properties": {"RootComponent": {"ObjectPath": "PL.1"}}},
        {"Properties": {"RelativeLocation": {"X": 123.0, "Y": 456.0, "Z": 7.0}}},
    ]
    assert _actor_location(exports[0], exports) == {"X": 123.0, "Y": 456.0, "Z": 7.0}


def test_actor_location_composes_attach_parent_chain():
    # Rock/ore spawners (copper/quartz/coal/sulfur) attach their root component
    # to a BP_BoxPlacementTool parent, so RelativeLocation is a small offset in
    # the parent's frame — NOT a world position. The world location is
    # parent_loc + Rz(parent_yaw) * child_offset.
    exports = [
        {"Name": "ore", "Properties": {"RootComponent": {"ObjectPath": "PL.1"}}},
        {"Properties": {"RelativeLocation": {"X": 10.0, "Y": 0.0, "Z": 5.0},
                        "AttachParent": {"ObjectPath": "PL.2"}}},
        {"Properties": {"RelativeLocation": {"X": 1000.0, "Y": 2000.0, "Z": 0.0},
                        "RelativeRotation": {"Pitch": 0, "Yaw": 90, "Roll": 0}}},
    ]
    loc = _actor_location(exports[0], exports)
    # Rotate (10, 0) by yaw 90° -> (0, 10); add parent (1000, 2000) -> (1000, 2010).
    assert loc["X"] == pytest.approx(1000.0, abs=1e-6)
    assert loc["Y"] == pytest.approx(2010.0, abs=1e-6)
    assert loc["Z"] == pytest.approx(5.0)


def test_l10n_lang_tags_complete():
    assert L10N_LANG_TAGS == {
        "de": "de-DE", "en": "en-US", "es": "es-ES", "es-MX": "es-MX", "fr": "fr-FR",
        "id": "id-ID", "it": "it-IT", "ko": "ko-KR", "pl": "pl-PL", "pt-BR": "pt-BR",
        "ru": "ru-RU", "th": "th-TH", "tr": "tr-TR", "vi": "vi-VN",
        "zh-Hans": "zh-CN", "zh-Hant": "zh-TW",
    }
    assert len(L10N_LANG_TAGS) == 16


def test_reads_pal_names_from_every_l10n_table(tmp_path):
    raw = _make_fixture_raw(tmp_path)
    out = run_extract(raw)
    assert out["namesByLang"]["ko-KR"]["Alpaca"] == "멜파카"
    assert out["namesByLang"]["en-US"]["Alpaca"] == "en-US Alpaca"
    assert len(out["namesByLang"]) == 17  # 16 L10N folders + ja-JP base


def test_reads_map_names_from_worldmap_table(tmp_path):
    # Map display names come from DT_WorldMap_Common_Text_Common (base ja
    # SourceString + each L10N folder's LocalizedString), keyed per map id.
    raw = _make_fixture_raw(tmp_path)
    out = run_extract(raw)
    assert out["mapNames"]["MainWorld"]["ja-JP"] == "ja-JP Main"
    assert out["mapNames"]["MainWorld"]["en-US"] == "en-US Main"
    assert out["mapNames"]["WorldTree"]["ko-KR"] == "ko-KR Tree"
    assert len(out["mapNames"]["MainWorld"]) == 17  # 16 L10N folders + ja-JP base


def test_extracts_healing_spring_and_warp_altar_from_cells(tmp_path):
    # HealSpring -> healingSpring; SkylandWarpAlter / WarpAltar_WorldTree* ->
    # warpAltar. Both live only in the world-partition cells.
    raw = _make_fixture_raw(tmp_path)
    out = run_extract(raw)
    by_sub = {p["subtype"] for p in out["pois"]}
    assert "healingSpring" in by_sub
    assert "warpAltar" in by_sub


@pytest.mark.skipif(RAW is None or not RAW.exists(), reason="PALWORLD_RAW not set or raw Palworld export not available")
def test_extract_integration():
    out = run_extract(RAW)

    def by_subtype(k):
        return len([p for p in out["pois"] if p["subtype"] == k])

    assert by_subtype("fastTravel") == 152
    assert by_subtype("eagleStatue") == 22
    # Eagle statues are map-reveal watchtowers: each carries a FastTravelPointID
    # (WatchTower_*) keying a localized name in DT_MapRespawnPointInfoText.
    eagles = [p for p in out["pois"] if p["subtype"] == "eagleStatue"]
    assert all(p.get("nameByLng", {}).get("en-US") for p in eagles)
    assert any("Watchtower" in p["nameByLng"]["en-US"] for p in eagles)
    assert by_subtype("dungeon") == 157
    assert by_subtype("treasureMap") == 42
    # Notes are scanned from the persistent level (15) AND the world-partition
    # cells, then deduped by rounded world location.
    assert by_subtype("note") == 64
    # Every note resolves a name (title line), description (body) and a full-page
    # illustration stem from its NoteRowName via DT_Note* tables.
    notes = [p for p in out["pois"] if p["subtype"] == "note"]
    assert all(p.get("nameByLng", {}).get("en-US") for p in notes)
    assert all(p.get("descByLng", {}).get("en-US") for p in notes)
    assert all(p.get("image", "").startswith("T_Note_") for p in notes)
    assert by_subtype("copper") == 39
    assert by_subtype("quartz") == 27
    assert by_subtype("coal") == 23
    assert by_subtype("sulfur") == 23
    # Cell-only mineable resources (no persistent-level deposit).
    assert by_subtype("oil") == 185
    assert by_subtype("skyIslandOre") == 226
    assert by_subtype("worldTreeOre") == 80
    # Healing springs (all on the World Tree map) and warp altars (Sky Island
    # altars + the World Tree entrance/exit), both world-partition-only.
    assert by_subtype("healingSpring") == 3
    assert by_subtype("warpAltar") == 22
    # Sealed Realms: one location POI per ImprisonmentBoss placement, each labelled
    # with the boss it holds.
    realms = [p for p in out["pois"] if p["subtype"] == "sealedRealm"]
    assert len(realms) == 18
    assert all(p.get("nameByLng", {}).get("en-US") for p in realms)
    assert all(isinstance(p["location"]["X"], (int, float)) and isinstance(p["location"]["Y"], (int, float)) for p in out["pois"])
    # Resource spawners attach to a BP_BoxPlacementTool parent; their world
    # location must be composed from that parent (they used to collapse to a
    # ~±3000 stripe around world origin). Assert they resolve inside MainWorld
    # bounds and are spread across the map, not clustered at the origin.
    resources = [p for p in out["pois"] if p["subtype"] in ("copper", "quartz", "coal", "sulfur")]
    mn, mx = out["bounds"]["MainWorld"]["min"], out["bounds"]["MainWorld"]["max"]
    assert resources
    assert all(mn["X"] <= p["location"]["X"] <= mx["X"] and mn["Y"] <= p["location"]["Y"] <= mx["Y"] for p in resources)
    assert max(abs(p["location"]["X"]) for p in resources) > 100000
    # 90 from DT_BossSpawnerLoactionData + 7 new field bosses (DT_PalSpawnerPlacement
    # FieldBoss) that table omits, e.g. BlackCentaur; overlapping ones are deduped.
    assert len(out["bosses"]) == 97
    assert all(p["characterId"].upper().startswith("BOSS_") for p in out["bosses"])
    assert any(p["characterId"] == "BOSS_BlackCentaur" for p in out["bosses"])
    assert len(out["palSpawns"]) > 5000
    assert all(len(s["pals"]) >= 1 for s in out["palSpawns"])
    assert out["namesByLang"]["en-US"]["Kitsunebi"]
    assert out["bounds"]["MainWorld"]["min"]["X"] == -1099400
    assert out["bounds"]["WorldTree"]["max"]["Y"] == -476400
    # Map display names sourced from the game's WorldMap L10N table.
    assert out["mapNames"]["MainWorld"]["en-US"] == "Palpagos Islands"
    assert out["mapNames"]["MainWorld"]["zh-CN"] == "帕洛斯群岛"
    assert out["mapNames"]["MainWorld"]["ja-JP"] == "パルパゴス島"
    assert out["mapNames"]["WorldTree"]["en-US"] == "The World Tree"
    assert out["mapNames"]["WorldTree"]["zh-CN"] == "世界树"
    assert len(out["palIcons"]) > 400
    # Features added this session:
    assert len(out["wanted"]) == 33
    assert len(out["predators"]) == 29
    # Ancient Shrines: lock-gated pickup towers (level + cells, deduped). Their
    # root component has no RelativeLocation — recovered via the _actor_location
    # AttachParent walk — and each carries a schematic+Dog-Coin reward + a name.
    shrines = [p for p in out["pois"] if p["subtype"] == "ancientShrine"]
    assert len(shrines) == 106
    assert all(mn["X"] <= p["location"]["X"] <= mx["X"] and mn["Y"] <= p["location"]["Y"] <= mx["Y"] for p in shrines)
    assert all(s.get("reward", {}).get("item") for s in shrines)
    assert sum(1 for s in shrines if s.get("nameByLng", {}).get("en-US")) >= 100
    sample = next(s for s in shrines if s["reward"].get("dogCoin"))
    assert sample["reward"]["count"] >= 1 and sample["reward"]["dogCoin"] > 0
    assert "pickupRow" not in sample  # temp key stripped after enrichment
    # Placed NPC spawners (talkable / merchant / quest), level + cells, deduped.
    # (145 incl. +18 recovered by the _actor_location AttachParent-chain fix —
    # NPC spawners whose root component likewise carries no RelativeLocation.)
    assert len(out["npcs"]) == 145
    assert all(n["npcId"] and isinstance(n["location"]["X"], (int, float)) for n in out["npcs"])
    assert any(n["npcId"] == "MedalTrader" for n in out["npcs"])
    # Every NPC resolves BOTH a portrait icon (via the _npc_name_icon fallback
    # chain: exact id -> CharacterID -> `_NN`-variant/`NAME_`-stripped ->
    # gender-prefixed -> role-base match -> NPC_ICON_ALIASES) AND a localized name
    # (DT_UniqueNPC/-Text, or the sub-quest title for quest-target NPCs with no row).
    assert all(n.get("icon") for n in out["npcs"])
    assert all(n.get("nameByLng", {}).get("en-US") for n in out["npcs"])
    trader = next(n for n in out["npcs"] if n["npcId"] == "BountyTrader")
    assert trader["nameByLng"]["ja-JP"] == "自警団の指名手配係" and trader["icon"]
    # Icon fallback-chain recoveries (previously icon-less): each rule once.
    by_id = {n["npcId"]: n for n in out["npcs"]}
    assert by_id["DarkTrader03"]["icon"] == "T_Male_DarkTrader01_icon_normal"  # strip _NN
    assert by_id["U_SorajimaTowerGuide"]["icon"] == "T_Male_SorajimaPeople01_icon_normal"  # NAME_
    assert by_id["StrongOldMan02"]["icon"] == "T_Male_StrongOldMan02_icon_normal"  # gender prefix
    assert by_id["Breeder03"]["icon"] == "T_Male_Breeder01_v01_icon_normal"  # role-base match
    assert by_id["U_WildlifeSanctuary_guide"]["icon"] == "T_MobuCitizen_Male_icon_normal"  # alias
    # Quest-target NPCs (no DT_UniqueNPC row) are named by their sub-quest title.
    assert by_id["Ranger02"]["nameByLng"]["en-US"] == "The Fugitive"
    assert by_id["Breeder03"]["nameByLng"]["en-US"] == "No Mercy for Pal Thieves"
