"""Catalog stage: emit the item / building / technology encyclopedias.

Companion to ``encyclopedia.py`` (which emits the Pal encyclopedia). This stage
reads the raw item, recipe, building and technology DataTables plus their L10N
text, computes the cross-reference graph (what crafts/drops/unlocks what) and
emits three datasets consumed by the palworld frontend's new /items, /buildings
and /technology pages.

Localized text is layered exactly as ``encyclopedia.py`` layers it (the mojibake
JA ``_Common`` base overlaid per-language from ``L10N/<folder>/Pal``), reusing
``_read_text`` / ``_text_by_lang`` / ``_all_tags`` from that module.

Cross-links (same id space throughout — item id == recipe product id ==
building material id; building id == UnlockBuildObjects entry; UnlockItemRecipes
entry == recipe row-key whose Product_Id is the crafted item):
  * item.recipe          — the recipe that crafts it (materials → item ids;
                           recipe.craftedAt → production building ids, from the
                           buildings' Blueprint converter params)
  * item.droppedBy       — pals that drop it, [{id, isBoss?}] (inverted from
                           pals.json drops + bossDrops; boss-only drops flagged)
  * item.partnerFor      — pals whose partner skill it unlocks (from pals.json)
  * item.usedInItems     — recipes that consume it  (→ product item ids)
  * item.usedInBuildings — buildings that consume it (→ building ids)
  * item.unlockTech      — techs that unlock its recipe
  * building.materials   — build cost (→ item ids)
  * building.unlockTech  — techs that unlock it
  * tech.unlockItems / tech.unlockBuildings — what a tech grants, by level
  * tech.requirePal        — pal whose capture unlocks the tech (SkillUnlock_*)

Item icons: DT_ItemIconDataTable_Common maps item id -> a texture under
``/Game/Others/InventoryItemIcon/Texture``. That ``Others`` tree lives in
Content/Others (one level above ``RAW`` = Content/Pal) and is now part of the
export, so items carry ``item_<id>.webp`` icons. The conversion is gated on the
PNG actually existing, so it degrades gracefully if a given export omits the tree.

Localized text guard: the game's L10N tables ship per-language PLACEHOLDER strings
for untranslated tier-variant rows (e.g. ``en Text`` / ``zh-hans text`` / ``-`` /
``ko_Text``); only the JA ``_Common`` base carries the real name (with a ``+N``
tier suffix). ``_ph`` detects these placeholders; item names then fall back to the
localized base item's name + the ``+N`` suffix, everything else to the JA base.

Outputs:
  data-palworld/items.json                 {items: [ItemEntry]}
  data-palworld/buildings.json             {buildings: [BuildingEntry]}
  data-palworld/technology.json            {techs: [TechEntry]}
  data-palworld/locales/<tag>/items.json       {id: {name, description?}}
  data-palworld/locales/<tag>/buildings.json   {id: {name, description?}}
  data-palworld/locales/<tag>/technology.json  {id: {name, description?,
                                                requireBossName?, requireResearchName?}}
  data-palworld/locales/<tag>/labels.json       {item: {typeA: label}, building: {typeA: label}}
  resource-palworld/icons/build_<id>.webp
  resource-palworld/icons/item_<id>.webp

Run: ``uv run python -m palworld.catalog`` (from the ``tools`` dir), AFTER
``encyclopedia`` (this stage reads data-palworld/pals.json for drop inversion).
"""

from __future__ import annotations

import json
import re
from collections import defaultdict
from pathlib import Path

from PIL import Image

from .blueprint_sources import (
    AREA_TEXT_IDS,
    collect_sources,
    dungeon_lottery_items,
    recycler_output_items,
)
from .encyclopedia import _all_tags, _read_text, _strip, _text_by_lang
from .env import require_dir
from .maps.common import read_rows, round2, write_json

_ITEM_A = "EPalItemTypeA::"
_ITEM_B = "EPalItemTypeB::"
_ELEM = "EPalElementType::"
_BLD_A = "EPalBuildObjectTypeA::"
_BLD_B = "EPalBuildObjectTypeB::"
_BLD_UI = "EPalBuildObjectTypeForUIDisplay::"
_ENERGY = "EPalEnergyType::"
_BOSS = "EPalBossType::"

# EPalEnergyType value -> the build-menu UI-category text row that names it
# (CATEGORY_TYPE_UI_Electricity = "Electricity" / 电力 / …) — the game's only
# standalone localized noun for a building's power requirement.
_ENERGY_TEXT = {"Electric": "Electricity"}

_NONE = {None, "None", "", "EPalElementType::None", "EPalEnergyType::None", "EPalBossType::None"}

# Internal / non-player build objects that carry a MapObjectName text row but are
# not real build-menu entries (no icon-table row, no unlock tech): a trap-reaction
# panel (mesh SM_WalkPoint) and a debug wood generator (mesh SM_Loggingcamp_Tree,
# name left as the untranslated id). Excluded from the emitted building set.
_EXCLUDE_BUILDINGS = {"Trap_MovingPanel", "WoodCreator"}

# Tokens embedded in technology name/description text.
_TOKEN_RE = re.compile(r"<(itemName|mapObjectName|uiCommon)\b[^>]*?id=\|([^|]+)\|[^>]*?/>")
_TAG_RE = re.compile(r"<[^>]+>")

