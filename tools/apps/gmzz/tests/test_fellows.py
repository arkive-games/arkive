"""The 人脉 stage: the two joins that go wrong quietly, and the client's own typo.

Each test stands for a way the dataset can come out looking plausible and being
wrong — a shared effect where the game gives per-member ones, a tier label read
out of prose, or a build that stops over a defect the game itself ships.
"""

from __future__ import annotations

import pytest

from gmzz import fellows


GRADES = [
    {"ID": 0, "GradeName": "【风闻】"},
    {"ID": 1, "GradeName": "【浅见】"},
    {"ID": 2, "GradeName": "【实证】"},
    {"ID": 3, "GradeName": "【隐迹】"},
    {"ID": 4, "GradeName": "【秘辛】"},
    {"ID": 5, "GradeName": "【本相】"},
]

EFFECTS = {
    "6": {
        "ID": 6, "SkillID": 87002210, "Introduce": "沉默目标",
        "DescribList": {"0": "【风闻】沉默持续1秒。", "1": "【浅见】扣除16点体力。"},
    },
    # The client's own slip: this tier is 秘辛 but its text repeats 实证's label.
    "7": {
        "ID": 7, "SkillID": 87000510, "Introduce": "辅助",
        "DescribList": {"4": "【实证】诗意光环持续时间增加1秒。"},
    },
}


def test_grade_names_come_from_the_rarity_table():
    grades = fellows.build_grades({"RelationRarity": GRADES})
    assert [g["name"] for g in grades] == [g["GradeName"] for g in GRADES]


def test_a_short_grade_ladder_stops_the_build():
    with pytest.raises(RuntimeError, match="expected 6"):
        fellows.build_grades({"RelationRarity": GRADES[:3]})


def test_the_tier_label_is_stripped_from_the_text():
    # It is a field of its own, so leaving it in prints 【风闻】 twice.
    grades = fellows.build_grades({"RelationRarity": GRADES})
    effects, _ = fellows.build_effects({"RelationEffect": EFFECTS}, grades)
    by_id = {effect["id"]: effect for effect in effects}
    assert by_id[6]["tiers"][0] == {
        "grade": 0, "gradeName": "【风闻】", "description": "沉默持续1秒。",
    }


def test_a_mislabelled_tier_is_reported_but_still_ships():
    grades = fellows.build_grades({"RelationRarity": GRADES})
    effects, mismatches = fellows.build_effects({"RelationEffect": EFFECTS}, grades)
    by_id = {effect["id"]: effect for effect in effects}
    tier = by_id[7]["tiers"][0]
    assert tier["gradeName"] == "【秘辛】", "the table decides the label"
    assert tier["description"] == "诗意光环持续时间增加1秒。", "the wrong prefix is stripped too"
    assert len(mismatches) == 1 and "effect 7 tier 4" in mismatches[0]


FELLOWS = {
    "41000007": {
        "ID": 41000007, "Name": "克莱恩·莫雷蒂", "EnglishName": "Klein", "Quality": 5,
        "Label": "塔罗会", "Order": 7, "VoiceActor": "唐子晰",
        "DescribList": [f"技能{n}" for n in range(1, 6)],
        "StoryList": [1066], "RelationList": [4],
        "IconPath": "/Game/A/B/7_Klein.7_Klein", "IconPath_M": "/Game/A/C/7_Klein.7_Klein",
    },
}
STORIES = {"1066": {"StoryTitle": "尊名", "UnlockLevel": 1, "StoryText": "灰雾之上的神秘主宰。"}}


def test_a_story_carries_its_unlock_level_but_a_skill_does_not(monkeypatch):
    monkeypatch.setattr(fellows, "FELLOW_COUNT", 1)
    built = fellows.build_fellows({"Fellow": FELLOWS, "FellowStory": STORIES})
    assert built[0]["stories"][0]["unlockLevel"] == 1
    assert built[0]["skills"] == [f"技能{n}" for n in range(1, 6)]
    # Nothing in the export says what unlocks each skill, so nothing claims to.
    assert all(isinstance(skill, str) for skill in built[0]["skills"])


def test_a_fellow_missing_skill_lines_stops_the_build(monkeypatch):
    monkeypatch.setattr(fellows, "FELLOW_COUNT", 1)
    broken = {"41000007": {**FELLOWS["41000007"], "DescribList": ["只有一条"]}}
    with pytest.raises(RuntimeError, match="1 skill lines"):
        fellows.build_fellows({"Fellow": broken, "FellowStory": STORIES})


def test_relation_effects_are_per_member_and_zero_means_none(monkeypatch):
    monkeypatch.setattr(fellows, "FELLOW_COUNT", 1)
    people = fellows.build_fellows({"Fellow": FELLOWS, "FellowStory": STORIES})
    grades = fellows.build_grades({"RelationRarity": GRADES})
    effects, _ = fellows.build_effects({"RelationEffect": EFFECTS}, grades)
    relations = fellows.build_relations(
        {"FellowRelation": {"4": {
            "ID": 4, "Name": "永远的守护者", "Order": 4, "RelationQuality": 2, "Type": 1,
            "Story": "...", "MemberEffectMapList": [[41000007, 6], [41000007, 0]],
        }}},
        people, effects,
    )
    assert relations[0]["members"] == [
        {"fellowId": 41000007, "effectId": 6},
        # 0 is "in this relation for the story only", not effect number zero.
        {"fellowId": 41000007, "effectId": None},
    ]


def test_a_relation_naming_an_unknown_effect_stops_the_build(monkeypatch):
    monkeypatch.setattr(fellows, "FELLOW_COUNT", 1)
    people = fellows.build_fellows({"Fellow": FELLOWS, "FellowStory": STORIES})
    with pytest.raises(RuntimeError, match="names effect 99"):
        fellows.build_relations(
            {"FellowRelation": {"4": {
                "ID": 4, "Name": "x", "Order": 1, "Story": "",
                "MemberEffectMapList": [[41000007, 99]],
            }}},
            people, [],
        )
