"""Dungeons stage: emit the per-dungeon loot dataset + localized dungeon names.

Everything hangs off a dungeon ``SpawnAreaId`` (``Grass001`` … ``Skyland001``,
one per random-dungeon type; the map's portal markers carry the same ids — see
``maps/extract.py``). Sources, all under ``DataTable``:

* ``Dungeon/DT_DungeonLevelDataTable`` — the playable areas + ``BonusExpRate``
  (difficulty proxy). Debug areas are skipped.
* ``Dungeon/DT_DungeonItemLotteryDataTable`` — interior item spawners per area:
  ``Normal`` (regular chests) and ``Special`` (the guaranteed technology-book
  chest), each pointing at a field-lottery name.
* ``Dungeon/DT_DungeonRewardSpawnerLotteryDataTable`` — boss-room reward pools
  per area and tier (Easy01/Medium01/Hard01/Hard03): weighted spawner
  blueprints (treasure chests, pal eggs, skill fruits, stat lotuses, junk
  piles, caged pals, mimic pal spawners…). Each blueprint is resolved to its
  content: map-object spawners carry ``FieldLotteryName`` (an item lottery),
  egg spawners a weighted ``SpawnPalEggLotteryDataArray`` pal pool, lotus
  spawners weighted ``MultiLotteryParameters`` map objects, pal spawners a
  ``SpawnGroupList`` sheet.
* ``Common/DT_FieldLotteryNameDataTable`` + ``Item/DT_ItemLotteryDataTable`` —
  the shared lottery machinery (same as Pal Ranch farming): up to 15 slots
  rolled independently at ``ItemSlotN_ProbabilityPercent``; within a slot the
  item is weight-drawn (``WeightInSlot``) with a count range and a
  ``TreasureBoxGrade`` (1–6, the chest tier the item appears in).
* ``Character/DT_CapturedCagePal`` — the caged-pal pool per cage lottery name.
* ``Dungeon/DT_DungeonEnemySpawnDataTable`` — Normal/Boss spawner sheets per
  area, resolved to pal + level ranges.

Outputs:
  data-palworld/dungeons.json                  {dungeons, lotteries, eggPools, cagePools}
  data-palworld/locales/<tag>/dungeons.json    {areaId: {name}}

Lotteries / egg pools / cage pools are emitted once and referenced by name
(several areas share them, e.g. ``Forest01`` backs both Forest dungeons).

Run: ``uv run python -m palworld.dungeons`` (from the ``tools`` dir).
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from .encyclopedia import _text_by_lang, _all_tags
from .env import require_dir
from .maps.common import read_rows, round2, write_json

_NONE = {None, "None", ""}
_GRADE = "EPalMapObjectTreasureGradeType::Grade"
_SPAWNER_TYPE = "EPalDungeonRewardSpawnerType::"
_ITEM_SPAWNER_TYPE = "EPalDungeonItemSpawnerType::"
# Playable-area filter: the level table also carries the debug area.
_SKIP_AREAS = {"TestDebug01"}
# Reward tiers in ascending-difficulty display order.
_TIER_ORDER = ["Easy01", "Medium01", "Hard01", "Hard02", "Hard03"]

# Boss-reward blueprint stems → entry kind. Junk piles are long-hold scrap
# chests with their own item lottery, so they render as chests too.
_EGG_STEM = re.compile(r"^bp_palmapobjectspawner_palegg_(\w+?)_grade_(\d+)$", re.I)
_BOSS_PREFIX = re.compile(r"^BOSS_", re.I)


def _bp_path(raw: Path, asset_path: str) -> Path | None:
    """Blueprint export json for a ``/Game/Pal/...`` soft-class asset path."""
    if not asset_path or asset_path == "None":
        return None
    p = raw / (asset_path.split(".")[0].replace("/Game/Pal/", "") + ".json")
    return p if p.exists() else None


def _bp_props(path: Path) -> dict:
    """Merged ``Properties`` of the blueprint's default object (CDO)."""
    out: dict = {}
    for obj in json.loads(path.read_text(encoding="utf-8")):
        name = obj.get("Name") or ""
        if name.startswith("Default__") and obj.get("Properties"):
            out.update(obj["Properties"])
    return out


