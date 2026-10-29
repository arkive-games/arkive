"""Emit stage: the game's own map legend as an Arkive map dataset.

Sources, all from ``uex export --profile pbz`` (see ``RAW_FILES``):

* ``DT_MapData``: every area map, its painted texture and its display name.
  Several areas share one painting (Pangzhen, its back streets and the Mirage
  Estate are all on ``T_Map_PZ_8k``), so the site's maps are the distinct
  textures, each collecting the markers of every area drawn on it.
* ``GlobalMapAnchorData``: the world->UV anchors (see ``projection``).
* ``DT_MapItemData``: what the in-game map legend shows, per area, with world
  locations: bells, memory flowers, shards, chests, keys, weapons, accessories
  and medicines, and the three landmark kinds.
* Name tables: ``DT_BellData``, ``DT_InventoryData``, ``DT_WeaponData``,
  ``DT_ShaqiWeaponData``, ``DT_Accessory``, ``DT_MedicineTable``, joined on
  their ``ItemId``, with the text out of each culture's ``Game.locres``.
* ``placements.json`` (written by ``scan``), ``DT_LevelLootDataTable`` and
  ``DT_CodexEnemyDataTable``: everything placed in the levels that the legend
  does not track -- notes, materials, dust, story items, bosses (see
  ``placements``). Optional: without a scan the legend markers still emit.

Markers are emitted in image pixels (the legacy contract mode: no
``worldBounds``), because the anchor fit is not a linear transform the
frontend could reproduce. ``z`` keeps the world height for the readout.
"""

from __future__ import annotations

import hashlib
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path

from ..common import read_json, write_json
from ..locres import read_culture
from . import placements as placed
from .projection import AnchorProjection, anchors_from_asset

CONTENT = Path("ProjectPBZ/Content")
PBZ = CONTENT / "PBZContent"
RAW_FILES = {
    "maps": PBZ / "DataTable/UI/DT_MapData.json",
    "anchors": PBZ / "Maps/GlobalMapAnchorData.json",
    "items": PBZ / "Maps/DT_MapItemData.json",
    "bells": PBZ / "DataTable/UI/DT_BellData.json",
    "inventory": PBZ / "DataTable/Item/DT_InventoryData.json",
    "weapons": PBZ / "DataTable/UI/DT_WeaponData.json",
    "phantomEdges": PBZ / "DataTable/UI/DT_ShaqiWeaponData.json",
    "accessories": PBZ / "DataTable/UI/DT_Accessory.json",
    "medicines": PBZ / "DataTable/UI/DT_MedicineTable.json",
    "loot": PBZ / "DataTable/DT_LevelLootDataTable.json",
    "codex": PBZ / "DataTable/DT_CodexEnemyDataTable.json",
}
PLACEMENTS = Path("placements.json")
TEXTURE_DIR = PBZ / "UI/Texture/Map"
LOCALIZATION_DIR = CONTENT / "Localization/Game"

# Site locale -> the game's culture directory.
CULTURES = {"en-US": "en-US", "zh-CN": "zh-Hans", "zh-TW": "zh-Hant"}

TILE = 1024
TILE_LEVELS = 3

# Areas that are not real maps: the 1024px world overview and a test level.
SKIPPED_AREAS = {"BigMap", "Test"}


@dataclass(frozen=True)
class Subtype:
    id: str
    category: str
    source: str  # the DT_MapItemData array; "" for kinds placed in the levels
    icon: str  # resource icons/<icon>.webp, converted by the tiles stage
    text_key: str  # its legend entry in Game.locres
    color: str
    default_active: bool = True


