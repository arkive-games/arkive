import pytest

from palworld.dungeon_layouts import run_dungeon_layouts
from palworld.env import optional_dir

RAW = optional_dir("PALWORLD_RAW")


@pytest.fixture(scope="module")
def out(tmp_path_factory):
    if RAW is None or not RAW.exists():
        pytest.skip("PALWORLD_RAW not set or raw Palworld export not available")
    return run_dungeon_layouts(RAW, tmp_path_factory.mktemp("layouts"))


def _by_dungeon(out):
    idx: dict[str, dict[str, dict]] = {}
    for lay in out["layouts"]:
        idx.setdefault(lay["dungeon"], {})[lay["variant"]] = lay
    return idx


def test_layout_inventory(out):
    idx = _by_dungeon(out)
    # 140 layouts across every random-dungeon area (Test family excluded).
    assert len(out["layouts"]) == 140
    counts = {d: len(v) for d, v in idx.items()}
    assert counts == {
        "Grass001": 15, "Grass002": 15, "Forest001": 15, "Forest002": 15,
        "Dessert001": 10, "Volcano001": 10, "Snow001": 10,
        "Island001": 6, "Island002": 6, "Island003": 6,
        "Sakura001": 10, "Viking001": 20, "Yakushima001": 1, "Skyland001": 1,
    }
    # The ambiguous bare layer Dungeon_Random_Grass_02 parses as Grass001
    # variant 02 (Grass002's variants live under Dungeon_Random_Grass_02_NN).
    assert "02" in idx["Grass001"] and "02" in idx["Grass002"]


def _tiers(lay):
    t: dict[str, int] = {}
    for p in lay["points"]:
        if p["kind"] == "reward":
            t[p["sub"]] = t.get(p["sub"], 0) + 1
    return t


def test_forest001_variant04_is_the_full_room(out):
    lay = _by_dungeon(out)["Forest001"]["04"]
    assert _tiers(lay) == {"easy": 8, "medium": 3, "hard": 1, "bonus": 1}
    kinds = {p["kind"] for p in lay["points"]}
    assert {"reward", "enemy", "chest", "exit", "bossDoor"} <= kinds
    # Interior chests: regular + the guaranteed technology-book chest.
    subs = {p["sub"] for p in lay["points"] if p["kind"] == "chest"}
    assert subs == {"normal", "special"}


def test_reward_points_match_prior_derivation(out):
    idx = _by_dungeon(out)
    # Every layout that has reward points has exactly one bonus (elixir) point.
    for lay in out["layouts"]:
        tiers = _tiers(lay)
        if tiers:
            assert tiers.get("bonus") == 1, (lay["dungeon"], lay["variant"], tiers)
    # World-wide total: 293 reward spawner points.
    assert sum(sum(_tiers(l).values()) for l in out["layouts"]) == 293
    # Yakushima001 and Viking001 variants 08-10/18-20 place none.
    assert _tiers(idx["Yakushima001"]["01"]) == {}
    for v in ("08", "09", "10", "18", "19", "20"):
        assert _tiers(idx["Viking001"][v]) == {}


def test_point_shape_and_sanity(out):
    allowed = {
        "reward": {"easy", "medium", "hard", "bonus"},
        "enemy": {"normal", "floor2", "floor3", "floor4", "midBoss",
                  "fishing", "monster", "human", "boss", "base"},
        "chest": {"normal", "special"},
        "gather": {"coal", "copper", "sulfur", "quartz", "stone", "mushroom",
                   "crystal", "lotus", "junk", "fishing"},
        "exit": {None}, "bossDoor": {None},
    }
    for lay in out["layouts"]:
        assert lay["points"], (lay["dungeon"], lay["variant"])
        # Layouts with enemies always include a boss room; a handful of
        # Grass/Forest variants are enemy-free treasure rooms.
        enemies = [p for p in lay["points"] if p["kind"] == "enemy"]
        if enemies:
            assert any(p["sub"] == "boss" for p in enemies), (
                lay["dungeon"], lay["variant"])
        xs = [p["x"] for p in lay["points"]]
        ys = [p["y"] for p in lay["points"]]
        for p in lay["points"]:
            assert p["sub"] in allowed[p["kind"]], p
            assert all(isinstance(p[c], int) for c in "xyz"), p
        # One physical location per layout: bounds stay dungeon-sized.
        assert max(xs) - min(xs) < 200_000 and max(ys) - min(ys) < 200_000, (
            lay["dungeon"], lay["variant"])


def test_multifloor_collab_dungeon(out):
    lay = _by_dungeon(out)["Yakushima001"]["01"]
    subs = {p["sub"] for p in lay["points"] if p["kind"] == "enemy"}
    assert {"floor2", "floor3", "floor4", "boss"} <= subs
