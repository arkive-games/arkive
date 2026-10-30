"""Map features that are not pickups: locks, doors, quests and area exits.

* **Locks.** The in-game map draws three kinds of lock (``UI/Widget/Map.js``, which
  the game ships as plain JavaScript): ``ShaChiWeaponLockObject`` -- terrain only a
  given Phantom Edge can clear; ``SwitchLockObject`` -- a door that needs an item;
  and ``DoorDirLockObject`` -- a door that opens from one side only. The level
  actors behind them are the gameplay blockers, whose ``NeedAbilityContainer``
  names a ``GameplayEvent.BreakBlocker.*`` tag that ``DT_ShaqiWeaponData`` maps to
  a Phantom Edge (``BrokenBlockerTag``), and the doors, whose ``DoorType`` is
  ``Door Latch`` (one-sided) or ``Door Lock`` (``Check Items`` lists the key).
* **Quests.** Every step of a quest (``PBZstory/PBZQuest/*``) may name a target
  point; ``DT_MapTargetPointData`` places those. The quest's class defaults give
  its name and type, which the quest log groups under its own tabs.
* **Area exits.** ``DT_MapTargetPointData``'s ``Portal`` points, named by the area
  they lead to.
"""

from __future__ import annotations

import math
from pathlib import Path

from ..common import read_json
from .placements import Placement

LATCH, LOCK = "E_DoorType::NewEnumerator1", "E_DoorType::NewEnumerator2"
# Door actors that are not doors a player unlocks: boss fog walls, breakables,
# scripted set pieces.
NOT_LOCKS = ("FogDoor", "MagicDoor", "ChaoSpawner", "ChaosMaster", "MaskSafeDoor", "SlenderDoor")

QUEST_DIR = Path("ProjectPBZ/Content/PBZstory/PBZQuest")
QUEST_KINDS = {
    None: "storyQuest",  # the main chapters carry no QuestType
    "EPBZQuestType::Puzzle": "mysteryQuest",
    "EPBZQuestType::News": "taleQuest",
    "EPBZQuestType::Collection": "collectionQuest",
}


def blocker_weapons(shaqi_rows: dict) -> dict[str, dict]:
    """``{BreakBlocker tag: Phantom Edge row}``; the first edge wins a shared tag."""
    out: dict[str, dict] = {}
    for row in shaqi_rows.values():
        tag = (row.get("BrokenBlockerTag") or {}).get("TagName")
        if tag and tag != "None":
            out.setdefault(tag, row)
    return out


def lock_placements(placements: dict[str, list[dict]], defaults: dict[str, dict],
                    shaqi_rows: dict, items: dict[str, dict]) -> list[Placement]:
    weapons = blocker_weapons(shaqi_rows)
    out = []
    for level, recs in placements.items():
        for rec in recs:
            if "cls" not in rec or any(word in rec["type"] for word in NOT_LOCKS):
                continue
            props = {**defaults.get(rec.get("cls") or "", {}), **rec["props"]}
            seed = f"{rec['actor']}|lock"
            tags = props.get("NeedAbilityContainer") or []
            if tags:
                row = next((weapons[t] for t in tags if t in weapons), None)
                if row is None:
                    continue
                icon = (row.get("WeaponMapIcon") or {}).get("AssetPathName", "").rsplit(".", 1)[-1] or None
                weapon = row["WeaponName"]["Key"]
                out.append(Placement("phantomEdgeLock", tuple(rec["loc"]), level, seed, name_key=weapon,
                                     contents=[(weapon, 1)], icon=icon, desc_template="UI_Map_41"))
            elif props.get("DoorType") == LATCH:
                out.append(Placement("latchedDoor", tuple(rec["loc"]), level, seed, name_key="UI_Map_15"))
            elif props.get("DoorType") == LOCK:
                # The marker is the door; what opens it -- a key, or nothing the
                # player carries when a lever or the story does -- is its description.
                needed = [items.get(c["Key"]) for c in props.get("Check Items") or []]
                keys = [(i["ItemName"]["Key"], 1) for i in needed if i and i["ItemName"]["Key"]]
                out.append(Placement("lockedDoor", tuple(rec["loc"]), level, seed, name_key="LockedDoor",
                                     contents=keys, desc_template="UI_Map_40" if keys else None))
    return out


