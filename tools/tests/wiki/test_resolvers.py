from aion2.tools.wiki import resolvers


class FakeTransform:
    def world_to_pixel(self, wx, wy):
        return (wx / 10.0, wy / 10.0)


SPAWNS = [
    {
        "Name": "N_L1_Q_Alice_01",
        "NpcIdList": [{"Value": 42}],
        "Positions": [{"Location": {"X": 100.0, "Y": 200.0, "Z": 5.0}}],
    },
    {
        "Name": "S_other",
        "NpcIdList": [{"Value": 43}],
        "Positions": [
            {"Location": {"X": 300.0, "Y": 400.0, "Z": 0.0}},
            {"Location": {"X": 310.0, "Y": 410.0, "Z": 0.0}},
        ],
    },
]
NPCS = {
    "by_id": {
        42: {
            "id": 42,
            "name": "N_L1_Q_Alice_01",
            "descKey": "STR_Alice",
            "level": 5,
            "named": False,
        },
        43: {
            "id": 43,
            "name": "N_Bob",
            "descKey": "STR_Bob",
            "level": 7,
            "named": True,
        },
    },
    "by_name": {"N_L1_Q_Alice_01": {"id": 42}, "N_Bob": {"id": 43}},
}


def test_spawn_index_by_spawner_name_and_npc_name():
    idx = resolvers.build_spawn_index(SPAWNS, NPCS, FakeTransform())
    assert idx["N_L1_Q_Alice_01"][0] == {"x": 10.0, "y": 20.0}
    assert len(idx["N_Bob"]) == 2


def test_resolve_npc_goal_hits():
    idx = {"World_L_A": resolvers.build_spawn_index(SPAWNS, NPCS, FakeTransform())}
    goal = {
        "type": "AskNpc",
        "values": ["N_L1_Q_Alice_01", "talk"],
        "mapId": 1010,
        "marker": True,
        "optional": False,
    }
    r = resolvers.resolve_goal(goal, map_name="World_L_A", spawn_index=idx)
    assert r["resolved"] is True and r["pois"] == [{"x": 10.0, "y": 20.0}]


def test_resolve_unknown_target_reports_miss():
    r = resolvers.resolve_goal(
        {
            "type": "KillNpc",
            "values": ["N_Missing"],
            "mapId": 1,
            "marker": True,
            "optional": False,
        },
        map_name="World_L_A",
        spawn_index={"World_L_A": {}},
    )
    assert r["resolved"] is False and r["pois"] == []


def test_nonspatial_goal_not_counted_as_miss():
    r = resolvers.resolve_goal(
        {
            "type": "PCLevel",
            "values": ["10"],
            "mapId": None,
            "marker": False,
            "optional": False,
        },
        map_name=None,
        spawn_index={},
    )
    assert r["resolved"] is None


def test_poi_cap():
    many = [
        {
            "Name": "N_Many",
            "NpcIdList": [],
            "Positions": [
                {"Location": {"X": float(i), "Y": 0.0, "Z": 0.0}}
                for i in range(100)
            ],
        }
    ]
    idx = {
        "M": resolvers.build_spawn_index(
            many, {"by_id": {}, "by_name": {}}, FakeTransform()
        )
    }
    r = resolvers.resolve_goal(
        {
            "type": "AskNpc",
            "values": ["N_Many"],
            "mapId": 1,
            "marker": True,
            "optional": False,
        },
        map_name="M",
        spawn_index=idx,
    )
    assert len(r["pois"]) == resolvers.MAX_POIS
