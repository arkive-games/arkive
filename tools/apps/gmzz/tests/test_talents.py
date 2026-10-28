"""The talent stage: tree assembly and the invariants the score formula rests on."""

from __future__ import annotations

import pytest

from PIL import Image

from gmzz.talents import ICON_ROOTS, build_trees, icon_names, locate_icons, stat_names


def tree_row(key=101, profession=1200001, caps=(10, 40, 75), name="颂歌"):
    return {"Key": key, "Profession": profession, "Name": name, "Tag": "群伤辅助",
            "Description": "强化歌颂者的群体辅助和输出能力", "SequenceTalentPointMax": list(caps),
            "TabIcon": f"/Game/Arts/UI_2/Resource/ConfigIcon/Talent/Talent_Bard_{key % 100}.Talent_Bard_{key % 100}"}


def ladder(max_level=15, per=(("Pierce_N", 23), ("Block_N", 14), ("Def_N", 7))):
    """``PointPropReward`` as the client ships it: each level's running total."""
    return [[[key, value * level] for key, value in per] for level in range(1, max_level + 1)]


def normal(key, tree=101, parent=None, position=0, max_level=15):
    row = {"Key": key, "TreeID": tree, "Type": 1, "Mark": 180, "MaxLevel": max_level, "Name": f"node{key}",
           "Position": position, "PointDesc": "增加穿刺、格挡和防御。", "Icon": "Talent_Atk_Y",
           "PointPropReward": ladder(max_level)}
    if parent is not None:
        row["ParentNode"] = parent
    return row


def special(key, tree=101, parent=None, position=0):
    return {"Key": key, "TreeID": tree, "Type": 2, "Mark": 1000, "MaxLevel": 0, "Name": f"special{key}",
            "Position": position, "ParentNode": parent, "Icon": f"Bard_Skill_{key % 100:02d}",
            "PointDesc": '<HyperLink u="86011040">逐日</>施放后伤害提升20%。;\n<HyperLink u="86011030">太阳誓约</>冷却减少1.5秒。',
            "PointPropReward": {}}


def sample():
    trees = {"101": tree_row(), "102": tree_row(102, name="圣裁"), "401": tree_row(401, 1200004, (), "")}
    nodes = {}
    for i in range(5):
        nodes[str(10100 + i)] = normal(10100 + i, parent=10100 + i - 1 if i else None, position=i)
    for i, parent in enumerate((10101, 10102, 10103, 10104)):
        nodes[str(10105 + i)] = special(10105 + i, parent=parent, position=11 + i * 10)
    defaults = {"1200001": {"Key": 101, "Profession": 1200001}}
    return trees, nodes, defaults, names()


def names():
    modes = {str(i): {"PropMode": key, "PropName": key, "ShowType": show}
             for i, (key, show) in enumerate((("pPierce_N", 0), ("mPierce_N", 0), ("pBlock_N", 0), ("mBlock_N", 0),
                                              ("pDef_N", 0), ("mDef_N", 0), ("Def_P", 1)))}
    groups = {"4000": {"Prop": "Def_N", "Discription": "防御", "PropNameSet": ["pDef_N", "mDef_N"]},
              "4002": {"Prop": "Block_N", "Discription": "格挡", "PropNameSet": ["pBlock_N", "mBlock_N"]},
              "4006": {"Prop": "Pierce_N", "Discription": "穿刺", "PropNameSet": ["pPierce_N", "mPierce_N"]},
              "4100": {"Prop": "Mixed_N", "Discription": "混合", "PropNameSet": ["pDef_N", "Def_P"]}}
    return stat_names(modes, groups)


def test_tree_carries_its_nodes_in_position_order_with_the_score_ceiling():
    trees = build_trees(*sample())
    assert [t["id"] for t in trees] == [101], "trees without nodes are dropped"
    tree = trees[0]
    assert tree["default"] is True
    assert tree["professionId"] == 1200001
    assert tree["pointCapsBySequenceStage"] == [10, 40, 75]
    assert [n["key"] for n in tree["nodes"]] == [10100, 10101, 10102, 10103, 10104, 10105, 10106, 10107, 10108]
    assert tree["maxScore"] == 5 * 15 * 180 + 4 * 1000 == 17500
    assert tree["nodes"][0]["parentKey"] is None and tree["nodes"][1]["parentKey"] == 10100


def test_special_node_description_splits_its_two_effects_and_drops_markup():
    tree = build_trees(*sample())[0]
    node = next(n for n in tree["nodes"] if n["type"] == "special")
    assert node["description"] == "逐日施放后伤害提升20%。\n太阳誓约冷却减少1.5秒。"
    assert node["maxLevel"] == 0 and node["mark"] == 1000


