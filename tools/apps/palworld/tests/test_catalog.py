import pytest

from palworld.catalog import run_catalog
from palworld.env import optional_dir

RAW = optional_dir("PALWORLD_RAW")
# Reuse the already-populated resource repo so `convert()` no-ops on existing
# .webp files — this integration test asserts linking, not icons, and a cold
# icon conversion of the full catalog is prohibitively slow.
RES = optional_dir("PALWORLD_RES_OUT")


@pytest.mark.skipif(RAW is None or not RAW.exists(), reason="PALWORLD_RAW not set or raw Palworld export not available")
def test_tech_building_unlock_casing(tmp_path):
    """A tech's UnlockBuildObjects entry must link even when its casing differs
    from the building DataTable row key.

    `Workbench` (the level-1 "Primitive Workbench" tech) references building
    `Workbench`, but the emitted building id is `WorkBench`. The case-sensitive
    membership test silently dropped the unlock, so the tech linked to nothing.
    """
    data_out = tmp_path / "data"
    res_out = RES if RES and RES.exists() else tmp_path / "res"
    out = run_catalog(RAW, data_out, res_out)
    techs = {t["id"]: t for t in out["techs"]}
    buildings = {b["id"]: b for b in out["buildings"]}

    assert "WorkBench" in buildings  # emitted casing
    # Forward link: tech → building (canonical, emitted casing).
    assert techs["Workbench"]["unlockBuildings"] == ["WorkBench"]
    # Reverse cross-link is kept in sync.
    assert "Workbench" in buildings["WorkBench"].get("unlockTech", [])


@pytest.mark.skipif(RAW is None or not RAW.exists(), reason="PALWORLD_RAW not set or raw Palworld export not available")
def test_item_override_name_included(tmp_path):
    """An item whose name lives under `OverrideName` (a differently-keyed text
    row) must still be emitted and linked from its tech.

    `GrapplingGun` has `OverrideName = ITEM_NAME_GrapplingGun_1`, so its name is
    keyed `GrapplingGun_1`, not `GrapplingGun`. The id-convention-only name
    lookup dropped it from the item set, so the tech unlocking it linked nothing.
    """
    data_out = tmp_path / "data"
    res_out = RES if RES and RES.exists() else tmp_path / "res"
    out = run_catalog(RAW, data_out, res_out)
    item_ids = {i["id"] for i in out["items"]}
    techs = {t["id"]: t for t in out["techs"]}

    assert "GrapplingGun" in item_ids
    assert techs["GrapplingGun"]["unlockItems"] == ["GrapplingGun"]

    import json

    zh = json.loads((data_out / "locales/zh-CN/items.json").read_text(encoding="utf-8"))
    assert zh["GrapplingGun"]["name"] == "爪钩枪"


@pytest.mark.skipif(RAW is None or not RAW.exists(), reason="PALWORLD_RAW not set or raw Palworld export not available")
def test_item_name_key_casing(tmp_path):
    """An item whose name-table key differs only in casing from the item id must
    still be emitted.

    Item id `FlameThrower` has no `OverrideName`; its name lives under key
    `Flamethrower` (lowercase t). The case-sensitive lookup dropped it.
    """
    data_out = tmp_path / "data"
    res_out = RES if RES and RES.exists() else tmp_path / "res"
    out = run_catalog(RAW, data_out, res_out)
    item_ids = {i["id"] for i in out["items"]}

    assert "FlameThrower" in item_ids


@pytest.mark.skipif(RAW is None or not RAW.exists(), reason="PALWORLD_RAW not set or raw Palworld export not available")
def test_tech_recipe_id_casing(tmp_path):
    """A tech's UnlockItemRecipes id must resolve even when its casing differs
    from the recipe table key.

    `Battle_RangeWeapon_Bow3` references recipe `Bow_triple`, but the recipe key
    is `Bow_Triple`; the case-sensitive lookup left the tech linking nothing.
    """
    data_out = tmp_path / "data"
    res_out = RES if RES and RES.exists() else tmp_path / "res"
    out = run_catalog(RAW, data_out, res_out)
    techs = {t["id"]: t for t in out["techs"]}

    assert techs["Battle_RangeWeapon_Bow3"]["unlockItems"] == ["Bow_Triple"]
    assert techs["SkillUnlock_SakuraSaurus_Water"]["unlockItems"] == ["SkillUnlock_SakuraSaurus_Water"]


@pytest.mark.skipif(RAW is None or not RAW.exists(), reason="PALWORLD_RAW not set or raw Palworld export not available")
def test_dropped_by_boss_annotation(tmp_path):
    """`droppedBy` is an annotated `{id, isBoss?}` list inverted from the pal
    encyclopedia's `drops` + `bossDrops`. A pal that drops the item in its base
    form counts as a normal drop (no flag) even if the boss form drops it too;
    boss-only drops are flagged `isBoss`.
    """
    from palworld.encyclopedia import run_encyclopedia

    data_out = tmp_path / "data"
    res_out = RES if RES and RES.exists() else tmp_path / "res"
    run_encyclopedia(RAW, data_out, res_out)  # catalog inverts pals.json
    out = run_catalog(RAW, data_out, res_out)
    by_id = {i["id"]: i for i in out["items"]}

    # Base drop: Anubis drops Bone in its wild form — unflagged entry.
    bone = {e["id"]: e for e in by_id["Bone"]["droppedBy"]}
    assert "Anubis" in bone and "isBoss" not in bone["Anubis"]

    # Boss-only drops exist somewhere (rare schematics etc.) and are flagged.
    assert any(e.get("isBoss") for i in out["items"] for e in i.get("droppedBy", []))
    """Every named item is imported, including bLegalInGame=False ones. Dead
    data (deprecated dupes, debug rows) is stamped `illegal: True` so the
    frontend drops it, but effigies and main-quest Key Spheres are real
    obtainable collectibles — whitelisted, emitted without the flag.
    """
    data_out = tmp_path / "data"
    res_out = RES if RES and RES.exists() else tmp_path / "res"
    out = run_catalog(RAW, data_out, res_out)
    by_id = {i["id"]: i for i in out["items"]}

    # Whitelisted bLegalInGame=False items: imported, NOT flagged.
    for iid in ("Relic", "Relic_01", "Relic_12", "KeySphere_01", "KeySphere_08"):
        assert iid in by_id, iid
        assert "illegal" not in by_id[iid], iid

    # Non-whitelisted illegal rows (deprecated/debug data) keep the flag.
    for iid in ("Bow_Poison", "MagnumBullet"):
        assert iid in by_id, iid
        assert by_id[iid]["illegal"] is True, iid

    # Legal items are imported without the flag.
    assert "illegal" not in by_id["GrapplingGun"]
    # The flag never lies about a legal item.
    assert not any(i.get("illegal") for i in out["items"] if i["id"] == "GrapplingGun")
