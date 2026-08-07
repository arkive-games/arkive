from __future__ import annotations

from vrising.markers.portraits import (
    BOSS_PORTRAITS,
    BOSS_SMALL_PORTRAITS,
    boss_portrait_icon,
    boss_portrait_path,
)


def test_every_fixed_and_roaming_boss_has_one_unique_reviewed_portrait():
    assert len(BOSS_PORTRAITS) == 62
    assert len(set(BOSS_PORTRAITS.values())) == 62
    assert len(BOSS_SMALL_PORTRAITS) == 62
    assert len(set(BOSS_SMALL_PORTRAITS.values())) == 62


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
    assert (
        BOSS_SMALL_PORTRAITS["CHAR_Gloomrot_Monster_VBlood"]
        == "Portrait_Small_Normal_Monster2"
    )
    assert (
        BOSS_SMALL_PORTRAITS["CHAR_Manticore_VBlood"]
        == "Portrait_Small_Normal_WingedHorror2"
    )
    assert (
        BOSS_SMALL_PORTRAITS["CHAR_Cursed_MountainBeast_VBlood"]
        == "Portrait_Small_Normal_GorecrusherBehemoth2"
    )


def test_portrait_resource_path_is_stable_and_prefab_keyed():
    assert boss_portrait_path("CHAR_Gloomrot_Iva_VBlood") == (
        "bosses/CHAR_Gloomrot_Iva_VBlood.webp"
    )
    assert boss_portrait_icon("CHAR_Gloomrot_Iva_VBlood") == (
        "BossPortrait_CHAR_Gloomrot_Iva_VBlood"
    )
    assert boss_portrait_path("CHAR_Unknown_VBlood") is None
    assert boss_portrait_icon("CHAR_Unknown_VBlood") is None
