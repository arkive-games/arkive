"""Base-camp progression (deferred-systems plan §3).

Two small tables drive base-camp levelling:

  * ``DT_BaseCampLevelData`` — per level: the pal-worker cap and how many bases
    the guild may hold.
  * ``DT_BaseCampTask`` — the level-up checklist: an optional worker-count task
    plus up to 3 build-object tasks (``BuildObject1..3`` + counts). The MsgID
    columns are in-game toast text, not needed (building names come from the
    existing buildings locale).

Emits ``data-palworld/basecamp.json``:

  {levels: [{level, workers, bases, tasks: [{workers} | {object, count}]}]}

``tasks`` are the requirements to ADVANCE FROM this level (the game shows them
while you are at ``level``). Building ids match ``buildings.json`` ids.

Run: ``uv run python -m palworld.basecamp`` (from the ``tools`` dir).
"""

from __future__ import annotations

from pathlib import Path

from .env import require_dir
from .maps.common import read_rows, write_json

_NONE = {None, "None", ""}


def run_basecamp(raw: Path, data_out: Path) -> dict:
    raw, data_out = Path(raw), Path(data_out)
    level_rows = read_rows(raw / "DataTable/BaseCamp/DT_BaseCampLevelData.json")
    task_rows = read_rows(raw / "DataTable/BaseCamp/DT_BaseCampTask.json")

    tasks_by_level: dict[int, list] = {}
    for r in task_rows.values():
        lvl = r.get("Level", 0)
        tasks: list = []
        if (n := r.get("workerNum", 0) or 0) > 0:
            tasks.append({"workers": n})
        for i in (1, 2, 3):
            obj = r.get(f"BuildObject{i}")
            cnt = r.get(f"BuildObjectNum{i}", 0) or 0
            if obj not in _NONE and cnt > 0:
                tasks.append({"object": obj, "count": cnt})
        if tasks:
            tasks_by_level[lvl] = tasks

    levels = []
    for r in sorted(level_rows.values(), key=lambda x: x.get("Level", 0)):
        lvl = r.get("Level", 0)
        entry = {
            "level": lvl,
            "workers": r.get("WorkerMaxNum", 0),
            "bases": r.get("BaseCampMaxNumInGuild", 0),
        }
        if lvl in tasks_by_level:
            entry["tasks"] = tasks_by_level[lvl]
        levels.append(entry)

    write_json(data_out / "basecamp.json", {"levels": levels})
    print(f"basecamp: {len(levels)} levels, {sum(len(v) for v in tasks_by_level.values())} tasks")
    return {"levels": levels}


if __name__ == "__main__":
    from .version import stamp_version

    run_basecamp(require_dir("PALWORLD_RAW"), require_dir("PALWORLD_DATA_OUT"))
    stamp_version(require_dir("PALWORLD_DATA_OUT"))