# The game's L10N tables use per-language placeholder strings for untranslated
# rows: "en Text", "es_Text", "ko_Text", "zh-hans text", "zh-hant text", "-".
_PLACEHOLDER_RE = re.compile(r"^(?:-+|[a-z]{2}(?:-[a-z0-9]{2,4})?[ _]?text)$", re.IGNORECASE)
# Trailing tier suffix on a variant id (WeakerBow_2, AssaultRifle_Default2).
_VARIANT_SUFFIX_RE = re.compile(r"_?\d+$")


def _ph(s: str | None) -> str:
    """Return s if it's a real translation, else '' (empty or a placeholder)."""
    s = (s or "").strip()
    return "" if not s or _PLACEHOLDER_RE.match(s) else s


def _item_name(iid: str, iname: dict, ja_iname: dict, ja_name_to_id: dict) -> str:
    """Localized item name, healing placeholder tier-variant rows.

    Untranslated variants carry a placeholder in every language ("zh-hans text")
    while the JA base holds the real name with a "+N" tier suffix (アサルトライフル+1).
    We recover the localized name by matching the JA base ("アサルトライフル") back to
    its item id (AssaultRifle_Default1 -> 突击步枪) and re-appending "+N", so the
    result is fully localized (突击步枪+1). The id-suffix strip is a secondary
    heuristic (WeakerBow_2 -> WeakerBow). Failing both, the JA base string, then id.
    """
    nm = _ph(iname.get(iid))
    if nm:
        return nm
    ja = (ja_iname.get(iid) or "").strip()
    m = re.search(r"(\+\d+)$", ja)
    if m:
        base_ja = ja[: m.start()].rstrip()
        base_id = ja_name_to_id.get(base_ja)
        if not base_id:
            cand = _VARIANT_SUFFIX_RE.sub("", iid)
            base_id = cand if cand != iid else None
        if base_id:
            base_nm = _ph(iname.get(base_id))
            if base_nm:
                return base_nm + m.group(1)
    return _ph(ja) or iid


def _ci(d: dict, key: str) -> str | None:
    """Exact then case-insensitive lookup (MapObjectId vs MAPOBJECT_NAME_ key casing differs)."""
    if key in d:
        return d[key]
    lk = key.lower()
    for k, v in d.items():
        if k.lower() == lk:
            return v
    return None


def _materials(r: dict, n: int) -> list[dict]:
    out = []
    for i in range(1, n + 1):
        item = r.get(f"Material{i}_Id")
        cnt = r.get(f"Material{i}_Count", 0) or 0
        if item not in _NONE and cnt > 0:
            out.append({"item": item, "count": cnt})
    return out


def _food(r: dict) -> dict:
    f = {
        "satiety": r.get("RestoreSatiety", 0) or 0,
        "health": r.get("RestoreHealth", 0) or 0,
        "sanity": r.get("RestoreSanity", 0) or 0,
        "concentration": r.get("RestoreConcentration", 0) or 0,
    }
    return {k: v for k, v in f.items() if v}


def _equip(r: dict) -> dict:
    e = {
        "attack": r.get("PhysicalAttackValue", 0) or 0,
        "defense": r.get("PhysicalDefenseValue", 0) or 0,
        "hp": r.get("HPValue", 0) or 0,
        "shield": r.get("ShieldValue", 0) or 0,
        "magicAttack": r.get("MagicAttackValue", 0) or 0,
        "magicDefense": r.get("MagicDefenseValue", 0) or 0,
        "durability": r.get("Durability", 0) or 0,
        "magazine": r.get("MagazineSize", 0) or 0,
    }
    return {k: v for k, v in e.items() if v}


def _craft_specs(raw: Path, building_ids: set) -> dict:
    """Map crafting building id -> (TypeA set, TypeB set, max Rank).

    No DataTable links a recipe to the workbench that crafts it. That relation
    lives in each production building's Blueprint: a
    ``PalMapObjectItemConverterParameterComponent`` declares which item TypeA /
    TypeB it accepts and the max item Rank it can craft. An item is craftable at
    a building when (no A filter or item TypeA in A) AND item TypeB in B AND item
    Rank <= rankMax. Restricted to emitted (player-facing) buildings.
    """
    specs: dict[str, tuple[set, set, int]] = {}
    bp_dir = raw / "Blueprint/MapObject/BuildObject"
    if not bp_dir.is_dir():
        return specs
    for f in bp_dir.iterdir():
        if not (f.name.startswith("BP_BuildObject_") and f.suffix == ".json"):
            continue
        bid = f.name[len("BP_BuildObject_") : -len(".json")]
        if bid not in building_ids:
            continue
        try:
            comps = json.loads(f.read_text(encoding="utf-8"))
        except (ValueError, OSError):
            continue
        for c in comps if isinstance(comps, list) else []:
            if "ItemConverterParameter" not in str(c.get("Type", "")):
                continue
            p = c.get("Properties") or {}
            b = set(p.get("TargetTypesB") or [])
            if not b:  # no TypeB filter -> can't tell what it crafts
                continue
            specs[bid] = (set(p.get("TargetTypesA") or []), b, p.get("TargetRankMax", 0) or 0)
            break
    return specs