# The in-game map legend, in its own order and with its own words, followed by
# the kinds ``placements`` finds in the levels, named by the inventory screen's
# own tab labels. The categories are this site's grouping. Materials and dust
# start hidden: they outnumber everything else on a map several times over.
SUBTYPES = [
    Subtype("bell", "travel", "BellDatas", "T_Map_CollectionProgress_Bell", "UI_Map_26", "#C9A227"),
    Subtype("longPillar", "travel", "LongZhu", "T_Longzhu_PH", "UI_Map_23", "#8FB8C9"),
    Subtype("banyan", "travel", "RongShu", "T_Darongshu_PH", "UI_Map_24", "#7FA36B"),
    Subtype("scarecrow", "travel", "DaoCaoRen", "T_Daocaoren_PH", "UI_Map_25", "#B08A5B"),
    Subtype("memoryFlower", "collectibles", "MemoryFlowerData", "T_Map_CollectionProgress_MemoryFlower", "UI_Map_20", "#C45A7A"),
    Subtype("blackstoneShard", "collectibles", "HeiShiItemData", "T_Map_CollectionProgress_Heishisuipian", "UI_Map_02", "#5E6A78"),
    Subtype("amberShard", "collectibles", "HupoItemData", "T_Map_CollectionProgress_Shaqihupo", "UI_Map_01", "#C77B30"),
    Subtype("majorChest", "collectibles", "PrimaryItemData", "T_Baoxiang_PH", "UI_Map_21", "#A6763C"),
    Subtype("key", "collectibles", "YaoShiItemData", "T_Yaoshi_PH", "UI_Map_22", "#B5A26A"),
    Subtype("weapon", "equipment", "WeaponItemDatas", "T_Map_CollectionProgress_WeaponGear", "Weapon", "#B0413E"),
    Subtype("phantomEdge", "equipment", "ShaChiWeaponItemDatas", "T_WuqiYZWZ_PH", "PhantomEdge", "#7A4FA0"),
    Subtype("accessory", "equipment", "AccessoryItemDatas", "T_Shipin_Yaopin_PH", "Accessory", "#3F8C8C"),
    Subtype("medicine", "equipment", "MedicineItemDatas", "T_Map_CollectionProgress_Accessory_Potion", "Medicine", "#4C8C4A"),
    Subtype("memoryPetal", "collectibles", "", "T_Jiyizhihua_PH", "UI_Pickup_15", "#D98BA3"),
    Subtype("notes", "collectibles", "", "ico_book", "UI_Literature_01", "#C8B48A"),
    Subtype("treasure", "collectibles", "", "T_WIcon_T_02001", "UI_Inventory_26", "#D4A93C"),
    Subtype("storyItem", "collectibles", "", "T_WIcon_I_01001", "UI_Inventory_29", "#9C6B9E"),
    Subtype("weaponMaterial", "materials", "", "T_WhiteIcon_Weapon_Material_01", "UI_Inventory_09", "#B8664A", default_active=False),
    Subtype("phantomEdgeMaterial", "materials", "", "T_WhiteIcon_Weapon_Material_13", "UI_Inventory_16", "#8A63B3", default_active=False),
    Subtype("weaponTemper", "materials", "", "T_WIcon_TU_02001", "UI_Inventory_19", "#C98A6B", default_active=False),
    Subtype("phantomEdgeTemper", "materials", "", "T_WIcon_TU_01001", "UI_Inventory_20", "#A48BC9", default_active=False),
    Subtype("accessoryMaterial", "materials", "", "T_WhiteIcon_Ac_Material_1", "UI_Inventory_17", "#4FA3A3", default_active=False),
    Subtype("accessoryFragment", "materials", "", "T_WIcon_AC_DrinkCost_1", "UI_Inventory_30", "#6FB8B0", default_active=False),
    Subtype("medicineMaterial", "materials", "", "T_WhiteIcon_Medi_Material_1", "UI_Inventory_18", "#6AA867", default_active=False),
    Subtype("progression", "materials", "", "T_WIcon_ShaqiHexin", "UI_Inventory_28", "#D0603F", default_active=False),
    Subtype("consumable", "items", "", "T_WIcon_Return_Weapon_1", "Consumable", "#8C9BA8"),
    Subtype("dust", "items", "", "Yishichenai", "UI_SkillWidget_13", "#9AA3AD", default_active=False),
    Subtype("boss", "enemies", "", "T_MapHun_Gold", "Boss", "#C23B3B"),
]
SUBTYPE_BY_ID = {st.id: st for st in SUBTYPES}
CATEGORY_TEXT = {
    "travel": "category.travel",
    "collectibles": "category.collectibles",
    "equipment": "category.equipment",
    "materials": "UI_Inventory_01",
    "items": "category.items",
    "enemies": "UI_Literature_29",
}

