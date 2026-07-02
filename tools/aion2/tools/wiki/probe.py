"""One-shot: dump small real-data fixtures for wiki emitter tests.

Run:  uv run python -m aion2.tools.wiki.probe
Writes tests/wiki/fixtures/*.json (small, committed).
"""
import json
from pathlib import Path

from aion2.tools.maps import TOOLS_ROOT
from aion2.tools.maps.extract import _table
from aion2.tools.maps.subzones import map_data_path

FIXTURES = TOOLS_ROOT / "tests" / "wiki" / "fixtures"


def _dump(name: str, obj) -> None:
    FIXTURES.mkdir(parents=True, exist_ok=True)
    (FIXTURES / name).write_text(
        json.dumps(obj, ensure_ascii=False, indent=1), encoding="utf-8"
    )


def main() -> None:
    quests = _table("Quest.json")
    steps = _table("QuestStep.json")
    rewards = _table("QuestReward.json")
    npcs = _table("NpcData.json")
    maps = _table("Map.json")

    # A quest that has steps with an AskNpc goal, its steps, reward group, and NPCs.
    step_by_quest: dict[str, list] = {}
    for s in steps:
        step_by_quest.setdefault(s["QuestName"], []).append(s)
    sample_q = next(
        q for q in quests
        if q["Name"] in step_by_quest
        and any(
            g["Type"].endswith("AskNpc") or g["Type"].endswith("KillNpc")
            for st in step_by_quest[q["Name"]] for g in st.get("GoalList", [])
        )
    )
    _dump("quest_sample.json", [sample_q])
    _dump("queststep_sample.json", step_by_quest[sample_q["Name"]])
    grp = str(sample_q["ID"]["Value"])
    _dump(
        "questreward_sample.json",
        [r for r in rewards if r["Group"].lstrip("0") == grp.lstrip("0")][:2]
        or rewards[:1],
    )
    _dump("npcdata_sample.json", npcs[:3])
    _dump(
        "map_rows.json",
        [{k: m.get(k) for k in ("Name", "ID", "MapId", "Desc")} for m in maps[:50]],
    )

    # SpawnInfo entries from World_L_A (trimmed): Name, NpcIdList, first Position.
    md = json.loads(map_data_path("World_L_A").read_text(encoding="utf-8"))
    spawns = md["Properties"]["Data"]["SpawnInfoList"]
    trimmed = [
        {
            "Name": s.get("Name"),
            "NpcIdList": s.get("NpcIdList"),
            "Positions": (s.get("Positions") or [])[:1],
        }
        for s in spawns[:40]
    ]
    _dump("spawninfo_sample.json", trimmed)
    print("fixtures written to", FIXTURES)


if __name__ == "__main__":
    main()
