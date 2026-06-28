"""Per-map extraction of SubzoneGroups, Subzones, and god-fragment (monolith) data
from the raw game export.

No "region" concept — only the game's own hierarchy, with raw field names kept:
  - SubzoneGroup   (Table/SubzoneGroup.json)            : ID, Desc
  - Subzone        (Table/Subzone.json, by MapId)       : ID, Name, DisplayName,
                     WorldMapFogGroupId -> SubzoneGroup.ID, SubzoneType, bMapEnabled
  - geometry       (MapData.json SubzoneVolumeInfoMap)  : joined by SubzoneTableId
  - world-map icon (Table/WorldMapUIRegion.json)        : joined by SubzoneId
                     -> IconType, IconRank (from WorldMapInfoType Region_Rank<N>)
  - fragments      (MapData.json SpawnInfoList, GodFragment EnvObj)
                     -> monolith achievement group (Achievement.json UseEnvObjSpawnerName)
                     -> canonical Subzone: the max-area subzone sharing the group's
                        Title name (== the icon-bearing one).

Workflow: extract_map(name) -> dict; main() writes parsed_data/maps/<map>.json for the 5
requested maps (Abyss_Reshanta_B is absent from Map.json — deprecated, replaced by C — and is
reported skipped).
"""
import json
import re
from functools import lru_cache
from pathlib import Path

from shapely.geometry import Polygon

from . import RAW_ROOT, TOOLS_ROOT, worldmap_path
from .l10n import L10N
from .subzones import _find_first, map_data_path
from .transform import Orientation, WorldMapTransform
from .worldmap import WorldMapMeta

TABLE = RAW_ROOT / "Data" / "Table"
OUT_DIR = TOOLS_ROOT / "parsed_data" / "maps"

# Image-space orientation, verified against World_L_A.png (Eternal Isle lower-left,
# Dawn Legion Base upper-left). Assumed for all maps; re-verify per map with landmarks.
ORIENTATION = Orientation(px_from="X", flip_x=False, flip_y=False)

REQUESTED_MAPS = ["World_L_A", "World_D_A", "Abyss_Reshanta_A", "Abyss_Reshanta_B", "Abyss_Reshanta_C"]
_MONO_PREFIX = "Group_Unlock_MonolithFragment_"


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", s.lower())


def _parse_rank(world_map_info_type):
    """``EWorldMapInfoType::Region_Rank2`` -> ``2`` (frontend zoom LOD rank).

    Returns ``None`` when there is no WorldMapUIRegion / no trailing Rank<N>."""
    if not world_map_info_type:
        return None
    m = re.search(r"Rank(\d+)$", str(world_map_info_type))
    return int(m.group(1)) if m else None


@lru_cache(maxsize=None)
def _table(name: str):
    return json.loads((TABLE / name).read_text(encoding="utf-8"))["Properties"]["Data"]


@lru_cache(maxsize=None)
def _maps_index():
    return {m["Name"]: m for m in _table("Map.json")}


@lru_cache(maxsize=None)
def _godfragment_env_ids() -> frozenset:
    return frozenset(
        e["ID"]["Value"] for e in _table("EnvObjData.json")
        if "GodFragment" in (e.get("ResourceKey", "") + e.get("Name", ""))
    )


@lru_cache(maxsize=None)
def _gather_source_type_by_env() -> dict:
    """GatherSource EnvObj ID -> short SourceType (e.g. ``Od``, ``Herb``).

    The EnvObj's ``UsageValue`` (e.g. ``Gather_Herb_lv1_Common_001_f``) is the
    ``GatherSource.Name``; that row's ``SourceType`` (``EGatherSourceType::Od``)
    is the material grouping. All 142 GatherSource EnvObj defs resolve cleanly
    into ~10 SourceTypes, so we emit one ``gathering<SourceType>`` subtype each."""
    gs = {r["Name"]: r for r in _table("GatherSource.json")}
    out = {}
    for e in _table("EnvObjData.json"):
        if e.get("Usage") != "EEnvObjectUsage::GatherSource":
            continue
        row = gs.get(e.get("UsageValue"))
        if row and row.get("SourceType"):
            out[e["ID"]["Value"]] = str(row["SourceType"]).split("::")[-1]
    return out


