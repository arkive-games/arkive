import json
from pathlib import Path

from aion2.tools.wiki import emit_wiki, tables

FIX = Path(__file__).parent / "fixtures"


class FakeL10N:
    def en(self, key):
        return f"EN:{key}" if key else ""

    def zh_cn(self, key):
        return f"CN:{key}" if key else ""


def test_build_quest_entity_shape():
    quests = tables.parse_quests(
        json.loads((FIX / "quest_sample.json").read_text(encoding="utf-8"))
    )
    steps = tables.parse_steps(
        json.loads((FIX / "queststep_sample.json").read_text(encoding="utf-8"))
    )
    q = quests[0]
    ent = emit_wiki.build_quest_entity(
        q,
        steps.get(q["name"], []),
        rewards={},
        l10n=FakeL10N(),
        mapid_to_name={},
        spawn_index={},
        name_to_id={q["name"]: q["id"]},
        prev_index={},
        item_names={},
    )
    assert ent["id"] == q["id"] and ent["type"] == "quest"
    assert set(ent["name"]) == {"en", "zhCN", "zhTW"}
    assert isinstance(ent["steps"], list)
    for st in ent["steps"]:
        for ob in st["objectives"]:
            assert set(ob) >= {"type", "label", "marker", "optional", "pois", "mapName"}
    assert "rewards" in ent and "chain" in ent