def _lottery_slots(field_rows: dict, by_field: dict, name: str) -> list | None:
    """``[{prob, items: [{item, weight, min, max, grade}]}]`` for one
    field-lottery name; None when the name has no slot rows."""
    frow = field_rows.get(name)
    rows = by_field.get(name)
    if not frow or not rows:
        return None
    by_slot: dict[int, list] = {}
    for r in rows:
        by_slot.setdefault(r.get("SlotNo", 0), []).append(r)
    slots = []
    for slot_no in sorted(by_slot):
        prob = round2(frow.get(f"ItemSlot{slot_no}_ProbabilityPercent", 0.0))
        if prob <= 0:
            continue
        items = [
            {
                "item": r["StaticItemId"],
                "weight": round2(r.get("WeightInSlot", 0.0)),
                "min": r.get("MinNum", 0),
                "max": r.get("MaxNum", 0),
                "grade": int(g) if (g := (r.get("TreasureBoxGrade") or "").removeprefix(_GRADE)).isdigit() else 0,
            }
            for r in by_slot[slot_no]
            if r.get("StaticItemId") not in _NONE
        ]
        items.sort(key=lambda i: (-i["weight"], i["item"]))
        if items:
            slots.append({"prob": prob, "items": items})
    return slots or None


def _sheet_pals(props: dict) -> list:
    """Weighted pal list of a spawner-sheet blueprint (``SpawnGroupList``),
    deduped by pal id with merged level ranges."""
    merged: dict[str, dict] = {}
    for group in props.get("SpawnGroupList") or []:
        for p in group.get("PalList") or []:
            pid = (p.get("PalId") or {}).get("Key")
            if pid in _NONE:
                continue
            pid = _BOSS_PREFIX.sub("", pid)
            lv_min, lv_max = p.get("Level", 1), p.get("Level_Max", 1)
            e = merged.get(pid)
            if e:
                e["lvMin"], e["lvMax"] = min(e["lvMin"], lv_min), max(e["lvMax"], lv_max)
            else:
                merged[pid] = {"pal": pid, "lvMin": lv_min, "lvMax": lv_max}
    return sorted(merged.values(), key=lambda e: (e["lvMin"], e["pal"]))


def _reward_entry(raw: Path, row: dict) -> tuple[dict | None, dict]:
    """One boss-reward pool entry from a reward-spawner row. Returns
    ``(entry, shared)`` where ``shared`` carries any egg pool the entry
    references (``{poolId: [{pal, weight}]}``); the entry itself references
    lotteries / pools by name only."""
    weight = round2(row.get("Weight", 0.0))
    kind = (row.get("SpawnerContentType") or "").split("::")[-1]
    value = row.get("LotteryValue")
    if weight <= 0 or value in _NONE:
        return None, {}

    if kind == "Cage":
        return {"kind": "cage", "weight": weight, "cagePool": value}, {}

    if kind == "PalSpawner":
        path = _bp_path(raw, (row.get("LotteryValueBlueprintSoftClass") or {}).get("AssetPathName"))
        pals = _sheet_pals(_bp_props(path)) if path else []
        if not pals:
            return None, {}
        return {"kind": "pal", "weight": weight, "pals": pals}, {}

    # MapObjectSpawner: classify by the blueprint's own content.
    path = _bp_path(raw, (row.get("LotteryValueBlueprintSoftClass") or {}).get("AssetPathName"))
    if not path:
        return None, {}
    props = _bp_props(path)
    stem = path.stem

    m = _EGG_STEM.match(stem)
    if m and props.get("SpawnPalEggLotteryDataArray"):
        pool_id = f"{m.group(1).lower()}_{int(m.group(2)):02d}"
        # The raw arrays list BOSS_ (alpha) variants and the plain pal as
        # separate weighted entries, plus the odd duplicate row. The catalog
        # has no BOSS_ ids (same Paldeck entry), so merge onto the base pal.
        weights: dict[str, float] = {}
        for e in props["SpawnPalEggLotteryDataArray"]:
            pid = ((e.get("PalEggData") or {}).get("PalMonsterId") or {}).get("Key")
            if pid in _NONE:
                continue
            pid = _BOSS_PREFIX.sub("", pid)
            weights[pid] = weights.get(pid, 0.0) + e.get("Weight", 0.0)
        pool = [{"pal": pid, "weight": round2(w)} for pid, w in weights.items()]
        pool.sort(key=lambda e: (-e["weight"], e["pal"]))
        return {"kind": "egg", "weight": weight, "eggPool": pool_id}, {pool_id: pool}

    if props.get("MultiLotteryParameters"):
        objects = [
            {"object": oid, "weight": round2(e.get("Weight", 0.0))}
            for e in props["MultiLotteryParameters"]
            if (oid := (e.get("SpawnMapObjectId") or {}).get("Key")) not in _NONE
        ]
        if objects:
            return {"kind": "lotus", "weight": weight, "objects": objects}, {}

    lottery = (props.get("FieldLotteryName") or {}).get("Key")
    if lottery not in _NONE:
        entry = {"kind": "skillFruit" if "SkillFruits" in stem else "chest",
                 "weight": weight, "lottery": lottery}
        obj = (props.get("SpawnMapObjectId") or {}).get("Key")
        if obj not in _NONE:
            entry["object"] = obj
        return entry, {}

    # Fixed pickups with no lottery (mushrooms): label by map-object name key.
    pickup = {"CaveMushroom": "PickupItem_CaveMushroom", "Mushroom": "PickupItem_Mushroom"}.get(
        stem.removeprefix("BP_PalMapObjectSpawner_")
    )
    if pickup:
        return {"kind": "pickup", "weight": weight, "object": pickup}, {}
    print(f"dungeons: unresolved reward spawner {stem} (emitting as object)")
    return {"kind": "object", "weight": weight, "object": stem.removeprefix("BP_PalMapObjectSpawner_")}, {}


