"""Item acquisition sources, collected for the catalog stage.

Answers "how do I get this item?" for **every** item (not just the
``Blueprint_*`` schematics — the blueprint-only restriction was lifted so
regular items surface their chest / fishing / camp / raid / arena / shrine
channels too). Each channel that references item ids in the raw export is
walked and folded into a compact per-item ``sources`` list that ``catalog.py``
attaches to the emitted item entries:

* ``DT_ItemLotteryDataTable`` + ``DT_FieldLotteryNameDataTable`` — the shared
  field-lottery machinery (same slot math as dungeons.py: independent per-slot
  probability x weight share within the slot). The ``FieldName`` families map
  to distinct game systems, grounded against their consumers in the export:
    - ``<Biome>01/02`` / ``<Island>02`` / ``<Island>_Treasure`` — treasure
      chests. Overworld chest spawners (``BP_PalMapObjectSpawner_Treasure_*``)
      carry these as class defaults; dungeon interiors reference the same
      pools via ``DT_DungeonItemLotteryDataTable`` (the island ``02`` pools
      have no blueprint consumer — bound at runtime — but the family names
      the island unambiguously).
    - ``*_Fishing`` / ``*_FishPond`` — fishing spots
      (``DT_PalFishingSpotLotteryDataTable``).
    - ``Salvage_RankN`` — fishing junk spots (``BP_MapObject_FishingJunkSpot``).
    - ``*_Supply`` — supply drops (``BP_SupplySpawner_*``).
    - ``EnemyCamp_*`` — faction-camp chests (``BP_NPCCamp_*``).
    - ``Oilrig*`` — oil-rig chests (``BP_OilrigTreasureBoxSpawner*``).
    - ``TreasureMapNN`` — treasure-map digs; the field name doubles as the
      map item id (``BP_PalTreasureMapWorldSubsystem``).
    - ``AncientRelicRecycler_*`` — skipped: recycler.json already carries the
      full odds; the frontend inverts it on the item page.
* ``DT_ItemPickupDataTable`` x the already-emitted ``markers/*.json`` — Ancient
  Shrines. Only shrines actually placed on a map count (the pickup table also
  holds unplaced test rows); the join is on the marker's resolved reward item.
* ``DT_ArenaSoloRewardTable`` — PvP arena first/repeat clear rewards per rank.
* ``Blueprint/RaidBoss/DT_PalRaidBoss_Common`` — summoning-altar raid rewards
  (``SuccessItemList`` per summon row; the row's ``InfoList`` names the boss
  pal, ``RAID_``-prefixed with a ``_2`` suffix on the hard-mode rows).

Merchants are collected separately by ``merchants.py`` (which also emits the
``merchants.json`` catalog) and merged into ``sources`` by ``catalog.py`` — the
shop-group scan lives there so the per-merchant pages and the per-item merchant
chips stay consistent.

Pal / boss drops and dungeon lotteries are NOT re-collected here — the item
entries already carry ``droppedBy`` and the dungeons dataset already backs the
"found in dungeons" row. They (plus recycler outputs) do count toward the
``noSource`` stamp computed in ``catalog.py``.
"""

from __future__ import annotations

import json
import re
from collections import defaultdict
from pathlib import Path

from .maps.common import read_rows, round2

_NONE = {None, "None", ""}
_GRADE = "EPalMapObjectTreasureGradeType::Grade"

# Lottery-field family kinds keyed by recognizable prefixes / suffixes; the
# order below is the emitted display order of the kinds. ``merchant`` sits here
# for frontend parity, but merchant entries are produced by ``merchants.py`` and
# merged in by ``catalog.py`` — ``collect_sources`` never emits that kind.
KIND_ORDER = ["chest", "fishing", "salvage", "supply", "camp", "oilrig",
              "treasureMap", "raid", "shrine", "merchant", "arena"]