# Names the game has no single string for. The legend pairs weapons with
# Phantom Edges and accessories with medicines under one heading each, and the
# category headings are this site's grouping, not the game's.
SITE_TEXT = {
    "Weapon": {"en-US": "Weapons", "zh-CN": "武器", "zh-TW": "武器"},
    "PhantomEdge": {"en-US": "Phantom Edges", "zh-CN": "影之武装", "zh-TW": "影之武裝"},
    "Accessory": {"en-US": "Accessories", "zh-CN": "饰品", "zh-TW": "飾品"},
    "Medicine": {"en-US": "Medicines", "zh-CN": "药瓶", "zh-TW": "藥瓶"},
    "category.travel": {"en-US": "Travel", "zh-CN": "穿行", "zh-TW": "穿行"},
    "category.collectibles": {"en-US": "Collectibles", "zh-CN": "收集", "zh-TW": "收集"},
    "category.equipment": {"en-US": "Equipment", "zh-CN": "装备", "zh-TW": "裝備"},
    "category.items": {"en-US": "Items", "zh-CN": "道具", "zh-TW": "道具"},
    "Consumable": {"en-US": "Consumables", "zh-CN": "消耗品", "zh-TW": "消耗品"},
    "Boss": {"en-US": "Bosses", "zh-CN": "首领", "zh-TW": "首領"},
}
# Legend entries the game leaves untranslated in zh-Hant; the zh-Hans text in
# traditional characters.
ZH_TW_GAPS = {
    "UI_Map_21": "重要寶箱",
    "UI_Map_22": "鑰匙",
    "UI_Map_23": "龍柱",
    "UI_Map_24": "大榕樹",
    "UI_Map_25": "稻草人",
    "UI_Inventory_01": "材料",
    "UI_Literature_01": "文書",
}
# How a marker's contents are listed in its description.
LIST_SEPARATOR = {"en-US": ", ", "zh-CN": "、", "zh-TW": "、"}

# The item arrays whose entries name a row in another table: the field that
# holds the id, and the table + text property that names it.
NAME_SOURCES = {
    "BellDatas": ("BellID", "bells", "BellName"),
    "YaoShiItemData": ("ItemId", "inventory", "ItemName"),
    "MemoryFlowerData": ("ItemId", "inventory", "ItemName"),
    "WeaponItemDatas": ("WeaponID", "weapons", "WeaponName"),
    "ShaChiWeaponItemDatas": ("WeaponID", "phantomEdges", "WeaponName"),
    "AccessoryItemDatas": ("AccessoryID", "accessories", "AccessoryName"),
    "MedicineItemDatas": ("MedicineID", "medicines", "Name"),
}


def level_areas(raw: Path, projections: dict) -> dict[str, list[str]]:
    """``{level name: [anchor area, ...]}``: which areas draw each level.

    Anchors are keyed by an area's ``MapID``, which is not always its row name
    (the Huanshu ruins are row ``HuanShuShi``, anchors ``MeiGu_YiJi``).
    """
    out: dict[str, list[str]] = defaultdict(list)
    for key, row in read_json(raw / RAW_FILES["maps"])[0]["Rows"].items():
        anchor_key = row["MapID"] if row["MapID"] in projections else key
        if anchor_key in projections and row["LevelName"] != "None":
            out[row["LevelName"]].append(anchor_key)
    return out