def target_points(raw: Path) -> dict[str, tuple[str, dict]]:
    """``{TargetId: (area, point)}`` from ``DT_MapTargetPointData``."""
    table = read_json(Path(raw) / "ProjectPBZ/Content/PBZContent/Maps/DT_MapTargetPointData.json")
    out = {}
    for area in table[0]["Properties"]["MapTargetPointData"]:
        for point in area["Value"]["TargetPointData"]:
            if point["TargetId"] != "None":
                out.setdefault(point["TargetId"], (area["Key"], point))
    return out


def quest_steps(exports: list[dict]) -> list[tuple[str, dict]]:
    """``[(target point id, its branch's properties)]`` in the quest's order. A branch
    may name its target itself (``BranchTargetPointID``) or leave it to its tasks
    (``TargetPointID``) -- every collection quest does the latter, one task per find."""
    branches = {x["Name"]: x.get("Properties") or {} for x in exports if x.get("Type") == "PBZQuestBranch"}
    out = []
    for x in exports:
        props = x.get("Properties") or {}
        if x.get("Type") == "PBZQuestBranch":
            target, branch = props.get("BranchTargetPointID"), props
        else:
            outer = (x.get("Outer") or {}).get("ObjectName", "") if isinstance(x.get("Outer"), dict) else ""
            target = props.get("TargetPointID")
            branch = branches.get(outer.rstrip("'").rsplit(".", 1)[-1], {})
        if target and target != "None":
            out.append((target, branch))
    return out


def quest_placements(raw: Path, area_levels: dict[str, str]) -> list[Placement]:
    """One marker per quest step that names a target point, in the quest's order."""
    points = target_points(raw)
    out, seen = [], set()
    for path in sorted((Path(raw) / QUEST_DIR).glob("*/*.json")):
        if path.parent.name == "Tutorial":
            continue
        exports = read_json(path)
        cdo = next((x for x in exports if x.get("Name", "").startswith("Default__")), None)
        props = (cdo or {}).get("Properties") or {}
        kind = QUEST_KINDS.get(props.get("QuestType"))
        name_key = (props.get("FlowLocTextQuestName") or {}).get("Key")
        if kind is None or not name_key:
            continue
        for target, bp in quest_steps(exports):
            if target not in points or (path.stem, target) in seen:
                continue
            seen.add((path.stem, target))
            area, point = points[target]
            loc = point["Location"]
            objective = (bp.get("FlowLocTarget") or {}).get("Key")
            out.append(Placement(kind, (loc["X"], loc["Y"], loc["Z"]), area_levels.get(area, ""),
                                 f"{path.stem}|{target}", name_key=name_key,
                                 contents=[(objective, 1)] if objective else []))
    return out


def portal_placements(raw: Path, area_levels: dict[str, str], area_names: dict[str, str]) -> list[Placement]:
    """``area_names``: ``{area id, lower-cased: its MapName key}``."""
    out = []
    for target, (area, point) in target_points(raw).items():
        if point["TargetPointType"] != "ETargetPointType::Portal":
            continue
        destination = area_names.get(point["TargetMapID"].lower())
        if area == "Test" or destination is None:
            continue
        loc = point["Location"]
        out.append(Placement("areaExit", (loc["X"], loc["Y"], loc["Z"]), area_levels.get(area, ""),
                             f"{area}|{target}", name_key=destination, name_template="UI_Map_30"))
    return out


# Spellings a blueprint adds to an NPC's name for a costume or story stage; the
# dialogue keys use the bare name.
NPC_VARIANTS = {"WhiteFlower", "Old", "Mask", "NoBowl", "YiZhan", "DDSD", "HuanXiang", "Lantern"}
NPC_MIN_SHARE = 0.6
NPC_MERGE_DISTANCE = 1500.0


def npc_speakers(loc_rows: dict) -> dict[str, str]:
    """``{dialogue key: speaker key}`` for every voiced line (``Dlg_*``) in
    ``DT_LocTable`` with a speaker who is not the player."""
    return {r["Key"]: r["Speaker"] for r in loc_rows.values()
            if r.get("Speaker") and r["Key"].startswith("Dlg_") and not r["Speaker"].startswith("Character_Main_1")}