# Player-facing FIELD dungeon types — world entrances we WOULD surface as the
# ``dungeon`` subtype. Excludes Seal (its own subtype), Quest (sub-district /
# story gates), and instance/abyss-internal types (InstanceLayer, AbyssArtifact,
# Abyss, AbyssWar, PersonalAgit, Guild, BossChallenge, FieldEvent). NOTE: in the
# current export every dungeon of these types has ``LinkedMap == None`` (entered
# via a UI lobby, no world position), so none are placed on the world maps; the
# parser still resolves them generically in case future data adds field gates.
_FIELD_DUNGEON_TYPES = frozenset({
    "EDungeonType::Matching", "EDungeonType::Party", "EDungeonType::Raid",
    "EDungeonType::Daily", "EDungeonType::Awaken", "EDungeonType::Ascension",
    "EDungeonType::Growth",
})


@lru_cache(maxsize=None)
def _enter_dungeon_env_to_field_dungeon() -> dict:
    """EnterDungeon EnvObj ID -> Dungeon row, for player-facing FIELD dungeons.

    ``UsageValue`` of an ``EnterDungeon`` EnvObj is the numeric Dungeon ID. We
    keep only rows whose ``DungeonType`` is in ``_FIELD_DUNGEON_TYPES`` (Seal /
    Quest / instance / abyss types are dropped)."""
    dgs = {r["ID"]["Value"]: r for r in _table("Dungeon.json")}
    out = {}
    for e in _table("EnvObjData.json"):
        if e.get("Usage") != "EEnvObjectUsage::EnterDungeon":
            continue
        uv = str(e.get("UsageValue", ""))
        if not uv.isdigit():
            continue
        dg = dgs.get(int(uv))
        if dg is not None and dg.get("DungeonType") in _FIELD_DUNGEON_TYPES:
            out[e["ID"]["Value"]] = dg
    return out


def _field_named_bosses(map_id: int) -> dict:
    """spawner Name -> WorldMapFieldNamed row, for named field bosses on a map.

    ``WorldMapFieldNamed.FieldNamedSpawnerName`` matches a ``SpawnInfoList``
    entry Name in that map's ``MapData.json`` (100% resolve in the current
    export), giving the boss a world position; the spawn entry's ``NpcIdList``
    resolves a localized boss name via ``NpcData.Desc``."""
    return {
        r["FieldNamedSpawnerName"]: r
        for r in _table("WorldMapFieldNamed.json")
        if r["MapId"]["Value"] == map_id
    }


@lru_cache(maxsize=None)
def _npc_index() -> dict:
    return {r["ID"]["Value"]: r for r in _table("NpcData.json")}


@lru_cache(maxsize=None)
def _teleport_env_ids() -> frozenset:
    """EnvObj defs usable as world teleport/flight artifacts."""
    return frozenset(
        e["ID"]["Value"] for e in _table("EnvObjData.json")
        if e.get("Usage") == "EEnvObjectUsage::TeleportArtifact"
    )


@lru_cache(maxsize=None)
def _hiddencube_open_env_ids() -> frozenset:
    """EnvObj defs for hidden cubes that are openable WITHOUT a key (yellow).

    Split is by ``bIsKeyOnly`` (the KEY-REQUIREMENT axis), NOT by faction:
    both HiddenCubeLight and HiddenCubeDark categories contain both values.
    ``bIsKeyOnly == False`` -> yellow (ResourceKey HiddenCube_01,
    RequireConfirmDesc.Key UI_ENVOBJ_TREASUREBOX_DESC)."""
    return frozenset(
        e["ID"]["Value"] for e in _table("EnvObjData.json")
        if str(e.get("Category", "")).startswith("EEnvObjCategory::HiddenCube")
        and not e.get("bIsKeyOnly", False)
    )


@lru_cache(maxsize=None)
def _seal_dungeons_by_map() -> dict:
    """map Name -> {dungeon ID (str) -> Dungeon row} for DungeonType==Seal."""
    out: dict[str, dict] = {}
    for d in _table("Dungeon.json"):
        if d.get("DungeonType") != "EDungeonType::Seal":
            continue
        out.setdefault(d.get("LinkedMap", ""), {})[str(d["ID"]["Value"])] = d
    return out


def _seal_env_to_dungeon(map_name: str) -> dict:
    """EnvObj ID -> Seal Dungeon row, for EnterDungeon EnvObjs whose UsageValue
    references a Seal dungeon linked to ``map_name``."""
    seal_dgs = _seal_dungeons_by_map().get(map_name, {})
    out = {}
    for e in _table("EnvObjData.json"):
        if e.get("Usage") != "EEnvObjectUsage::EnterDungeon":
            continue
        dg = seal_dgs.get(str(e.get("UsageValue")))
        if dg is not None:
            out[e["ID"]["Value"]] = dg
    return out