def area_textures(raw: Path) -> dict[str, str]:
    """``{area: painted texture}``, under both an area's row name and its MapID."""
    out = {}
    for key, row in read_json(raw / RAW_FILES["maps"])[0]["Rows"].items():
        textures = [t["AssetPathName"] for t in row["MapTextures"] if t["AssetPathName"]]
        if textures:
            texture = textures[0].rsplit(".", 1)[-1]
            out.setdefault(key, texture)
            out.setdefault(row["MapID"], texture)
    return out


def load_text(raw: Path) -> dict[str, dict[str, str]]:
    """``{site locale: {key: text}}`` from the game's ``Default`` namespace."""
    return {
        lng: read_culture(raw / LOCALIZATION_DIR / culture).get("Default", {})
        for lng, culture in CULTURES.items()
    }


def name_keys(raw: Path) -> dict[str, dict[str, str]]:
    """``{table: {id: locres key}}`` for every table a marker name comes from."""
    out: dict[str, dict[str, str]] = {}
    for table in ("inventory", "weapons", "phantomEdges", "accessories", "medicines"):
        rows = read_json(raw / RAW_FILES[table])[0]["Rows"].values()
        field = next(f for src, (_, t, f) in NAME_SOURCES.items() if t == table)
        out[table] = {r["ItemId"]: r[field]["Key"] for r in rows if r.get("ItemId") and r[field].get("Key")}
    bells = read_json(raw / RAW_FILES["bells"])[0]["Rows"].values()
    out["bells"] = {r["BellID"]: r["BellName"]["Key"] for r in bells if r["BellName"].get("Key")}
    return out


def site_maps(raw: Path, anchors: dict) -> tuple[list[dict], dict[str, str]]:
    """The distinct painted textures as site maps, and ``{area: site map id}``."""
    rows = read_json(raw / RAW_FILES["maps"])[0]["Rows"]
    by_texture: dict[str, list[tuple[str, dict]]] = defaultdict(list)
    for area, row in rows.items():
        textures = [t["AssetPathName"] for t in row["MapTextures"] if t["AssetPathName"]]
        if area in SKIPPED_AREAS or not textures or area not in anchors:
            continue
        by_texture[textures[0].rsplit(".", 1)[-1]].append((area, row))
    maps, area_map = [], {}
    for texture, areas in by_texture.items():
        areas.sort(key=lambda a: a[1]["MapOrder"])
        first_area, first = areas[0]
        map_id = first_area
        maps.append({
            "id": map_id,
            "texture": texture,
            "order": first["MapOrder"],
            "nameKey": first["MapName"]["Key"],
            "areas": [a for a, _ in areas],
        })
        for area, _ in areas:
            area_map[area] = map_id
    maps.sort(key=lambda m: m["order"])
    return maps, area_map


def marker_id(subtype: str, area: str, entry: dict) -> str:
    loc = entry["Location"]
    ident = entry.get("SaveGuidString") or entry.get("BellID") or ""
    seed = f"{area}|{ident}|{loc['X']:.0f},{loc['Y']:.0f},{loc['Z']:.0f}"
    return f"{subtype}-{hashlib.sha1(seed.encode()).hexdigest()[:10]}"


