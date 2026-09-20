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
        "Label": "塔罗会", "Order": 7, "VoiceActor": "唐子晰", "DefaultSkillID": 87002210,
        "DescribList": [f"强化{n}" for n in range(1, 6)],
        "StoryList": [1066], "RelationList": [4],
        "IconPath": "/Game/A/B/7_Klein.7_Klein", "IconPath_M": "/Game/A/C/7_Klein.7_Klein",
    },
}
STORIES = {"1066": {"StoryTitle": "尊名", "UnlockLevel": 1, "StoryText": "灰雾之上的神秘主宰。"}}

# 1004/1012 are bookkeeping and sit in `Tags`, never in `DesTags` — the panel
# would otherwise print 伙伴技能 as if it were a label.
TAGS = {1: "单体", 11: "治疗", 21: "强化", 23: "辅助", 1004: "伙伴技能", 1012: "非普攻战斗技能"}
SKILLS = {
    87002210: {
        "ID": 87002210, "Name": "转运仪式", "CD": 35, "Tag": "增益",
        "Tags": [1004, 1012, 21, 23], "DesTags": [21, 23],
        "SkillCastDesc": [[2, "自身"]],
        "SkillDisc": "自身获得灰雾加持，造成*d点伤害，buffdisc(*id)",
        "BriefDescription": "自身获得灰雾加持。",
        "SkillIcon": "/Game/Arts/UI_2/Resource/Skill/Follow/Follow_Skill_19.Follow_Skill_19",
    },
}


def _klein(monkeypatch, table=None):
    monkeypatch.setattr(fellows, "FELLOW_COUNT", 1)
    return fellows.build_fellows(
        {"Fellow": table or FELLOWS, "FellowStory": STORIES}, SKILLS, TAGS
    )


def test_describ_list_is_the_star_ladder_not_five_skills(monkeypatch):
    # The first reading of this table shipped five "skills" per fellow. They are
    # the 一阶…五阶 upgrades of the one skill, and the stage is the index.
    built = _klein(monkeypatch)
    assert built[0]["upgrades"] == [
        {"stage": n, "description": f"强化{n}"} for n in range(1, 6)
    ]
    assert built[0]["skill"]["name"] == "转运仪式"


def test_a_story_carries_its_unlock_level(monkeypatch):
    assert _klein(monkeypatch)[0]["stories"][0]["unlockLevel"] == 1


def test_a_fellow_missing_upgrade_lines_stops_the_build(monkeypatch):
    monkeypatch.setattr(fellows, "FELLOW_COUNT", 1)
    broken = {"41000007": {**FELLOWS["41000007"], "DescribList": ["one line only"]}}
    with pytest.raises(RuntimeError, match="1 upgrade lines"):
        fellows.build_fellows({"Fellow": broken, "FellowStory": STORIES}, SKILLS, TAGS)


def test_the_panel_chips_come_from_destags_not_tags(monkeypatch):
    skill = _klein(monkeypatch)[0]["skill"]
    assert skill["tags"] == ["强化", "辅助"], "Tags' 1004/1012 are not labels"
    assert skill["cooldown"] == 35 and skill["castTargets"] == ["自身"]
    assert skill["icon"] == "Follow_Skill_19"


def test_client_side_formulas_are_marked_never_guessed(monkeypatch):
    skill = _klein(monkeypatch)[0]["skill"]
    # `*d` and `buffdisc(*id)` are expanded by the client from the caster's
    # level; a static export has no figure to put there.
    assert skill["description"] == "自身获得灰雾加持，造成…点伤害，…"
    assert skill["hasFormula"] is True
    assert skill["brief"] == "自身获得灰雾加持。", "the brief text carries no placeholder"


def test_a_fellow_without_a_skill_row_stops_the_build(monkeypatch):
    monkeypatch.setattr(fellows, "FELLOW_COUNT", 1)
    with pytest.raises(KeyError):
        fellows.build_fellows({"Fellow": FELLOWS, "FellowStory": STORIES}, {}, TAGS)


def test_an_unknown_display_tag_stops_the_build(monkeypatch):
    monkeypatch.setattr(fellows, "FELLOW_COUNT", 1)
    with pytest.raises(RuntimeError, match="DesTags names 23"):
        fellows.build_fellows(
            {"Fellow": FELLOWS, "FellowStory": STORIES}, SKILLS, {21: "强化"}
        )


def test_relation_effects_are_per_member_and_zero_means_none(monkeypatch):
    monkeypatch.setattr(fellows, "FELLOW_COUNT", 1)
    people = fellows.build_fellows({"Fellow": FELLOWS, "FellowStory": STORIES}, SKILLS, TAGS)
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
    people = fellows.build_fellows({"Fellow": FELLOWS, "FellowStory": STORIES}, SKILLS, TAGS)
    with pytest.raises(RuntimeError, match="names effect 99"):
        fellows.build_relations(
            {"FellowRelation": {"4": {
                "ID": 4, "Name": "x", "Order": 1, "Story": "",
                "MemberEffectMapList": [[41000007, 99]],
            }}},
            people, [],
        )
