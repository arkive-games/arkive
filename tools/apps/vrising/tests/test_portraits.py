from __future__ import annotations

from vrising.markers.portraits import BOSS_PORTRAITS, boss_portrait_path


def test_every_fixed_boss_has_one_unique_reviewed_portrait():
    assert len(BOSS_PORTRAITS) == 47
    assert len(set(BOSS_PORTRAITS.values())) == 47


def test_renamed_bosses_keep_their_reviewed_internal_portrait_names():
    assert BOSS_PORTRAITS["CHAR_Gloomrot_Iva_VBlood"] == "Portrait_Large_Normal_Iva"
    assert BOSS_PORTRAITS["CHAR_Militia_Fabian_VBlood"] == "Portrait_Large_Normal_Fabian"
    assert (
        BOSS_PORTRAITS["CHAR_Blackfang_CarverBoss_VBlood"]
        == "Portrait_Large_Normal_GerardCarver"
    )
    assert (
        BOSS_PORTRAITS["CHAR_Gloomrot_RailgunSergeant_VBlood"]
        == "Portrait_Large_Normal_SergeantRailgunner"
    )


def test_portrait_resource_path_is_stable_and_prefab_keyed():
    assert boss_portrait_path("CHAR_Gloomrot_Iva_VBlood") == (
        "bosses/CHAR_Gloomrot_Iva_VBlood.webp"
    )
    assert boss_portrait_path("CHAR_Unknown_VBlood") is None