def npc_name_key(blueprint: str, speakers: dict[str, str]) -> str | None:
    """The ``Character_*`` key an NPC blueprint speaks as, or ``None`` when unsure.

    Dialogue keys spell the speaker's name in pinyin (``Dlg_…_LaoGenTou_1``), the
    blueprint likewise (``BP_NPC_LaoGenTou``). Costume and numbering suffixes are
    dropped; anything else must match whole, so ``LuJieYuan_Wife`` does not fall
    back to her husband. The winning speaker must voice most of the matching lines.
    """
    name = blueprint.removeprefix("BP_NPC_").removesuffix("_C")
    if name.startswith("Ending_"):  # the epilogue tableau, not a place in the world
        return None
    tokens = [t for t in name.split("_") if t not in NPC_VARIANTS and not t.isdigit()]
    if not tokens:
        return None
    needle = "_" + "_".join(tokens) + "_"
    counts: dict[str, int] = {}
    for key, speaker in speakers.items():
        if needle in key:
            counts[speaker] = counts.get(speaker, 0) + 1
    if not counts:
        return None
    best, n = max(counts.items(), key=lambda kv: kv[1])
    return best if n / sum(counts.values()) >= NPC_MIN_SHARE else None


def shop_owners(shop_item_rows: dict) -> set[str]:
    """The pinyin names of the NPCs who keep a shop, lower-cased. ``DT_ShopItemTable``
    names each ware after its seller and area (``Huolang_Xigu_g``,
    ``FJZL_XiaoZhang_Weapon_Material_01``); the seller is the token an NPC blueprint
    is named for."""
    return {t.lower() for r in shop_item_rows.values() for t in str(r.get("ShopItemID", "")).split("_")
            if len(t) > 2 and not t.isupper()}


def npc_placements(placements: dict[str, list[dict]], loc_rows: dict,
                   text_keys: dict[str, str] | None = None,
                   merchants: set[str] | None = None,
                   flow_speakers: dict[str, str] | None = None) -> list[Placement]:
    """``text_keys``: ``{zh-Hans text: key}`` for the names an instance spells out in
    ``NPCDesc``, which is plain text; one the game also has as a string is named by
    that string's key, so it reads in every language. ``merchants``: ``shop_owners``.
    ``flow_speakers``: ``{flow graph: name key}`` (``scan.run_speakers``), for an NPC
    whose blueprint name does not match its dialogue keys."""
    speakers = npc_speakers(loc_rows)
    cache: dict[str, str | None] = {}
    out: list[Placement] = []
    for level, recs in placements.items():
        # The spawner's flow component is its own record, under the same actor name.
        flow_of = {r["actor"]: r["flow"] for r in recs if "flow" in r}
        for rec in recs:
            props = rec.get("props") or {}
            cls = props.get("NPCClass")
            if rec["type"] != "BP_NPCSpawner_C" or not isinstance(cls, str):
                continue
            blueprint = cls.rsplit(".", 1)[-1]
            if blueprint not in cache:
                cache[blueprint] = npc_name_key(blueprint, speakers)
            # The instance's own label is the more specific: one thief blueprint
            # is staged as the camp's lookout, its leader and its wounded.
            desc = props.get("NPCDesc") if isinstance(props.get("NPCDesc"), str) else ""
            desc = desc.strip()
            key = (text_keys or {}).get(desc) if desc else None
            text = desc if desc and key is None else None
            if key is None and text is None:
                key = cache[blueprint] or (flow_speakers or {}).get(flow_of.get(rec["actor"], ""))
            if key is None and text is None:
                continue
            world = tuple(rec["loc"])
            if any((p.name_key, p.name_text) == (key, text) and math.dist(world, p.world) < NPC_MERGE_DISTANCE
                   for p in out):
                continue  # the same person staged again for a later scene
            name = blueprint.removeprefix("BP_NPC_").split("_", 1)[0].lower()
            kind = "merchant" if name in (merchants or set()) else "npc"
            out.append(Placement(kind, world, level, f"{rec['actor']}|npc", name_key=key, name_text=text))
    return out