def build_dataset(raw: Path, image_sizes: dict[str, tuple[int, int]]) -> dict:
    """Everything ``run_emit`` writes, keyed by output path."""
    raw = Path(raw)
    anchors = anchors_from_asset(read_json(raw / RAW_FILES["anchors"]))
    projections = {area: AnchorProjection(a) for area, a in anchors.items()}
    maps, area_map = site_maps(raw, anchors)
    texture_map = {m["texture"]: m["id"] for m in maps}
    area_texture = area_textures(raw)
    text = load_text(raw)
    names = name_keys(raw)

    def legend(key: str, lng: str) -> str:
        if key in SITE_TEXT:
            return SITE_TEXT[key][lng]
        value = text[lng].get(key) or (ZH_TW_GAPS.get(key) if lng == "zh-TW" else None)
        if not value:
            raise RuntimeError(f"no {lng} text for legend key {key}")
        return " ".join(value.split())  # the legend wraps long names with "\n"

    markers: dict[str, list[dict]] = {m["id"]: [] for m in maps}
    labels: dict[str, dict[str, str]] = {}  # marker id -> locres key
    unplaced: Counter = Counter()
    rehomed: Counter = Counter()
    seen: set[str] = set()
    legend_points: list[tuple[float, float, float]] = []
    for area_entry in read_json(raw / RAW_FILES["items"])[0]["Properties"]["MapItemDatas"]:
        area = area_entry["Key"]
        if area in SKIPPED_AREAS:
            continue
        for st in SUBTYPES:
            if not st.source:
                continue
            for entry in area_entry["Value"].get(st.source, []):
                loc = entry["Location"]
                world = (loc["X"], loc["Y"], loc["Z"])
                if world == (0, 0, 0):  # declared in the legend but never placed
                    unplaced[st.id] += 1
                    continue
                legend_points.append(world)
                home = area if area in projections else None
                if home is None:
                    # An area with no anchors of its own (the Crimson Forest
                    # reuses Mirrorwood's level): whichever area's anchors are
                    # nearest owns it, if any is near enough.
                    home = min(projections, key=lambda a: projections[a].nearest_distance(world))
                    rehomed[area] += 1
                uv = projections[home].project(world)
                if uv is None or home not in area_map:
                    unplaced[st.id] += 1
                    continue
                map_id = area_map[home]
                width, height = image_sizes[map_id]
                mid = marker_id(st.id, area, entry)
                if mid in seen:  # the same pickup listed under two areas
                    continue
                seen.add(mid)
                marker = {
                    "id": mid,
                    "category": st.category,
                    "subtype": st.id,
                    "x": round(uv[0] * width, 1),
                    "y": round(uv[1] * height, 1),
                    "z": round(loc["Z"]),
                    "images": [],
                    "contributors": [],
                }
                markers[map_id].append(marker)
                if st.source in NAME_SOURCES:
                    field, table, _ = NAME_SOURCES[st.source]
                    key = names[table].get(entry.get(field) or "")
                    if key and all(text[lng].get(key) for lng in ("en-US", "zh-CN")):
                        labels[mid] = key

    descriptions: dict[str, tuple[list[tuple[str, int]], tuple[int, int] | None]] = {}
    if (raw / PLACEMENTS).is_file():
        loot = read_json(raw / RAW_FILES["loot"])[0]["Rows"]
        codex = read_json(raw / RAW_FILES["codex"])[0]["Rows"]
        items = {r["ItemId"]: r for r in read_json(raw / RAW_FILES["inventory"])[0]["Rows"].values()
                 if r.get("ItemId")}
        found = placed.collect(read_json(raw / PLACEMENTS), loot, items, codex, legend_points)
        candidates = level_areas(raw, projections)
        for p in found:
            home = placed.home_area(p, candidates.get(p.level, []), projections)
            uv = projections[home].project(p.world) if home else None
            map_id = texture_map.get(area_texture.get(home or "", ""))
            if uv is None or map_id is None:
                unplaced[p.kind] += 1
                continue
            mid = f"{p.kind}-{hashlib.sha1(p.seed.encode()).hexdigest()[:10]}"
            if mid in seen:
                continue
            seen.add(mid)
            width, height = image_sizes[map_id]
            marker = {
                "id": mid,
                "category": SUBTYPE_BY_ID[p.kind].category,
                "subtype": p.kind,
                "x": round(uv[0] * width, 1),
                "y": round(uv[1] * height, 1),
                "z": round(p.world[2]),
                "images": [],
                "contributors": [],
            }
            if p.icon:
                marker["icon"] = p.icon
            markers[map_id].append(marker)
            if p.name_key and all(text[lng].get(p.name_key) for lng in ("en-US", "zh-CN")):
                labels[mid] = p.name_key
            if p.contents or p.dust:
                descriptions[mid] = (p.contents, p.dust)

    def describe(mid: str, lng: str) -> str:
        contents, dust = descriptions[mid]
        parts = []
        for key, amount in contents:
            name = " ".join((text[lng].get(key) or text["zh-CN"].get(key) or "").split())
            if name:
                parts.append(f"{name} ×{amount}" if amount > 1 else name)
        if dust:
            amount = str(dust[0]) if dust[0] == dust[1] else f"{dust[0]}–{dust[1]}"
            parts.append(f"{legend('UI_SkillWidget_13', lng)} {amount}")
        return LIST_SEPARATOR[lng].join(parts)

    for lst in markers.values():
        lst.sort(key=lambda m: (m["subtype"], m["y"], m["x"]))
        index: Counter = Counter()
        for m in lst:
            index[m["subtype"]] += 1
            m["indexInSubtype"] = index[m["subtype"]]
            m["tier"] = 1

    out: dict[str, object] = {}
    out["maps.json"] = {"maps": [{
        "id": m["id"],
        "name": m["id"],
        "type": "area",
        "tileWidth": TILE,
        "tileHeight": TILE,
        "tilesCountX": -(-image_sizes[m["id"]][0] // TILE),
        "tilesCountY": -(-image_sizes[m["id"]][1] // TILE),
        "tileLevels": TILE_LEVELS,
        "isVisible": True,
    } for m in maps]}
    categories = list(dict.fromkeys(st.category for st in SUBTYPES))
    out["types.json"] = {"categories": [{
        "id": c,
        "name": c,
        # One ring per marker, tinted by its subtype: every kind reads at the
        # same size, whatever the proportions of the game art inside it.
        "pinVariant": "circular",
        "subtypes": [{
            "id": st.id,
            "name": st.id,
            "icon": st.icon,
            "color": st.color,
            "defaultActive": st.default_active,
            "canComplete": True,
        } for st in SUBTYPES if st.category == c],
    } for c in categories]}
    for m in maps:
        out[f"markers/{m['id']}.json"] = {"markers": markers[m["id"]]}
        out[f"regions/{m['id']}.json"] = {"regions": []}
    for lng in CULTURES:
        out[f"locales/{lng}/maps.json"] = {m["id"]: {
            "name": legend(m["nameKey"], lng),
            "description": "",
            "shortName": legend(m["nameKey"], lng),
        } for m in maps}
        out[f"locales/{lng}/types.json"] = {
            "categories": {c: {"name": legend(CATEGORY_TEXT[c], lng)} for c in categories},
            "subtypes": {st.id: {"name": legend(st.text_key, lng)} for st in SUBTYPES},
        }
        for m in maps:
            entries: dict[str, dict[str, str]] = {}
            for mk in markers[m["id"]]:
                entry = {}
                if mk["id"] in labels:
                    key = labels[mk["id"]]
                    entry["name"] = " ".join((text[lng].get(key) or text["zh-CN"][key]).split())
                if mk["id"] in descriptions:
                    entry["description"] = describe(mk["id"], lng)
                if entry:
                    entries[mk["id"]] = entry
            out[f"locales/{lng}/markers/{m['id']}.json"] = entries
            out[f"locales/{lng}/regions/{m['id']}.json"] = {}

    report = {
        "maps": {m["id"]: len(markers[m["id"]]) for m in maps},
        "bySubtype": dict(Counter(mk["subtype"] for lst in markers.values() for mk in lst)),
        "named": len(labels),
        "described": len(descriptions),
        "unplaced": dict(unplaced),
        "rehomedAreas": dict(rehomed),
    }
    return {"files": out, "maps": maps, "report": report}


def run_emit(raw: Path, data_out: Path, image_sizes: dict[str, tuple[int, int]]) -> dict:
    ds = build_dataset(raw, image_sizes)
    for rel, obj in ds["files"].items():
        write_json(Path(data_out) / rel, obj)
    r = ds["report"]
    for map_id, n in r["maps"].items():
        print(f"emit: {map_id} {n} markers")
    print(f"emit: by subtype {r['bySubtype']}")
    print(f"emit: {r['named']} named; unplaced {r['unplaced']}; rehomed {r['rehomedAreas']}")
    return ds
