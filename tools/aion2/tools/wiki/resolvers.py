"""Objective -> map POI resolvers. Pure functions; caller supplies spawn indexes."""
from __future__ import annotations

MAX_POIS = 12
NPC_GOALS = {"AskNpc", "KillNpc", "CloseNpc"}
ENV_GOALS = {"UseEnvObj", "CollectItem"}
NONSPATIAL = {
    "PCLevel",
    "ClearQuest",
    "ClearQuestType",
    "ClearQuestExplorationType",
    "CloseNote",
    "CollectFakeItem",
    "UseFakeItem",
    "KillPC",
    "KillPCAbyssGrade",
    "CompleteCelviceTalk",
    "ClearMapEvent",
    "EnterVolumePC",
    "EngraveTeleportArtifact",
}


def build_spawn_index(spawn_info_list, npcs, transform) -> dict[str, list[dict]]:
    """Index target name -> [{x,y}], by spawner Name and by NPC string name."""
    idx: dict[str, list[dict]] = {}

    def add(key: str | None, pts: list[dict]) -> None:
        if key:
            idx.setdefault(key, []).extend(pts)

    for s in spawn_info_list or []:
        pts = []
        for p in s.get("Positions") or []:
            loc = p.get("Location") or {}
            if "X" in loc and "Y" in loc:
                x, y = transform.world_to_pixel(loc["X"], loc["Y"])
                pts.append({"x": round(x, 1), "y": round(y, 1)})
        if not pts:
            continue

        add(s.get("Name"), pts)
        for nid in s.get("NpcIdList") or []:
            v = nid.get("Value") if isinstance(nid, dict) else nid
            npc = npcs["by_id"].get(v)
            if npc and npc.get("name") and npc["name"] != s.get("Name"):
                add(npc["name"], pts)
    return idx


def resolve_goal(goal: dict, map_name: str | None, spawn_index: dict) -> dict:
    """Return {resolved: True|False|None, pois: [...]}; None means no point POI."""
    gtype = goal["type"]
    if gtype in NONSPATIAL or gtype == "EnterSubZone":
        return {"resolved": None, "pois": []}
    if gtype in NPC_GOALS or gtype in ENV_GOALS:
        target = goal["values"][0] if goal["values"] else None
        per_map = spawn_index.get(map_name or "", {})
        pois = per_map.get(target, []) if target else []
        return {"resolved": bool(pois), "pois": pois[:MAX_POIS]}
    return {"resolved": None, "pois": []}