def run_dungeons(raw: Path, data_out: Path) -> dict:
    raw, data_out = Path(raw), Path(data_out)

    level_rows = read_rows(raw / "DataTable/Dungeon/DT_DungeonLevelDataTable.json")
    area_rows = read_rows(raw / "DataTable/Dungeon/DT_DungeonSpawnAreaDataTable.json")
    item_spawner_rows = read_rows(raw / "DataTable/Dungeon/DT_DungeonItemLotteryDataTable.json")
    reward_rows = read_rows(raw / "DataTable/Dungeon/DT_DungeonRewardSpawnerLotteryDataTable.json")
    enemy_rows = read_rows(raw / "DataTable/Dungeon/DT_DungeonEnemySpawnDataTable.json")
    field_rows = read_rows(raw / "DataTable/Common/DT_FieldLotteryNameDataTable.json")
    cage_rows = read_rows(raw / "DataTable/Character/DT_CapturedCagePal.json")

    by_field: dict[str, list] = {}
    for r in read_rows(raw / "DataTable/Item/DT_ItemLotteryDataTable.json").values():
        by_field.setdefault(r.get("FieldName"), []).append(r)

    areas = sorted(
        {r["SpawnAreaId"] for r in level_rows.values() if r["SpawnAreaId"] not in _SKIP_AREAS}
    )
    exp_by_area = {
        r["SpawnAreaId"]: round2(r.get("BonusExpRate", 1.0)) for r in level_rows.values()
    }

    chest_by_area: dict[str, dict] = {}
    for r in item_spawner_rows.values():
        t = (r.get("Type") or "").removeprefix(_ITEM_SPAWNER_TYPE).lower()
        if t in ("normal", "special"):
            chest_by_area.setdefault(r["SpawnAreaId"], {})[t] = r["ItemFieldLotteryName"]

    used_lotteries: set[str] = set()
    egg_pools: dict[str, list] = {}
    used_cages: set[str] = set()

    rewards_by_area: dict[str, dict[str, list]] = {}
    for r in reward_rows.values():
        area = r.get("SpawnAreaId")
        if area not in exp_by_area or area in _SKIP_AREAS:
            continue
        entry, shared = _reward_entry(raw, r)
        if not entry:
            continue
        egg_pools.update(shared)
        if entry.get("lottery"):
            used_lotteries.add(entry["lottery"])
        if entry.get("cagePool"):
            used_cages.add(entry["cagePool"])
        tier = (r.get("RewardSpawnerType") or "").removeprefix(_SPAWNER_TYPE)
        rewards_by_area.setdefault(area, {}).setdefault(tier, []).append(entry)

    enemies_by_area: dict[str, dict[str, list]] = {}
    for r in enemy_rows.values():
        area = r.get("SpawnAreaId")
        if area not in exp_by_area:
            continue
        rank = (r.get("RankType") or "").split("::")[-1].lower()
        path = _bp_path(raw, (r.get("SpawnerBlueprintSoftClass") or {}).get("AssetPathName"))
        pals = _sheet_pals(_bp_props(path)) if path else []
        if not pals:
            continue
        bucket = enemies_by_area.setdefault(area, {}).setdefault(rank, [])
        for p in pals:
            e = next((x for x in bucket if x["pal"] == p["pal"]), None)
            if e:
                e["lvMin"], e["lvMax"] = min(e["lvMin"], p["lvMin"]), max(e["lvMax"], p["lvMax"])
            else:
                bucket.append(dict(p))
    for ranks in enemies_by_area.values():
        for lst in ranks.values():
            lst.sort(key=lambda e: (e["lvMin"], e["pal"]))

    dungeons = []
    for area in areas:
        chests = chest_by_area.get(area) or {}
        used_lotteries.update(v for v in chests.values() if v)
        tiers = rewards_by_area.get(area) or {}
        d = {
            "id": area,
            "bonusExpRate": exp_by_area[area],
            **({"chests": chests} if chests else {}),
            "bossRewards": [
                {"tier": t, "entries": tiers[t]}
                for t in sorted(tiers, key=lambda t: (_TIER_ORDER.index(t) if t in _TIER_ORDER else 99, t))
            ],
        }
        enemies = enemies_by_area.get(area)
        if enemies:
            d["enemies"] = {k: enemies[k] for k in ("normal", "boss") if k in enemies}
        dungeons.append(d)

    lotteries = {}
    for name in sorted(used_lotteries):
        slots = _lottery_slots(field_rows, by_field, name)
        if slots:
            lotteries[name] = slots
        else:
            print(f"dungeons: lottery {name} referenced but empty")

    # Merged per pal (the table has the odd duplicate row): weights summed,
    # level ranges widened.
    cage_pools: dict[str, list] = {}
    for r in cage_rows.values():
        fn = r.get("FieldName")
        if fn not in used_cages or r.get("PalId") in _NONE:
            continue
        pid = _BOSS_PREFIX.sub("", r["PalId"])
        pool = cage_pools.setdefault(fn, [])
        e = next((x for x in pool if x["pal"] == pid), None)
        if e:
            e["weight"] = round2(e["weight"] + r.get("Weight", 0.0))
            e["lvMin"] = min(e["lvMin"], r.get("MinLevel", 1))
            e["lvMax"] = max(e["lvMax"], r.get("MaxLevel", 1))
        else:
            pool.append({
                "pal": pid,
                "weight": round2(r.get("Weight", 0.0)),
                "lvMin": r.get("MinLevel", 1),
                "lvMax": r.get("MaxLevel", 1),
            })
    for lst in cage_pools.values():
        lst.sort(key=lambda e: (-e["weight"], e["pal"]))

    out = {
        "dungeons": dungeons,
        "lotteries": lotteries,
        "eggPools": {k: egg_pools[k] for k in sorted(egg_pools)},
        "cagePools": {k: cage_pools[k] for k in sorted(cage_pools)},
    }
    write_json(data_out / "dungeons.json", out)

    # ---- Localized dungeon names (DT_DungeonNameText via the area table) ----
    name_by_lang = _text_by_lang(raw, "DataTable/Text/DT_DungeonNameText.json", "")
    name_id = {a: (area_rows.get(a) or {}).get("DungeonNameTextId") for a in areas}
    for tag in _all_tags():
        tbl = name_by_lang[tag]
        loc = {
            a: {"name": tbl.get(name_id[a] or "", "") or tbl.get(name_id[a] or "", "")}
            for a in areas
        }
        # Fall back to en-US, then the area id, so no language ships blanks.
        en = name_by_lang["en-US"]
        for a in areas:
            if not loc[a]["name"]:
                loc[a]["name"] = en.get(name_id[a] or "", "") or a
        write_json(data_out / "locales" / tag / "dungeons.json", loc)

    n_entries = sum(len(t["entries"]) for d in dungeons for t in d["bossRewards"])
    print(
        f"dungeons: {len(dungeons)} dungeons, {len(lotteries)} lotteries, "
        f"{len(egg_pools)} egg pools, {len(cage_pools)} cage pools, {n_entries} reward entries"
    )
    return out


if __name__ == "__main__":
    run_dungeons(require_dir("PALWORLD_RAW"), require_dir("PALWORLD_DATA_OUT"))