def _crafted_at(r: dict, specs: dict, bld_rows: dict) -> list[str]:
    """Production buildings that can craft item row ``r``, in the game's
    build-menu order (``SortId``, unique within a TypeA category — all craft
    stations share the Product category, so it orders base tier first)."""
    a, b, rank = r.get("TypeA"), r.get("TypeB"), r.get("Rank", 0) or 0
    ids = [
        bid
        for bid, (sa, sb, mx) in specs.items()
        if (not sa or a in sa) and b in sb and rank <= mx
    ]
    ids.sort(key=lambda bid: ((bld_rows.get(bid) or {}).get("SortId", 0), bid))
    return ids


def _icon_basename(icon_rows: dict, bid: str) -> str | None:
    if not bid or bid == "None":
        return None
    row = icon_rows.get(bid)
    if row is None:
        # case-insensitive fallback (IconName "PickAxe_Default" vs row "Pickaxe_Default")
        lk = bid.lower()
        row = next((v for k, v in icon_rows.items() if k.lower() == lk), None)
    row = row or {}
    for field in ("SoftIcon", "Icon"):
        path = (row.get(field) or {}).get("AssetPathName")
        if path and path != "None":
            return path.split("/")[-1].split(".")[0]
    return None


def _resolve_tokens(text: str, item_names: dict, mapobj_names: dict, ui_names: dict) -> str:
    if not text:
        return ""

    def repl(m: re.Match) -> str:
        tag, tid = m.group(1), m.group(2)
        if tag == "itemName":
            return _ci(item_names, tid) or tid
        if tag == "mapObjectName":
            return _ci(mapobj_names, tid) or tid
        return _ci(ui_names, tid) or tid

    s = _TOKEN_RE.sub(repl, text)
    s = _TAG_RE.sub("", s)
    s = s.replace("\r\n", "\n").replace("\r", "\n")
    lines = [re.sub(r"[ \t]+", " ", ln).strip() for ln in s.split("\n")]
    return "\n".join(lines).strip()


