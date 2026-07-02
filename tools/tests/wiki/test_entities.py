import json

from aion2.tools.maps import TOOLS_ROOT
from aion2.tools.wiki import entities

FIXTURES = TOOLS_ROOT / "tests" / "wiki" / "fixtures"


def load(name):
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


NPC = {"id": 7, "name": "NPC_A", "descKey": None, "level": 12, "named": True,
       "npcType": "Monster", "subType": "HeroMonster", "grade": 3,
       "funcType": None, "relationship": "Monster"}


def test_build_npc_entity_shape():
    ent = entities.build_npc_entity(
        NPC,
        name={"en": "Boss A", "zhCN": "Boss A", "zhTW": "Boss A"},
        spawns_by_map={"World_L_A": [{"x": 1.0, "y": 2.0}]},
        quest_refs=[{"id": 100, "role": "giver"}],
        drop_items=[{"id": 5, "name": {"en": "Sword", "zhCN": "Sword", "zhTW": "Sword"},
                     "grade": "rare", "icon": None}],
    )
    assert ent["id"] == 7 and ent["type"] == "npc"
    assert ent["race"] == "all" and ent["named"] is True
    assert ent["spawns"] == [{"mapName": "World_L_A", "pois": [{"x": 1.0, "y": 2.0}]}]
    assert ent["quests"] == [{"id": 100, "role": "giver"}]
    assert ent["drops"][0]["grade"] == "rare"


def test_build_npc_quest_refs():
    quests = [{"id": 1, "name": "Q1", "acquireBeforeNpcTalk": "T_A",
               "acquireAfterNpcTalk": None, "completeNpcTalk": None}]
    steps = {"Q1": [{"order": 1, "goals": [
        {"type": "KillNpc", "values": ["NPC_A"], "movePoint": None}]}]}
    talks = {"T_A": "NPC_G"}
    refs = entities.build_npc_quest_refs(quests, steps, talks)
    assert refs["NPC_G"] == [{"id": 1, "role": "giver"}]
    assert refs["NPC_A"] == [{"id": 1, "role": "target"}]
