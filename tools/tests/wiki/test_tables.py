import json
from pathlib import Path

from aion2.tools.wiki import tables

FIX = Path(__file__).parent / "fixtures"


def _load(name):
    return json.loads((FIX / name).read_text(encoding="utf-8"))


def test_val_unwraps_ue_scalars():
    assert tables.val({"Value": 1100010}) == 1100010
    assert tables.val(7) == 7
    assert tables.val("None") is None
    assert tables.val(None) is None


def test_enum_strips_prefix():
    assert tables.enum("EQuestType::Hero") == "Hero"
    assert tables.enum("ERace::Light") == "Light"
    assert tables.enum(None) is None


def test_parse_quests_builds_records():
    qs = tables.parse_quests(_load("quest_sample.json"))
    q = qs[0]
    assert isinstance(q["id"], int)
    assert q["name"]
    assert q["type"] in {
        "Hero",
        "District",
        "DutyMission",
        "DutyScroll",
        "Ascension",
        "Daevagauge",
        "Exploration",
        "GatherCraftMastery",
    }
    assert q["race"] in {"Light", "Dark", "All"}
    assert "textKey" in q and "part" in q and "nextQuestName" in q


def test_parse_steps_groups_and_sorts_by_order():
    steps = tables.parse_steps(_load("queststep_sample.json"))
    quest_name = next(iter(steps))
    orders = [s["order"] for s in steps[quest_name]]
    assert orders == sorted(orders)
    goal = steps[quest_name][0]["goals"][0]
    assert set(goal) >= {"type", "values", "mapId", "marker", "optional"}


def test_parse_rewards_indexes_by_group():
    rw = tables.parse_rewards(_load("questreward_sample.json"))
    g, r = next(iter(rw.items()))
    assert isinstance(g, str)
    assert isinstance(r["exp"], int)
    assert isinstance(r["items"], list)
