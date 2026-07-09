import os
from pathlib import Path

import pytest

from palworld.catalog import run_catalog

RAW = Path(os.environ.get("PALWORLD_RAW", "E:/SteamLibrary/steamapps/common/Palworld/Exports/Pal/Content/Pal"))
# Reuse the already-populated resource repo so `convert()` no-ops on existing
# .webp files — this integration test asserts linking, not icons, and a cold
# icon conversion of the full catalog is prohibitively slow.
RES = Path(os.environ.get("PALWORLD_RES_OUT", "E:/arkive-games/resource-palworld"))


@pytest.mark.skipif(not RAW.exists(), reason="raw Palworld export not available")
def test_tech_building_unlock_casing(tmp_path):
    """A tech's UnlockBuildObjects entry must link even when its casing differs
    from the building DataTable row key.

    `Workbench` (the level-1 "Primitive Workbench" tech) references building
    `Workbench`, but the emitted building id is `WorkBench`. The case-sensitive
    membership test silently dropped the unlock, so the tech linked to nothing.
    """
    data_out = tmp_path / "data"
    res_out = RES if RES.exists() else tmp_path / "res"
    out = run_catalog(RAW, data_out, res_out)
    techs = {t["id"]: t for t in out["techs"]}
    buildings = {b["id"]: b for b in out["buildings"]}

    assert "WorkBench" in buildings  # emitted casing
    # Forward link: tech → building (canonical, emitted casing).
    assert techs["Workbench"]["unlockBuildings"] == ["WorkBench"]
    # Reverse cross-link is kept in sync.
    assert "Workbench" in buildings["WorkBench"].get("unlockTech", [])


@pytest.mark.skipif(not RAW.exists(), reason="raw Palworld export not available")
def test_item_override_name_included(tmp_path):
    """An item whose name lives under `OverrideName` (a differently-keyed text
    row) must still be emitted and linked from its tech.

    `GrapplingGun` has `OverrideName = ITEM_NAME_GrapplingGun_1`, so its name is
    keyed `GrapplingGun_1`, not `GrapplingGun`. The id-convention-only name
    lookup dropped it from the item set, so the tech unlocking it linked nothing.
    """
    data_out = tmp_path / "data"
    res_out = RES if RES.exists() else tmp_path / "res"
    out = run_catalog(RAW, data_out, res_out)
    item_ids = {i["id"] for i in out["items"]}
    techs = {t["id"]: t for t in out["techs"]}

    assert "GrapplingGun" in item_ids
    assert techs["GrapplingGun"]["unlockItems"] == ["GrapplingGun"]

    import json

    zh = json.loads((data_out / "locales/zh-CN/items.json").read_text(encoding="utf-8"))
    assert zh["GrapplingGun"]["name"] == "爪钩枪"


@pytest.mark.skipif(not RAW.exists(), reason="raw Palworld export not available")
def test_item_name_key_casing(tmp_path):
    """An item whose name-table key differs only in casing from the item id must
    still be emitted.

    Item id `FlameThrower` has no `OverrideName`; its name lives under key
    `Flamethrower` (lowercase t). The case-sensitive lookup dropped it.
    """
    data_out = tmp_path / "data"
    res_out = RES if RES.exists() else tmp_path / "res"
    out = run_catalog(RAW, data_out, res_out)
    item_ids = {i["id"] for i in out["items"]}

    assert "FlameThrower" in item_ids


@pytest.mark.skipif(not RAW.exists(), reason="raw Palworld export not available")
def test_tech_recipe_id_casing(tmp_path):
    """A tech's UnlockItemRecipes id must resolve even when its casing differs
    from the recipe table key.

    `Battle_RangeWeapon_Bow3` references recipe `Bow_triple`, but the recipe key
    is `Bow_Triple`; the case-sensitive lookup left the tech linking nothing.
    """
    data_out = tmp_path / "data"
    res_out = RES if RES.exists() else tmp_path / "res"
    out = run_catalog(RAW, data_out, res_out)
    techs = {t["id"]: t for t in out["techs"]}

    assert techs["Battle_RangeWeapon_Bow3"]["unlockItems"] == ["Bow_Triple"]
    assert techs["SkillUnlock_SakuraSaurus_Water"]["unlockItems"] == ["SkillUnlock_SakuraSaurus_Water"]


@pytest.mark.skipif(not RAW.exists(), reason="raw Palworld export not available")
def test_effigies_included_despite_illegal_flag(tmp_path):
    """Effigies (Relic, Relic_01..Relic_12) are flagged bLegalInGame=False — they
    can't sit in inventory as tradeable goods, you consume them at the Statue of
    Power — but are real collectible items players hold, so they must appear in
    the item list. The cut Key Spheres share the same Essential type and illegal
    flag yet are unreleased content (rank 0, no recipe/markers) and stay excluded.
    """
    data_out = tmp_path / "data"
    res_out = RES if RES.exists() else tmp_path / "res"
    out = run_catalog(RAW, data_out, res_out)
    item_ids = {i["id"] for i in out["items"]}

    assert "Relic" in item_ids      # base Lifmunk Effigy
    assert "Relic_01" in item_ids   # Lamball Effigy
    assert "Relic_12" in item_ids   # Mimog Effigy
    # Cut/unreleased content sharing the same Essential type + illegal flag stays
    # out — the whitelist keys on the exact Relic ids, not the shared flag.
    assert "KeySphere_01" not in item_ids

    relic = next(i for i in out["items"] if i["id"] == "Relic")
    assert relic["typeA"] == "Essential"