def run_catalog(raw: Path, data_out: Path, res_out: Path) -> dict:
    raw, data_out, res_out = Path(raw), Path(data_out), Path(res_out)

    item_rows = read_rows(raw / "DataTable/Item/DT_ItemDataTable_Common.json")
    item_icon_rows = read_rows(raw / "DataTable/Item/DT_ItemIconDataTable_Common.json")
    recipe_rows = read_rows(raw / "DataTable/Item/DT_ItemRecipeDataTable_Common.json")
    bld_rows = read_rows(raw / "DataTable/MapObject/Building/DT_BuildObjectDataTable_Common.json")
    bld_icon_rows = read_rows(raw / "DataTable/MapObject/Building/DT_BuildObjectIconDataTable_Common.json")
    tech_rows = read_rows(raw / "DataTable/Technology/DT_TechnologyRecipeUnlock_Common.json")
    # research-lab projects: some techs unlock only after a lab research
    # completes (tech RequireResearchId -> lab row -> TextId -> localized name).
    lab_rows = read_rows(raw / "DataTable/Lab/DT_LabResearchDataTable.json")

    # --- localized text (all layered ja base + per-language) -----------------
    item_name_by_lang = _text_by_lang(raw, "DataTable/Text/DT_ItemNameText_Common.json", "ITEM_NAME_")
    item_desc_by_lang = _text_by_lang(raw, "DataTable/Text/DT_ItemDescriptionText_Common.json", "ITEM_DESC_")
    bld_name_by_lang = _text_by_lang(raw, "DataTable/Text/DT_MapObjectNameText_Common.json", "MAPOBJECT_NAME_")
    bld_desc_by_lang = _text_by_lang(raw, "DataTable/Text/DT_BuildObjectDescText_Common.json", "BUILDOBJECT_DESC_")
    tech_name_by_lang = _text_by_lang(raw, "DataTable/Text/DT_TechnologyNameText_Common.json", "")
    tech_desc_by_lang = _text_by_lang(raw, "DataTable/Text/DT_TechnologyDescText_Common.json", "")
    ui_by_lang = _text_by_lang(raw, "DataTable/Text/DT_UI_Common_Text_Common.json", "")
    lab_name_by_lang = _text_by_lang(raw, "DataTable/Text/DT_LabResearchText.json", "")
    # world-map region names: the game-localized labels for blueprint-source
    # areas (Sakurajima / Feybreak / Sunreach / World Tree / the oil rigs).
    wmap_by_lang = _text_by_lang(raw, "DataTable/Text/DT_WorldMap_Common_Text_Common.json", "")
    # category labels: item TypeA -> COMMON_ITEMTYPE_A_<X> (in the UI table),
    # building TypeA -> CATEGORY_TYPE_A_<X> (in the build-object category table).
    item_type_by_lang = _text_by_lang(raw, "DataTable/Text/DT_UI_Common_Text_Common.json", "COMMON_ITEMTYPE_A_")
    bld_type_by_lang = _text_by_lang(raw, "DataTable/Text/DT_BuildObjectCategoryText.json", "CATEGORY_TYPE_A_")
    # build-menu UI subcategory labels (TypeUIDisplay); also names the energy
    # requirement (CATEGORY_TYPE_UI_Electricity).
    bld_ui_type_by_lang = _text_by_lang(raw, "DataTable/Text/DT_BuildObjectCategoryText.json", "CATEGORY_TYPE_UI_")

    tags = _all_tags()

    # Some items point their name/description at a differently-keyed text row via
    # OverrideName / OverrideDescription (e.g. item `GrapplingGun` →
    # `ITEM_NAME_GrapplingGun_1`). Alias those texts under the item id in every
    # language so all downstream lookups (inclusion gate, localized name/desc)
    # resolve by id like every other item.
    def _alias_override(by_lang: dict, field: str, prefix: str) -> None:
        for iid, r in item_rows.items():
            ov = r.get(field)
            if not ov or ov in _NONE:
                continue
            key = ov[len(prefix):] if ov.startswith(prefix) else ov
            for t in tags:
                lang = by_lang.get(t)
                if lang and iid not in lang and key in lang:
                    lang[iid] = lang[key]

    _alias_override(item_name_by_lang, "OverrideName", "ITEM_NAME_")
    _alias_override(item_desc_by_lang, "OverrideDescription", "ITEM_DESC_")

    # Some item ids differ only in casing from their text-table key (e.g. item
    # `FlameThrower` → key `Flamethrower`). Alias the case-insensitive match under
    # the item id so it resolves like every other item. Runs after the override
    # pass so an explicit OverrideName always wins.
    def _alias_ci(by_lang: dict) -> None:
        for t in tags:
            lang = by_lang.get(t)
            if not lang:
                continue
            ci = {k.lower(): k for k in lang}
            for iid in item_rows:
                if iid in lang:
                    continue
                k = ci.get(iid.lower())
                if k:
                    lang[iid] = lang[k]

    _alias_ci(item_name_by_lang)
    _alias_ci(item_desc_by_lang)

    def item_has_name(iid: str) -> bool:
        return any((item_name_by_lang.get(t, {}).get(iid) or "").strip() for t in tags)

    # --- items (inclusion gate: has a localized name) ------------------------
    # Import every named item, including those flagged bLegalInGame=False. That
    # flag marks items that can't legitimately sit in inventory as tradeable
    # goods — a mixed bag of real-but-special items (effigies, main-quest Key
    # Spheres) and dead data (deprecated `_old`/`2` dupes, debug rows). The
    # known-real ones are whitelisted below and emitted as normal items; the
    # rest are stamped `illegal: True` so the frontend drops them from the list.
    item_ids = [iid for iid, r in item_rows.items() if item_has_name(iid)]
    item_id_set = set(item_ids)

    # recipe that crafts each item (row-key == product id in the vast majority;
    # index by Product_Id and keep the first).
    recipe_by_product: dict[str, dict] = {}
    for rid, r in recipe_rows.items():
        pid = r.get("Product_Id")
        if pid and pid not in _NONE and pid not in recipe_by_product:
            recipe_by_product[pid] = r

    # inverse of recipe.unlockItemId: gate item (a blueprint, usually) -> the
    # items whose recipes it unlocks.
    unlocks_craft: dict[str, set] = defaultdict(set)
    for r in recipe_rows.values():
        gate, pid = r.get("UnlockItemID"), r.get("Product_Id")
        if gate not in _NONE and gate in item_id_set and pid in item_id_set:
            unlocks_craft[gate].add(pid)

    # --- cross-reference indices --------------------------------------------
    used_in_items: dict[str, set] = defaultdict(set)
    used_in_buildings: dict[str, set] = defaultdict(set)
    dropped_by: dict[str, set] = defaultdict(set)
    dropped_by_boss: dict[str, set] = defaultdict(set)
    partner_for: dict[str, set] = defaultdict(set)
    item_unlock_tech: dict[str, set] = defaultdict(set)
    bld_unlock_tech: dict[str, set] = defaultdict(set)

    for rid, r in recipe_rows.items():
        prod = r.get("Product_Id")
        if prod not in item_id_set:
            continue
        for m in _materials(r, 5):
            if m["item"] in item_id_set:
                used_in_items[m["item"]].add(prod)

    # buildings
    buildings = []
    for bid, r in bld_rows.items():
        if bid in _EXCLUDE_BUILDINGS:
            continue
        name = any((bld_name_by_lang.get(t, {}) and _ci(bld_name_by_lang[t], bid)) for t in tags)
        if not name:
            continue
        mats = _materials(r, 4)
        for m in mats:
            if m["item"] in item_id_set:
                used_in_buildings[m["item"]].add(bid)
        buildings.append({"id": bid, "row": r, "materials": mats})

    building_id_set = {b["id"] for b in buildings}
    # tech UnlockBuildObjects entries sometimes differ in casing from the
    # building DataTable row key (e.g. tech `Workbench` → building `WorkBench`);
    # index by lowercase so the unlock resolves to the emitted (canonical) id.
    bld_id_ci = {b.lower(): b for b in building_id_set}

    # pal drops / partner unlocks (from the already-emitted pal encyclopedia)
    pals_path = data_out / "pals.json"
    if pals_path.exists():
        pj = json.loads(pals_path.read_text(encoding="utf-8"))
        for p in pj.get("pals", []):
            for d in p.get("drops", []):
                if d.get("item") in item_id_set:
                    dropped_by[d["item"]].add(p["id"])
            for d in p.get("bossDrops", []):
                if d.get("item") in item_id_set:
                    dropped_by_boss[d["item"]].add(p["id"])
            ui = (p.get("partnerSkill") or {}).get("unlockItem")
            if ui in item_id_set:
                partner_for[ui].add(p["id"])
    else:
        print("catalog: WARNING data-palworld/pals.json missing — run encyclopedia first (no droppedBy)")

    # technology
    techs = []
    for tid, r in tech_rows.items():
        unlock_items, seen_i = [], set()
        for recipe_id in r.get("UnlockItemRecipes") or []:
            # recipe ids in UnlockItemRecipes sometimes differ in casing from the
            # recipe table key (e.g. `Bow_triple` → `Bow_Triple`); resolve either.
            prod = (_ci(recipe_rows, recipe_id) or {}).get("Product_Id")
            if prod in item_id_set and prod not in seen_i:
                seen_i.add(prod)
                unlock_items.append(prod)
                item_unlock_tech[prod].add(tid)
        unlock_bld = []
        for b in r.get("UnlockBuildObjects") or []:
            canon = b if b in building_id_set else bld_id_ci.get(b.lower())
            if canon:
                unlock_bld.append(canon)
                bld_unlock_tech[canon].add(tid)
        entry = {
            "id": tid,
            "level": r.get("LevelCap", 1),
            "cost": r.get("Cost", 0),
            "isBoss": bool(r.get("IsBossTechnology")),
            "unlockItems": unlock_items,
            "unlockBuildings": unlock_bld,
        }
        boss = _strip(r.get("RequireDefeatTowerBoss"), _BOSS)
        if boss and boss != "None":
            entry["requireBoss"] = boss
        req = r.get("RequireTechnology")
        if req and req not in _NONE:
            entry["requireTech"] = req
        res = r.get("RequireResearchId")
        if res and res not in _NONE:
            entry["requireResearch"] = res
        # partner-skill techs (SkillUnlock_*) unlock by capturing the pal whose
        # partner skill their unlock item enables — the table carries no explicit
        # field, so derive it from the pal encyclopedia's unlockItem back-refs.
        req_pal = sorted({p for i2 in unlock_items for p in partner_for.get(i2, ())})
        if req_pal:
            entry["requirePal"] = req_pal[0]
        techs.append(entry)
    # Stable sort by level only: `techs` is built in data-table row order, which
    # is the game's tech-tree order, so a stable sort keeps that order within
    # each level (game-accurate and language-independent for the frontend).
    techs.sort(key=lambda t: t["level"])

    # --- assemble item entries ----------------------------------------------
    # crafting stations per item (from building Blueprint converter params)
    craft_specs = _craft_specs(raw, building_id_set)
    # blueprint acquisition channels (chests / fishing / camps / shrines /
    # merchants / arena, see blueprint_sources.py) + the acquisition sets the
    # noSource stamp additionally checks. Both sibling datasets are emitted by
    # earlier stages; without them the stamp would produce false positives, so
    # it is skipped (with a warning) when either is missing.
    bp_sources = collect_sources(raw, data_out, item_rows, item_id_set)
    dungeon_items = dungeon_lottery_items(data_out)
    recycler_items = recycler_output_items(data_out)
    # noSource: blueprint-family items unreachable through ANY channel. Beyond
    # the direct channels (field lotteries / shrines / merchants / raids /
    # arena, pal drops, dungeon lotteries, recycler outputs), schematics can be
    # crafted from 5x the tier below — so obtainability closes transitively
    # over those upgrade recipes: a schematic whose recipe's blueprint
    # materials are all obtainable is obtainable (non-blueprint materials are
    # assumed obtainable; only schematic roots gate the chain).
    no_source_ids: set = set()
    if dungeon_items is None or recycler_items is None:
        print("catalog: WARNING dungeons.json/recycler.json missing — noSource not stamped")
    else:
        bp_ids = [iid for iid in item_ids if iid.startswith("Blueprint_")]
        obtainable = {
            iid for iid in bp_ids
            if iid in bp_sources or iid in dungeon_items or iid in recycler_items
            or iid in dropped_by or iid in dropped_by_boss
        }
        changed = True
        while changed:
            changed = False
            for iid in bp_ids:
                if iid in obtainable:
                    continue
                rc = recipe_by_product.get(iid)
                mats = [m["item"] for m in _materials(rc, 5)] if rc else []
                if mats and all(
                    not m.startswith("Blueprint_") or m in obtainable for m in mats
                ):
                    obtainable.add(iid)
                    changed = True
        no_source_ids = {iid for iid in bp_ids if iid not in obtainable}
    items = []
    for iid in item_ids:
        r = item_rows[iid]
        entry: dict = {
            "id": iid,
            "typeA": _strip(r.get("TypeA"), _ITEM_A),
            "typeB": _strip(r.get("TypeB"), _ITEM_B),
            "sortId": r.get("SortId", 0),
            "rarity": r.get("Rarity", 0),
            "rank": r.get("Rank", 0),
            "weight": round2(r.get("Weight", 0.0)),
            "price": int(r.get("Price", 0)),
            "maxStack": r.get("MaxStackCount", 0),
            "handcraft": bool(r.get("bEnableHandcraft")),
        }
        # bLegalInGame=False → not a normal tradeable inventory item. Effigies
        # (`Relic`, `Relic_NN`) and main-quest Key Spheres (`KeySphere_NN`) are
        # real obtainable collectibles despite the flag — whitelisted. The rest
        # is dead data (deprecated dupes, debug rows), flagged so the item list
        # drops it; omitted for the legal majority.
        whitelisted = iid == "Relic" or iid.startswith(("Relic_", "KeySphere_"))
        if not r.get("bLegalInGame", True) and not whitelisted:
            entry["illegal"] = True
        elem = _strip(r.get("ElementType"), _ELEM)
        if elem and elem != "None":
            entry["element"] = elem
        food = _food(r)
        if food:
            entry["food"] = food
        equip = _equip(r)
        if equip:
            entry["equip"] = equip
        rc = recipe_by_product.get(iid)
        if rc:
            recipe = {"work": round2(rc.get("WorkAmount", 0.0)), "materials": _materials(rc, 5)}
            gate = rc.get("UnlockItemID")
            if gate and gate not in _NONE:
                recipe["unlockItemId"] = gate
            stations = _crafted_at(r, craft_specs, bld_rows)
            if stations:
                recipe["craftedAt"] = stations
            entry["recipe"] = recipe
        if iid in dropped_by or iid in dropped_by_boss:
            # One annotated list; a pal that drops the item in both forms
            # counts as a normal drop (isBoss omitted).
            normal = dropped_by[iid]
            entry["droppedBy"] = [
                {"id": pid} if pid in normal else {"id": pid, "isBoss": True}
                for pid in sorted(normal | dropped_by_boss[iid])
            ]
        if iid in unlocks_craft:
            entry["unlocksCraft"] = sorted(unlocks_craft[iid])
        if iid in bp_sources:
            entry["sources"] = bp_sources[iid]
        if iid in no_source_ids:
            entry["noSource"] = True
        if iid in partner_for:
            entry["partnerFor"] = sorted(partner_for[iid])
        if iid in used_in_items:
            entry["usedInItems"] = sorted(used_in_items[iid])
        if iid in used_in_buildings:
            entry["usedInBuildings"] = sorted(used_in_buildings[iid])
        if iid in item_unlock_tech:
            entry["unlockTech"] = sorted(item_unlock_tech[iid])
        items.append(entry)
    # canonical order: the game's own SortId (unique per item, language-independent),
    # with id as a stable tiebreaker. Frontends reuse this order across all languages.
    items.sort(key=lambda e: (e["sortId"], e["id"]))

    # --- assemble building entries + icons -----------------------------------
    icons_dir = res_out / "icons"
    icons_dir.mkdir(parents=True, exist_ok=True)
    converted = 0

    def convert(src: Path, dest: Path) -> int:
        if dest.exists() or not src.exists():
            return 0
        with Image.open(src) as img:
            img = img.convert("RGBA") if img.mode not in ("RGB", "RGBA") else img
            img.save(dest, "WEBP", quality=90, method=6)
        return 1

    bld_out = []
    png_dirs = [raw / "Texture/BuildObject/PNG", raw / "Texture/BuildObject/Icon"]
    # A few buildings have no icon-table row (or a "None" AssetPathName) and no
    # T_icon_buildObject_<id>.png fallback, so they emit no icon even though a
    # suitable source texture exists elsewhere in the export. Map those explicitly:
    #   * DefenseMachinegun_AutoTurret ("Ancient Turret") — its BP is part of the
    #     DefenseBulletLauncher_Machinegun family, whose build icon the export
    #     wrote with the leading "D" dropped (…_efenseBulletLauncher_Machinegun).
    #   * Decal_PalSticker_PinkCat — stickers carry no build-menu icon; use the
    #     decal art itself.
    icon_overrides = {
        "DefenseMachinegun_AutoTurret": raw
        / "Texture/BuildObject/PNG/T_icon_buildObject_efenseBulletLauncher_Machinegun.png",
        "Decal_PalSticker_PinkCat": raw
        / "Model/Prop/Furniture/Decal_Sticker/T_PalSticker_PinkCat.png",
    }
    for b in buildings:
        bid, r, mats = b["id"], b["row"], b["materials"]
        entry = {
            "id": bid,
            "typeA": _strip(r.get("TypeA"), _BLD_A),
            "typeB": _strip(r.get("TypeB"), _BLD_B),
            "typeUI": _strip(r.get("TypeUIDisplay"), _BLD_UI),
            # build-menu position; unique within a typeA category only.
            # (Rank is deliberately not emitted: it is a constant 1 for every
            # row in the current game data — the "level" shown in the UI is
            # the unlocking tech's level instead.)
            "sortId": r.get("SortId", 0),
            "work": round2(r.get("RequiredBuildWorkAmount", 0.0)),
            "materials": mats,
        }
        energy = _strip(r.get("RequiredEnergyType"), _ENERGY)
        if energy and energy != "None":
            entry["energyType"] = energy
        if bid in bld_unlock_tech:
            entry["unlockTech"] = sorted(bld_unlock_tech[bid])
        # icon
        dest = icons_dir / f"build_{bid}.webp"
        override = icon_overrides.get(bid)
        if override is not None:
            if convert(override, dest):
                converted += 1
        else:
            base = _icon_basename(bld_icon_rows, bid) or f"T_icon_buildObject_{bid}"
            for d in png_dirs:
                if convert(d / f"{base}.png", dest):
                    converted += 1
                    break
        if dest.exists():
            entry["icon"] = f"build_{bid}"
        bld_out.append(entry)

    # item icons: DT_ItemIconDataTable_Common maps an icon key -> a texture under
    # /Game/Others/InventoryItemIcon/Texture. That tree lives in Content/Others,
    # one level above RAW (=Content/Pal). Gated on the PNG existing so it degrades
    # gracefully if the Others tree is absent from a given export.
    #
    # The icon table is keyed by the item row's IconName field, NOT the item id:
    # tier variants and blueprints share a base icon row this way (DecalGun_1..5 ->
    # "DecalGun", Blueprint_Katana_2 -> "Katana"). Resolve IconName first, then fall
    # back to the item id (some rows are keyed by id directly). _icon_basename also
    # matches case-insensitively (IconName "PickAxe_Default" vs row "Pickaxe_Default").
    item_icon_dir = raw.parent / "Others/InventoryItemIcon/Texture"
    item_icons = 0
    for entry in items:
        r = item_rows.get(entry["id"]) or {}
        icon_name = r.get("IconName")
        keys = [icon_name, entry["id"]] if icon_name and icon_name != "None" else [entry["id"]]
        dest = icons_dir / f"item_{entry['id']}.webp"
        for key in keys:
            base = _icon_basename(item_icon_rows, key)
            if not base:
                continue
            if convert(item_icon_dir / f"{base}.png", dest):
                item_icons += 1
                break
            if dest.exists():  # already converted on a prior run
                break
        if dest.exists():
            entry["icon"] = f"item_{entry['id']}"

    # tech-tile icon fallback: a few techs unlock an item/building that is absent
    # from the emitted datasets (no localized name, a missing table row, or a
    # recipe-id casing mismatch), so the frontend cannot derive their tile icon
    # from unlockItems/unlockBuildings. Resolve one directly from the raw unlock
    # chain and stamp `tech.icon` (a ready ``icons/<name>`` basename).
    item_icon_by_id = {e["id"]: e.get("icon") for e in items}
    bld_icon_by_id = {e["id"]: e.get("icon") for e in bld_out}
    item_rows_ci = {k.lower(): k for k in item_rows}

    def _tech_resolves(t: dict) -> bool:
        return any(item_icon_by_id.get(i) for i in t["unlockItems"]) or any(
            bld_icon_by_id.get(b) for b in t["unlockBuildings"]
        )

    def _canon_item(pid: str | None) -> str | None:
        if not pid or pid in _NONE:
            return None
        return pid if pid in item_rows else item_rows_ci.get(pid.lower())

    def _fallback_item_icon(pid: str) -> str | None:
        icon_name = (item_rows.get(pid) or {}).get("IconName")
        dest = icons_dir / f"item_{pid}.webp"
        for key in [icon_name, pid] if icon_name and icon_name != "None" else [pid]:
            base = _icon_basename(item_icon_rows, key)
            if not base:
                continue
            convert(item_icon_dir / f"{base}.png", dest)
            if dest.exists():
                return f"item_{pid}"
        return None

    tech_icons = 0
    for t in techs:
        if _tech_resolves(t):
            continue
        raw_t = tech_rows.get(t["id"], {})
        icon = None
        for rid in raw_t.get("UnlockItemRecipes") or []:
            pid = _canon_item((_ci(recipe_rows, rid) or {}).get("Product_Id")) or _canon_item(rid)
            if pid and (icon := _fallback_item_icon(pid)):
                break
        if not icon:
            for bid in raw_t.get("UnlockBuildObjects") or []:
                if (icons_dir / f"build_{bid}.webp").exists():
                    icon = f"build_{bid}"
                    break
        if icon:
            t["icon"] = icon
            tech_icons += 1
    print(f"catalog: resolved {tech_icons} fallback tech icons")

    # canonical building order: build-menu SortId within each category (it is
    # only unique per typeA), id as a stable tiebreaker — language-independent,
    # mirroring the items' SortId ordering above.
    bld_out.sort(key=lambda e: (e["typeA"], e["sortId"], e["id"]))
    write_json(data_out / "items.json", {"items": items})
    write_json(data_out / "buildings.json", {"buildings": bld_out})
    write_json(data_out / "technology.json", {"techs": techs})

    # --- localized text ------------------------------------------------------
    # JA base tables (tags[0] == JA_TAG): the only source with real strings for
    # rows the game left as per-language placeholders. Used as the last resort.
    ja = tags[0]
    ja_iname, ja_idesc = item_name_by_lang[ja], item_desc_by_lang[ja]
    ja_bname, ja_bdesc = bld_name_by_lang[ja], bld_desc_by_lang[ja]
    ja_tname, ja_tdesc = tech_name_by_lang[ja], tech_desc_by_lang[ja]
    ja_ui, ja_lname = ui_by_lang[ja], lab_name_by_lang[ja]
    ja_itype, ja_btype = item_type_by_lang[ja], bld_type_by_lang[ja]
    ja_wmap = wmap_by_lang[ja]

    # category typeA values actually present in the emitted datasets, in the
    # game's own order: the COMMON_ITEMTYPE_A_* / CATEGORY_TYPE_A_* text-table
    # row order (identical in every language). labels.json preserves this key
    # order, so the frontend derives the canonical category order from it.
    # Types missing from the text table are appended alphabetically.
    def _canon_types(present: set, table: dict) -> list:
        known = [k for k in table if k in present]
        return known + sorted(present - set(known))

    item_types = _canon_types({e["typeA"] for e in items}, ja_itype)
    bld_types = _canon_types({e["typeA"] for e in bld_out}, ja_btype)
    energy_types = sorted({e["energyType"] for e in bld_out if e.get("energyType")})

    # JA base name -> item id, so a variant's placeholder ("アサルトライフル+1")
    # can be re-localized via its base item (AssaultRifle_Default1 -> 突击步枪).
    ja_name_to_id: dict[str, str] = {}
    for iid in item_ids:
        n = _ph(ja_iname.get(iid))
        if n and n not in ja_name_to_id:
            ja_name_to_id[n] = iid

    tech_by_id = {t["id"]: t for t in techs}
    for tag in tags:
        iname, idesc = item_name_by_lang[tag], item_desc_by_lang[tag]
        bname, bdesc = bld_name_by_lang[tag], bld_desc_by_lang[tag]
        tname, tdesc, ui = tech_name_by_lang[tag], tech_desc_by_lang[tag], ui_by_lang[tag]
        lname = lab_name_by_lang[tag]

        items_loc = {}
        for iid in item_ids:
            nm = _item_name(iid, iname, ja_iname, ja_name_to_id)
            e = {"name": _resolve_tokens(nm, iname, bname, ui) or iid}
            d = _ph(idesc.get(iid)) or _ph(ja_idesc.get(iid))
            d = _resolve_tokens(d, iname, bname, ui)
            if d:
                e["description"] = d
            items_loc[iid] = e
        write_json(data_out / "locales" / tag / "items.json", items_loc)

        bld_loc = {}
        for b in bld_out:
            bid = b["id"]
            nm = _ph(_ci(bname, bid)) or _ph(_ci(ja_bname, bid)) or bid
            e = {"name": _resolve_tokens(nm, iname, bname, ui) or bid}
            d = _ph(_ci(bdesc, bid)) or _ph(_ci(ja_bdesc, bid))
            d = _resolve_tokens(d, iname, bname, ui)
            if d:
                e["description"] = d
            bld_loc[bid] = e
        write_json(data_out / "locales" / tag / "buildings.json", bld_loc)

        tech_loc = {}
        for tid, r in tech_rows.items():
            if tid not in tech_by_id:
                continue
            name_key, desc_key = r.get("Name") or "", r.get("Description") or ""
            raw_name = _ph(tname.get(name_key)) or _ph(ja_tname.get(name_key))
            name = _resolve_tokens(raw_name, iname, bname, ui)
            if not name:
                # fall back to the first unlocked entity's name
                t = tech_by_id[tid]
                if t["unlockBuildings"]:
                    bid0 = t["unlockBuildings"][0]
                    name = _ph(_ci(bname, bid0)) or _ph(_ci(ja_bname, bid0)) or bid0
                elif t["unlockItems"]:
                    name = _item_name(t["unlockItems"][0], iname, ja_iname, ja_name_to_id)
                else:
                    name = tid
            e = {"name": name}
            desc = _ph(tdesc.get(desc_key)) or _ph(ja_tdesc.get(desc_key))
            desc = _resolve_tokens(desc, iname, bname, ui)
            if desc:
                e["description"] = desc
            # localized unlock-requirement names: the tower's boss-battle name
            # (BOSS_BATTLE_NAME_<boss>, e.g. "Tower of the Rayne Syndicate") and
            # the lab research project's name (lab row TextId).
            te = tech_by_id[tid]
            boss = te.get("requireBoss")
            if boss:
                bn = _ph(ui.get(f"BOSS_BATTLE_NAME_{boss}")) or _ph(
                    ja_ui.get(f"BOSS_BATTLE_NAME_{boss}")
                )
                if bn:
                    e["requireBossName"] = bn
            rid = te.get("requireResearch")
            if rid:
                text_id = (lab_rows.get(rid) or {}).get("TextId") or ""
                rn = _ph(lname.get(text_id)) or _ph(ja_lname.get(text_id))
                if rn:
                    e["requireResearchName"] = rn
            tech_loc[tid] = e
        write_json(data_out / "locales" / tag / "technology.json", tech_loc)

        itype, btype = item_type_by_lang[tag], bld_type_by_lang[tag]
        butype = bld_ui_type_by_lang[tag]
        wmap = wmap_by_lang[tag]
        labels = {
            "item": {k: _ph(itype.get(k)) or _ph(ja_itype.get(k)) or k for k in item_types},
            "building": {k: _ph(btype.get(k)) or _ph(ja_btype.get(k)) or k for k in bld_types},
            # building energy requirement (EPalEnergyType), named by the
            # build-menu UI-category row (CATEGORY_TYPE_UI_Electricity = 电力).
            "energy": {
                e: _ph(butype.get(_ENERGY_TEXT.get(e, e))) or e for e in energy_types
            },
            # blueprint-source areas with a game-localized world-map name;
            # areas absent here (mainland biomes) are app-side UI strings.
            "area": {
                k: _ph(wmap.get(tid)) or _ph(ja_wmap.get(tid)) or k
                for k, tid in AREA_TEXT_IDS.items()
            },
        }
        write_json(data_out / "locales" / tag / "labels.json", labels)

    print(
        f"catalog: {len(items)} items, {len(bld_out)} buildings, {len(techs)} techs, "
        f"{len(tags)} locales, {converted} building icons, {item_icons} item icons converted"
    )
    return {"items": items, "buildings": bld_out, "techs": techs}


if __name__ == "__main__":
    run_catalog(
        require_dir("PALWORLD_RAW"),
        require_dir("PALWORLD_DATA_OUT"),
        require_dir("PALWORLD_RES_OUT"),
    )
