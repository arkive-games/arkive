"""Pure parsers: UE columnar table rows -> plain dict records. No IO here."""
from __future__ import annotations


def val(x):
    """Unwrap UE ``{"Value": v}`` scalars; normalize empty sentinels to None."""
    if isinstance(x, dict) and "Value" in x:
        x = x["Value"]
    if x in (None, "None", ""):
        return None
    return x


def enum(x):
    """Convert ``EQuestType::Hero`` to ``Hero``."""
    if not x or x == "None":
        return None
    return str(x).split("::")[-1]


def l10n_key(x):
    """Unwrap ``{"Key": "STR_..."}`` localization-key fields."""
    if isinstance(x, dict):
        key = x.get("Key")
        return None if key in (None, "None", "") else key
    return None if x in (None, "None", "") else x


def parse_quests(rows: list[dict]) -> list[dict]:
    out = []
    for r in rows:
        out.append(
            {
                "id": val(r["ID"]),
                "name": r.get("Name"),
                "type": enum(r.get("Type")),
                "race": enum(r.get("Race")),
                "part": val(r.get("Part")),
                "grade": enum(r.get("Grade")),
                "unlockLevel": val(r.get("UnlockLevel")) or 0,
                "recommendedLevel": val(r.get("RecommendedLevel")) or 0,
                "textKey": r.get("QuestText"),
                "acquireMapId": val(r.get("AcquireMapId")),
                "acquireBeforeNpcTalk": val(r.get("AcquireBeforeNpcTalk")),
                "acquireAfterNpcTalk": val(r.get("AcquireAfterNpcTalk")),
                "completeMapId": val(r.get("CompleteMapId")),
                "completeNpcTalk": val(r.get("CompleteNpcTalk")),
                "nextQuestName": val(r.get("NextQuestName")),
                "repeatType": enum(r.get("RepeatType")),
            }
        )
    return out


def parse_steps(rows: list[dict]) -> dict[str, list[dict]]:
    """QuestName -> steps sorted by Order, each with parsed goals."""
    by_quest: dict[str, list[dict]] = {}
    for r in rows:
        goals = []
        for g in r.get("GoalList") or []:
            values = [v for v in (val(v) for v in (g.get("Value") or [])) if v]
            goals.append(
                {
                    "type": enum(g.get("Type")),
                    "values": values,
                    "mapId": val(g.get("MapId")),
                    "marker": bool(g.get("bMarker")),
                    "optional": bool(g.get("bOptional")),
                }
            )
        by_quest.setdefault(r["QuestName"], []).append(
            {"order": r.get("Order") or 0, "goals": goals}
        )
    for steps in by_quest.values():
        steps.sort(key=lambda s: s["order"])
    return by_quest


def parse_rewards(rows: list[dict]) -> dict[str, dict]:
    """Group -> rewards, merging fixed item reward arrays; select stays separate."""
    out: dict[str, dict] = {}
    for r in rows:
        items = [
            {"item": i.get("Item"), "count": val(i.get("Count")) or 0}
            for i in (r.get("ItemRewards") or []) + (r.get("ItemNormalRewards") or [])
            if i.get("Item")
        ]
        select = [
            {"item": i.get("Item"), "count": val(i.get("Count")) or 0}
            for i in (r.get("ItemSelectRewards") or [])
            if i.get("Item")
        ]
        out[str(r.get("Group")).lstrip("0")] = {
            "exp": val(r.get("ExpReward")) or 0,
            "items": items,
            "select": select,
        }
    return out


def parse_npcs(rows: list[dict]) -> dict:
    """Build NPC indexes by numeric id and by string table name."""
    by_id, by_name = {}, {}
    for r in rows:
        rec = {
            "id": val(r.get("ID")),
            "name": val(r.get("Name")),
            "descKey": l10n_key(r.get("Desc")),
            "level": val(r.get("Level")) or 0,
            "named": bool(r.get("bNamed")),
        }
        if rec["id"] is not None:
            by_id[rec["id"]] = rec
        if rec["name"]:
            by_name[rec["name"]] = rec
    return {"by_id": by_id, "by_name": by_name}