@lru_cache(maxsize=None)
def _spawner_to_group() -> dict:
    """fragment spawner Name -> monolith GroupName (across all maps)."""
    out = {}
    for e in _table("Achievement.json"):
        g = e.get("GroupName", "")
        if g.startswith(_MONO_PREFIX) and e["ObjType"].endswith("UseEnvObjSpawnerName"):
            for ov in e.get("ObjValues", []):
                out[ov] = g
    return out


@lru_cache(maxsize=None)
def _achievement_group_index() -> dict:
    """GroupName -> AchievementGroup entry (ID, Title)."""
    return {e["Name"]: e for e in _table("AchievementGroup.json")}


def _ids(lst):
    return [x.get("Value") if isinstance(x, dict) else x for x in lst]


def _centroid(points):
    n = len(points)
    return [round(sum(p[0] for p in points) / n, 2), round(sum(p[1] for p in points) / n, 2)]


def extract_map(name: str, l10n: L10N) -> dict:
    entry = _maps_index()[name]
    map_id = entry["ID"]["Value"]

    # ---- 1. SubzoneGroups (only those referenced by this map's subzones) ----
    subzones_raw = [s for s in _table("Subzone.json") if s["MapId"]["Value"] == map_id]
    group_defs = {g["ID"]: g for g in _table("SubzoneGroup.json")}
    NONE = "ESubzoneGroupID::ESubzoneGroupID_None"
    used_group_ids = {s["WorldMapFogGroupId"] for s in subzones_raw} - {NONE}
    subzone_groups = []
    for gid in sorted(used_group_ids):
        g = group_defs.get(gid)
        desc = g["Desc"] if g else {"Key": "None"}
        subzone_groups.append({
            "ID": gid,
            "Desc": desc,
            "name_en": l10n.en(desc.get("Key", "")),
            "name_zhCN": l10n.zh_cn(desc.get("Key", "")),
            "resolved": g is not None,
        })

    # ---- 2. geometry (by SubzoneTableId) + world-map icon (by SubzoneId) ----
    md = json.loads(map_data_path(name).read_text(encoding="utf-8"))
    geom = {}
    for e in _find_first(md, "SubzoneVolumeInfoMap") or []:
        v = e["Value"]
        pts = [(p["X"], p["Y"]) for p in (v.get("Points") or [])]
        tid = v.get("SubzoneTableId")
        area = None
        if len(pts) >= 3:
            poly = Polygon(pts)
            if not poly.is_valid:
                poly = poly.buffer(0)
            area = poly.area
        loc = v.get("Location") or {}
        geom[tid] = {
            "Location": [loc.get("X"), loc.get("Y"), loc.get("Z")] if loc else None,
            "area": round(area, 2) if area is not None else None,
            "Points": [[round(x, 2), round(y, 2)] for x, y in pts],
        }
    icons = {
        r["SubzoneId"]["Value"]: r
        for r in _table("WorldMapUIRegion.json")
        if r["MapId"]["Value"] == map_id and r.get("bEnableWorldMap")
    }

    # transform for pixel coords (optional)
    transform = None
    wmp = worldmap_path(name)
    if wmp.exists():
        transform = WorldMapTransform(WorldMapMeta.from_json(wmp, name), ORIENTATION)

    def to_px(loc):
        if not transform or not loc or loc[0] is None:
            return None
        px, py = transform.world_to_pixel(loc[0], loc[1])
        return [round(px, 1), round(py, 1)]

    def to_px_points(world_pts):
        """Transform a ring of world (x, y) vertices to frontend pixel space,
        using the SAME WorldMapTransform/orientation as the marker `px` above,
        so polygons align with the markers. Returns None if no transform."""
        if not transform or not world_pts:
            return None
        ring = []
        for wx, wy in world_pts:
            px, py = transform.world_to_pixel(wx, wy)
            ring.append([round(px, 1), round(py, 1)])
        return ring

    # ---- subzones with everything joined ----
    subzones = []
    for s in subzones_raw:
        sid = s["ID"]["Value"]
        g = geom.get(sid, {})
        ic = icons.get(sid)
        wm_info = ic["WorldMapInfoType"] if ic else None
        subzones.append({
            "ID": sid,
            "Name": s["Name"],
            "DisplayName": s["DisplayName"],
            "name_en": l10n.en(s["DisplayName"]["Key"]),
            "name_zhCN": l10n.zh_cn(s["DisplayName"]["Key"]),
            "WorldMapFogGroupId": s["WorldMapFogGroupId"],
            "SubzoneType": s["SubzoneType"],
            "bMapEnabled": s.get("bMapEnabled", False),
            "IconType": ic["IconType"] if ic else None,
            "WorldMapInfoType": wm_info,
            # LOD rank parsed from WorldMapInfoType (Region_Rank1/2 -> 1/2).
            "IconRank": _parse_rank(wm_info),
            "Location": g.get("Location"),
            "px": to_px(g.get("Location")),
            "area": g.get("area"),
            # Real subzone polygon boundary in frontend pixel space (same
            # transform as `px`), so region borders align with markers.
            "pxBorders": to_px_points(g.get("Points")),
        })

    # ---- canonical subzone per display name: icon-bearing, else max area ----
    by_name = {}
    for sz in subzones:
        if sz["name_en"]:
            by_name.setdefault(_norm(sz["name_en"]), []).append(sz)
    canonical_id = {}  # norm(name) -> canonical subzone ID
    for key, lst in by_name.items():
        iconed = [s for s in lst if s["IconType"]]
        pool = iconed or lst
        best = max(pool, key=lambda s: (s["area"] or 0))
        canonical_id[key] = best["ID"]
    for sz in subzones:
        k = _norm(sz["name_en"]) if sz["name_en"] else None
        canon = canonical_id.get(k)
        sz["canonical"] = (canon == sz["ID"])
        sz["canonicalId"] = canon  # the chosen actor for this name (self if canonical)

    # ---- 3. god fragments -> monolith group -> canonical subzone ----
    gf_ids = _godfragment_env_ids()
    spawn2grp = _spawner_to_group()
    grp_index = _achievement_group_index()
    fragments = []
    group_frag_count = {}
    for s in md["Properties"]["Data"].get("SpawnInfoList", []):
        if not (set(_ids(s.get("EnvObjIdList", []))) & gf_ids):
            continue
        grp = spawn2grp.get(s["Name"])
        loc = s["Positions"][0]["Location"]
        loc3 = [round(loc["X"], 2), round(loc["Y"], 2), round(loc["Z"], 2)]
        fragments.append({
            "Name": s["Name"],
            "EnvObjId": _ids(s["EnvObjIdList"])[0],
            "GroupName": grp,
            "Location": loc3,
            "px": to_px(loc3),
        })
        if grp:
            group_frag_count[grp] = group_frag_count.get(grp, 0) + 1

    monolith_groups = []
    subzone_by_id = {sz["ID"]: sz for sz in subzones}
    for grp in sorted(group_frag_count, key=lambda g: int(g.rsplit("_", 1)[-1])):
        age = grp_index.get(grp, {})
        title = age.get("Title", {"Key": "None"})
        title_en = l10n.en(title.get("Key", ""))
        canon = canonical_id.get(_norm(title_en))
        canon_sz = subzone_by_id.get(canon)
        monolith_groups.append({
            "GroupName": grp,
            "AchievementGroupId": age.get("ID", {}).get("Value"),
            "Title": title,
            "title_en": title_en,
            "title_zhCN": l10n.zh_cn(title.get("Key", "")),
            "FragmentCount": group_frag_count[grp],
            "SubzoneId": canon,
            "SubzoneName": canon_sz["Name"] if canon_sz else None,
        })

    # ---- 4. world markers placed via SpawnInfoList (teleport, hiddenCube,
    #         gathering, dungeon, boss) and via instance gates (seal). Same
    #         world->pixel transform as everything else, so they align with
    #         subzone polygons + markers.
    tp_ids = _teleport_env_ids()
    hc_open_ids = _hiddencube_open_env_ids()
    gather_type = _gather_source_type_by_env()   # EnvObj ID -> SourceType (Od, Herb, ...)
    field_dg = _enter_dungeon_env_to_field_dungeon()  # EnvObj ID -> field Dungeon row
    seal_env = _seal_env_to_dungeon(name)  # EnvObj ID -> Seal Dungeon row
    named_bosses = _field_named_bosses(map_id)  # spawner Name -> WorldMapFieldNamed row
    npc_idx = _npc_index()
    world_markers = []
    for s in md["Properties"]["Data"].get("SpawnInfoList", []):
        env = set(_ids(s.get("EnvObjIdList", [])))
        emit = []  # list of (kind, name_en, name_zhCN, env_obj_id, extra)
        if env & tp_ids:
            emit.append(("teleport", "", "", next(iter(env & tp_ids)), None))
        if env & hc_open_ids:
            # Hidden-cube spawners list BOTH variants (one bIsKeyOnly=False open +
            # one bIsKeyOnly=True key-only EnvObj def) at the same spawn points; we
            # keep ONLY the yellow (openable) cube and drop the key-only variant.
            emit.append(("hiddenCube", "", "", next(iter(env & hc_open_ids)), None))
        # gathering: one marker per spawn, subtype carries the SourceType.
        gather_hit = next((i for i in env if i in gather_type), None)
        if gather_hit is not None:
            emit.append(("gathering", "", "", gather_hit, gather_type[gather_hit]))
        # field dungeon entrances (non-Seal player-facing). None present in the
        # current export, but parsed generically if future data adds them.
        dg_hit = next((field_dg[i] for i in env if i in field_dg), None)
        if dg_hit is not None:
            title = dg_hit.get("Title", {}) or {}
            emit.append((
                "dungeon",
                l10n.en(title.get("Key", "")) or "",
                l10n.zh_cn(title.get("Key", "")) or "",
                next(i for i in env if i in field_dg),
                None,
            ))
        if not emit:
            seal_hit = next((seal_env[i] for i in env if i in seal_env), None)
            if seal_hit is not None:
                title = seal_hit.get("Title", {}) or {}
                emit.append((
                    "seal",
                    l10n.en(title.get("Key", "")) or "",
                    l10n.zh_cn(title.get("Key", "")) or "",
                    next((i for i in env if i in seal_env), next(iter(env)) if env else None),
                    None,
                ))
        # boss: named field monster placed via WorldMapFieldNamed (NPC spawn,
        # no EnvObj). Resolve the boss display name from its NpcData.Desc.
        if not emit:
            boss = named_bosses.get(s["Name"])
            if boss is not None:
                npc_ids = _ids(s.get("NpcIdList", []))
                npc = npc_idx.get(npc_ids[0]) if npc_ids else None
                desc = (npc or {}).get("Desc", {}) or {}
                emit.append((
                    "boss",
                    l10n.en(desc.get("Key", "")) or "",
                    l10n.zh_cn(desc.get("Key", "")) or "",
                    None,
                    None,
                ))
        if not emit:
            continue
        loc = s["Positions"][0]["Location"]
        loc3 = [round(loc["X"], 2), round(loc["Y"], 2), round(loc["Z"], 2)]
        px = to_px(loc3)
        for kind, name_en, name_zh, env_obj_id, extra in emit:
            wm = {
                "kind": kind,
                "Name": s["Name"],
                "EnvObjId": env_obj_id,
                "name_en": name_en,
                "name_zhCN": name_zh,
                "Location": loc3,
                "px": px,
            }
            if kind == "gathering":
                wm["sourceType"] = extra  # e.g. "Od" -> subtype gatheringOd
            world_markers.append(wm)

    return {
        "Name": name,
        "MapId": map_id,
        "BaseDir": entry.get("BaseDir", ""),
        "transform": {"orientation": "px_from=X,flip_x=False,flip_y=False",
                      "verified_maps": ["World_L_A"], "hasWorldMap": transform is not None},
        "SubzoneGroups": subzone_groups,
        "Subzones": subzones,
        "MonolithGroups": monolith_groups,
        "Fragments": fragments,
        "WorldMarkers": world_markers,
    }


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    l10n = L10N()
    maps_idx = _maps_index()
    hdr = (f"{'map':20s}{'subzones':>9s}{'polys':>6s}{'groups':>7s}{'icons':>6s}"
           f"{'fragments':>10s}{'monoGroups':>11s}{'tp':>4s}{'seal':>5s}{'cube':>6s}"
           f"{'gath':>6s}{'dgn':>5s}{'boss':>5s}")
    print(hdr)
    for name in REQUESTED_MAPS:
        if name not in maps_idx:
            print(f"{name:20s}  SKIPPED — not in Map.json (deprecated/replaced)")
            continue
        data = extract_map(name, l10n)
        (OUT_DIR / f"{name}.json").write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        n_icons = sum(1 for s in data["Subzones"] if s["IconType"])
        n_poly = sum(1 for s in data["Subzones"] if s.get("pxBorders"))
        wm = data.get("WorldMarkers", [])
        kc = {k: sum(1 for w in wm if w["kind"] == k)
              for k in ("teleport", "seal", "hiddenCube", "gathering", "dungeon", "boss")}
        print(f"{name:20s}{len(data['Subzones']):>9d}{n_poly:>6d}{len(data['SubzoneGroups']):>7d}"
              f"{n_icons:>6d}{len(data['Fragments']):>10d}{len(data['MonolithGroups']):>11d}"
              f"{kc['teleport']:>4d}{kc['seal']:>5d}{kc['hiddenCube']:>6d}"
              f"{kc['gathering']:>6d}{kc['dungeon']:>5d}{kc['boss']:>5d}")


if __name__ == "__main__":
    main()