@pytest.mark.parametrize("problem", ["type", "mark", "normal-max", "special-max", "parent", "cap", "orphan-tree",
                                     "stat-levels", "stat-keys", "stat-falls", "stat-name", "special-stats"])
def test_broken_tables_fail_loudly(problem):
    trees, nodes, defaults, names_ = sample()
    if problem == "type":
        nodes["10100"]["Type"] = 3
    elif problem == "mark":
        nodes["10100"]["Mark"] = None
    elif problem == "normal-max":
        nodes["10100"]["MaxLevel"] = 0
    elif problem == "special-max":
        nodes["10105"]["MaxLevel"] = 1
    elif problem == "parent":
        nodes["10101"]["ParentNode"] = 99999
    elif problem == "cap":
        trees["101"]["SequenceTalentPointMax"] = [10, 40, 60]
    elif problem == "stat-levels":
        nodes["10100"]["PointPropReward"] = ladder(14)
    elif problem == "stat-keys":
        nodes["10100"]["PointPropReward"][3] = [["Pierce_N", 92], ["Def_N", 28]]
    elif problem == "stat-falls":
        nodes["10100"]["PointPropReward"][3][0][1] = 1
    elif problem == "stat-name":
        nodes["10100"]["PointPropReward"] = ladder(per=(("Crit_N", 3),))
    elif problem == "special-stats":
        nodes["10105"]["PointPropReward"] = ladder(1)
    else:
        nodes["10100"]["TreeID"] = 999
    with pytest.raises(ValueError):
        build_trees(trees, nodes, defaults, names_)


def test_levelled_nodes_carry_one_running_total_ladder_per_stat():
    tree = build_trees(*sample())[0]
    stats = tree["nodes"][0]["stats"]
    assert [(s["key"], s["name"], s["format"]) for s in stats] == [
        ("Pierce_N", "穿刺", "number"), ("Block_N", "格挡", "number"), ("Def_N", "防御", "number")]
    assert stats[0]["values"][:3] == [23, 46, 69] and len(stats[0]["values"]) == 15
    assert stats[2]["values"][-1] == 7 * 15


def test_core_nodes_grant_no_stats():
    tree = build_trees(*sample())[0]
    assert all(n["stats"] == [] for n in tree["nodes"] if n["type"] == "special")


def test_stat_names_read_groups_and_single_props_and_skip_mixed_groups():
    found = names()
    assert found["Def_N"] == {"name": "防御", "format": "number"}
    assert found["Def_P"] == {"name": "Def_P", "format": "percent"}
    assert "Mixed_N" not in found, "a group whose members format differently has no single display"


def test_trees_and_nodes_name_their_icons():
    tree = build_trees(*sample())[0]
    assert tree["icon"] == "Talent_Bard_1"
    assert tree["nodes"][0]["icon"] == "Talent_Atk_Y"
    assert icon_names([tree]) == ["Bard_Skill_05", "Bard_Skill_06", "Bard_Skill_07", "Bard_Skill_08", "Talent_Atk_Y", "Talent_Bard_1"]


def test_an_unparseable_tab_icon_fails_loudly():
    trees, nodes, defaults, names_ = sample()
    trees["101"]["TabIcon"] = "Talent_Bard_1"
    with pytest.raises(ValueError):
        build_trees(trees, nodes, defaults, names_)


def _png(path):
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGBA", (4, 4)).save(path)


def test_icons_are_found_by_name_under_either_root(tmp_path):
    _png(tmp_path / ICON_ROOTS[0] / "Talent_Atk_Y.png")
    _png(tmp_path / ICON_ROOTS[1] / "Bard" / "Bard_Skill_05.png")
    found = locate_icons(tmp_path, ["Bard_Skill_05", "Talent_Atk_Y"])
    assert found["Bard_Skill_05"].parent.name == "Bard"


def test_a_missing_or_ambiguous_icon_fails_loudly(tmp_path):
    _png(tmp_path / ICON_ROOTS[1] / "Bard" / "Bard_Skill_05.png")
    with pytest.raises(FileNotFoundError):
        locate_icons(tmp_path, ["Talent_Atk_Y"])
    _png(tmp_path / ICON_ROOTS[1] / "Seer" / "Bard_Skill_05.png")
    with pytest.raises(ValueError):
        locate_icons(tmp_path, ["Bard_Skill_05"])