# Area keys whose display names come from the game's world-map text; emitted
# into labels.json (catalog.py). The remaining keys (mainland biome nouns +
# the romaji proper noun Yakushima) are app-side UI strings.
AREA_TEXT_IDS = {
    "Sakurajima": "REGION_Wide_Sakurajima01",   # Sakurajima
    "DarkIsland": "REGION_Wide_Darkisland01",   # Feybreak
    "SkyIsland": "REGION_Wide_Skyisland01",     # Sunreach
    "WorldTree": "WORLDMAP_NAME_Tree",          # The World Tree
    "Oilrig": "REGION_Oilrig_1",                # Rayne Syndicate Oil Rig
    "OilrigMini": "REGION_Oilrig_2",            # ... Test Drilling Rig
    "OilrigLarge": "REGION_Oilrig_3",           # ... Platform Oil Rig
}

# Field-name base -> canonical area key (bases are what's left after the
# suffix/digit strip in _area_key). Unlisted bases pass through unchanged.
_AREA_ALIAS = {
    "Dessert": "Desert",
    "Skyisland": "SkyIsland",
    "Yamijima": "DarkIsland",
}

_TRAILING_NUM = re.compile(r"_?\d+$")

# The overworld regions a treasure-chest / fishing / supply / faction-camp
# lottery family can name. The blueprint-only pass only ever hit these, but
# regular items also appear in many OTHER lottery families that share the same
# table shape yet model different systems — pal-carry pools
# (``CharacterSpawnItem_*``), expedition rewards (``Expedition_*``), dungeon
# reward pools (``*_Dungeon_*``, already surfaced by the "found in dungeons"
# row), elemental/fruit/junk gathering sub-pools, and dev/test rows. Those are
# out of scope for the region-chest channels, so an area kind whose key isn't
# one of these is dropped (see ``_classify``). Oil-rig keys are gated separately
# (they are their own kind).
KNOWN_AREAS = {
    "Grass", "Forest", "Desert", "Snow", "Volcano",
    "Sakurajima", "DarkIsland", "SkyIsland", "WorldTree", "Yakushima",
}


def _area_key(base: str) -> str:
    """Canonical area key for a lottery-field base: 'DarkIsland02' ->
    'DarkIsland', 'Grass01' -> 'Grass', 'Yamijima_Seabase01' -> 'DarkIsland',
    'DesertGoal' / 'ForestGoal_02' -> 'Desert' / 'Forest' (camp sub-variants
    collapse onto their area)."""
    prev = None
    while base != prev:
        prev = base
        base = _TRAILING_NUM.sub("", base)
        for suffix in ("_Treasure", "_Seabase", "_Goal", "Goal"):
            if base.endswith(suffix):
                base = base[: -len(suffix)]
    return _AREA_ALIAS.get(base, base)


def _region(kind: str, base: str) -> tuple[str, str] | None:
    """(kind, areaKey) for an overworld-region channel, or None when the field
    resolves to a region outside KNOWN_AREAS (a different system — see the
    KNOWN_AREAS note)."""
    area = _area_key(base)
    return (kind, area) if area in KNOWN_AREAS else None


def _classify(field: str) -> tuple[str, str] | None:
    """(kind, areaKey-or-extra) for a lottery FieldName; None -> not a region /
    acquisition channel (relic recycling is reported via recycler.json; pools
    outside KNOWN_AREAS model other systems)."""
    if field.startswith("AncientRelicRecycler"):
        return None
    if m := re.fullmatch(r"Salvage_Rank(\d+)", field):
        return "salvage", m.group(1)
    if re.fullmatch(r"TreasureMap\d+", field):
        return "treasureMap", field
    if field.startswith("EnemyCamp_"):
        return _region("camp", field[len("EnemyCamp_"):])
    if field.startswith("Oilrig_Mini"):
        return "oilrig", "OilrigMini"
    if field.startswith("Oilrig_Large"):
        return "oilrig", "OilrigLarge"
    if field.startswith("Oilrig"):
        return "oilrig", "Oilrig"
    if "_Fishing" in field or "_FishPond" in field:
        base = re.sub(r"_(Fishing|FishPond)$", "", field)
        return _region("fishing", base)
    if field.endswith("_Supply"):
        return _region("supply", field[: -len("_Supply")])
    return _region("chest", field)


