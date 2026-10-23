"""The talent stage: tree assembly and the invariants the score formula rests on."""

from __future__ import annotations

import pytest

from gmzz.talents import build_trees


def tree_row(key=101, profession=1200001, caps=(10, 40, 75), name="颂歌"):
    return {"Key": key, "Profession": profession, "Name": name, "Tag": "群伤辅助",
            "Description": "强化歌颂者的群体辅助和输出能力", "SequenceTalentPointMax": list(caps)}


def normal(key, tree=101, parent=None, position=0, max_level=15):
    row = {"Key": key, "TreeID": tree, "Type": 1, "Mark": 180, "MaxLevel": max_level, "Name": f"node{key}",
           "Position": position, "PointDesc": "增加穿刺、格挡和防御。"}
    if parent is not None:
        row["ParentNode"] = parent
    return row


def special(key, tree=101, parent=None, position=0):
    return {"Key": key, "TreeID": tree, "Type": 2, "Mark": 1000, "MaxLevel": 0, "Name": f"special{key}",
            "Position": position, "ParentNode": parent,
            "PointDesc": '<HyperLink u="86011040">逐日</>施放后伤害提升20%。;\n<HyperLink u="86011030">太阳誓约</>冷却减少1.5秒。'}


def sample():
    trees = {"101": tree_row(), "102": tree_row(102, name="圣裁"), "401": tree_row(401, 1200004, (), "")}
    nodes = {}
    for i in range(5):
        nodes[str(10100 + i)] = normal(10100 + i, parent=10100 + i - 1 if i else None, position=i)
    for i, parent in enumerate((10101, 10102, 10103, 10104)):
        nodes[str(10105 + i)] = special(10105 + i, parent=parent, position=11 + i * 10)
    defaults = {"1200001": {"Key": 101, "Profession": 1200001}}
    return trees, nodes, defaults


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


@pytest.mark.parametrize("problem", ["type", "mark", "normal-max", "special-max", "parent", "cap", "orphan-tree"])
def test_broken_tables_fail_loudly(problem):
    trees, nodes, defaults = sample()
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
    else:
        nodes["10100"]["TreeID"] = 999
    with pytest.raises(ValueError):
        build_trees(trees, nodes, defaults)
