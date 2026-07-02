from aion2.tools.wiki import taxonomy


CFG = {
    "quest": {
        "labels": {"en": "Quests", "zhCN": "任务"},
        "groups": [
            {
                "slug": "main",
                "types": ["Hero"],
                "labels": {"en": "Main", "zhCN": "主线"},
            },
            {
                "slug": "side",
                "types": ["District"],
                "labels": {"en": "Side", "zhCN": "支线"},
            },
        ],
    }
}
QUESTS = [
    {"id": 1, "type": "Hero", "part": "hero_Eltnen_01", "recommendedLevel": 15},
    {"id": 2, "type": "Hero", "part": "hero_poeta_00", "recommendedLevel": 1},
    {"id": 3, "type": "Hero", "part": "hero_poeta_01", "recommendedLevel": 5},
    {"id": 4, "type": "Hero", "part": None, "recommendedLevel": 0},
    {"id": 5, "type": "District", "part": None, "recommendedLevel": 0},
    {"id": 6, "type": "UnknownType", "part": None, "recommendedLevel": 0},
]


def test_group_slug_for():
    g = taxonomy.group_lookup(CFG["quest"])
    assert g["Hero"] == "main" and g["District"] == "side"


def test_build_tree_counts_and_sections():
    tree, unmatched = taxonomy.build_quest_tree(CFG, QUESTS)
    quest = tree["types"][0]
    assert quest["slug"] == "quest" and quest["count"] == 5
    main = quest["groups"][0]
    assert main["slug"] == "main" and main["count"] == 4
    assert [s["slug"] for s in main["sections"]] == [
        "hero_poeta_00",
        "hero_poeta_01",
        "hero_Eltnen_01",
        "other",
    ]
    side = quest["groups"][1]
    assert side["sections"][0]["slug"] == "other"
    assert unmatched == ["UnknownType"]


def test_section_label_humanizes_slug():
    assert taxonomy.section_label("hero_poeta_00") == "Hero Poeta 00"
    assert taxonomy.section_label("other") == "Other"