def _merge_graded(bucket: dict, key: tuple, grade: int, chance: float) -> None:
    """Fold one lottery row into a (kind, area/extra) bucket: keep the best
    (max) chance and the lowest positive chest grade seen."""
    e = bucket.get(key)
    if e is None:
        bucket[key] = {"grade": grade, "chance": chance}
    else:
        e["chance"] = max(e["chance"], chance)
        if grade and (not e["grade"] or grade < e["grade"]):
            e["grade"] = grade


def collect_sources(raw: Path, data_out: Path, item_rows: dict, item_id_set: set) -> dict[str, list]:
    """{itemId: [source entries]} for every item with at least one acquisition
    channel (merchants excluded — see module docstring). Entry order:
    KIND_ORDER, then area key."""
    raw, data_out = Path(raw), Path(data_out)

    # --- field lotteries -----------------------------------------------------
    field_rows = read_rows(raw / "DataTable/Common/DT_FieldLotteryNameDataTable.json")
    lottery_rows = read_rows(raw / "DataTable/Item/DT_ItemLotteryDataTable.json")

    # weight totals per (field, slot) for the weight-share denominator
    slot_totals: dict[tuple, float] = defaultdict(float)
    for r in lottery_rows.values():
        if r.get("StaticItemId") not in _NONE:
            slot_totals[(r.get("FieldName"), r.get("SlotNo", 0))] += r.get("WeightInSlot", 0.0) or 0.0

    graded: dict[str, dict[tuple, dict]] = defaultdict(dict)  # itemId -> {(kind, extra): {grade, chance}}
    for r in lottery_rows.values():
        iid = r.get("StaticItemId")
        if iid in _NONE or iid not in item_id_set:
            continue
        field = r.get("FieldName")
        cls = _classify(field)
        if not cls:
            continue
        frow = field_rows.get(field)
        if not frow:
            continue
        prob = frow.get(f"ItemSlot{r.get('SlotNo', 0)}_ProbabilityPercent", 0.0) or 0.0
        total = slot_totals[(field, r.get("SlotNo", 0))]
        if prob <= 0 or total <= 0:
            continue
        chance = round2(prob * (r.get("WeightInSlot", 0.0) or 0.0) / total)
        g = (r.get("TreasureBoxGrade") or "").removeprefix(_GRADE)
        grade = int(g) if g.isdigit() else 0
        _merge_graded(graded[iid], cls, grade, chance)

    sources: dict[str, list] = defaultdict(list)
    kind_rank = {k: i for i, k in enumerate(KIND_ORDER)}
    for iid, bucket in graded.items():
        for (kind, extra), e in sorted(bucket.items(), key=lambda kv: (kind_rank[kv[0][0]], kv[0][1])):
            entry: dict = {"kind": kind}
            if kind == "treasureMap":
                entry["item"] = extra
            elif kind == "salvage":
                entry["rank"] = int(extra)
            else:
                entry["area"] = extra
            if e["grade"]:
                entry["grade"] = e["grade"]
            entry["chance"] = e["chance"]
            sources[iid].append(entry)

    # --- ancient shrines (placed markers only) -------------------------------
    shrine_counts: dict[str, int] = defaultdict(int)
    markers_dir = data_out / "markers"
    marker_files = sorted(markers_dir.glob("*.json")) if markers_dir.is_dir() else []
    if marker_files:
        for mf in marker_files:
            for m in json.loads(mf.read_text(encoding="utf-8")).get("markers", []):
                if m.get("subtype") == "ancientShrine":
                    iid = (m.get("reward") or {}).get("item")
                    if iid and iid in item_id_set:
                        shrine_counts[iid] += 1
        for iid, n in shrine_counts.items():
            sources[iid].append({"kind": "shrine", "count": n})
    else:
        print("catalog: WARNING markers/ missing — run maps first (no shrine sources)")

    # --- summoning-altar raid rewards -----------------------------------------
    raid_rows = read_rows(raw / "Blueprint/RaidBoss/DT_PalRaidBoss_Common.json")
    raid_by_item: dict[str, dict[str, dict]] = defaultdict(dict)  # iid -> {pal: {rate,min,max}}
    for row in raid_rows.values():
        pal = (((row.get("InfoList") or [{}])[0].get("PalId")) or {}).get("Key")
        if pal in _NONE:
            continue
        pal = re.sub(r"_\d+$", "", pal.removeprefix("RAID_"))
        for e in row.get("SuccessItemList") or []:
            iid = (e.get("ItemName") or {}).get("Key")
            if iid in _NONE or iid not in item_id_set:
                continue
            rate = e.get("Rate", 0.0) or 0.0
            cur = raid_by_item[iid].get(pal)
            if cur is None or rate > cur["rate"]:
                raid_by_item[iid][pal] = {"rate": rate, "min": e.get("Min", 1) or 1, "max": e.get("Max", 1) or 1}
        # pick-one guaranteed rewards (SuccessAnyOneItemList): you always get one
        # item from this set (e.g. work-suitability tickets). Flagged `anyOne`.
        for e in row.get("SuccessAnyOneItemList") or []:
            iid = (e.get("ItemName") or {}).get("Key")
            if iid in _NONE or iid not in item_id_set:
                continue
            raid_by_item[iid].setdefault(pal, {"rate": 0.0, "min": e.get("Num", 1) or 1, "max": e.get("Num", 1) or 1, "anyOne": True})
    for iid, pals in raid_by_item.items():
        for pal, info in sorted(pals.items()):
            entry = {"kind": "raid", "pal": pal}
            if info.get("anyOne"):
                entry["anyOne"] = True
            else:
                entry["chance"] = round2(info["rate"])
            if info["max"] > 1 or info["min"] > 1:
                entry["min"], entry["max"] = info["min"], info["max"]
            sources[iid].append(entry)

    # --- arena clear rewards ---------------------------------------------------
    arena_rows = read_rows(raw / "DataTable/Arena/DT_ArenaSoloRewardTable.json")
    for rank, row in arena_rows.items():
        for key, repeat in (("FirstClearReward", False), ("RepeatClearReward", True)):
            for e in row.get(key) or []:
                iid = (e.get("ItemName") or {}).get("Key")
                if iid in _NONE or iid not in item_id_set:
                    continue
                entry = {"kind": "arena", "rank": rank}
                if repeat:
                    entry["repeat"] = True
                # reward quantity range (e.g. 20× Giga Spheres at Bronze).
                mn, mx = e.get("Min", 1) or 1, e.get("Max", 1) or 1
                if mn > 1 or mx > 1:
                    entry["min"], entry["max"] = mn, mx
                sources[iid].append(entry)

    # Sections append in code order, not KIND_ORDER (shrine before raid, etc.);
    # a final stable sort restores the intended display order while preserving
    # each section's intra-kind ordering (area/rank).
    for lst in sources.values():
        lst.sort(key=lambda s: kind_rank[s["kind"]])

    return dict(sources)


def dungeon_lottery_items(data_out: Path) -> set | None:
    """Item ids reachable through the emitted dungeon dataset (chest / boss
    lotteries), or None when dungeons.json hasn't been emitted yet."""
    p = Path(data_out) / "dungeons.json"
    if not p.exists():
        return None
    d = json.loads(p.read_text(encoding="utf-8"))
    return {i["item"] for slots in d.get("lotteries", {}).values() for s in slots for i in s["items"]}


def recycler_output_items(data_out: Path) -> set | None:
    """Item ids producible by the relic recycler, or None when recycler.json
    hasn't been emitted yet."""
    p = Path(data_out) / "recycler.json"
    if not p.exists():
        return None
    d = json.loads(p.read_text(encoding="utf-8"))
    return {i["item"] for r in d.get("recipes", []) for s in r.get("slots", []) for i in s["items"]}
