"""Reviewed V Blood prefab-to-portrait mappings from the shipped game assets."""

from __future__ import annotations


# V Blood display names and portrait texture stems evolved independently. Most
# pairs still share a recognizable name, while renamed bosses retain an older
# internal portrait stem (for example Ziva/Iva and Sir Erwin/Fabian). Keeping
# the reviewed relationship explicit prevents fuzzy matching from assigning a
# plausible but incorrect face after a game update.
BOSS_PORTRAITS: dict[str, str] = {
    "CHAR_ArchMage_VBlood": "Portrait_Large_Normal_MairwynElementalist",
    "CHAR_Bandit_Bomber_VBlood": "Portrait_Large_Normal_CliveFirestarter",
    "CHAR_Bandit_Chaosarrow_VBlood": "Portrait_Large_Normal_LidiaChaosArcher",
    "CHAR_Bandit_Fisherman_VBlood": "Portrait_Large_Normal_Fisherman",
    "CHAR_Bandit_Foreman_VBlood": "Portrait_Large_Normal_RufusForeman",
    "CHAR_Bandit_Frostarrow_VBlood": "Portrait_Large_Normal_KeelyFrostArcher",
    "CHAR_Bandit_Stalker_VBlood": "Portrait_Large_Normal_GraysonArmourer",
    "CHAR_Bandit_StoneBreaker_VBlood": "Portrait_Large_Normal_ErrolStonebreaker",
    "CHAR_Bandit_Tourok_VBlood": "Portrait_Large_Normal_QuinceyBanditKing",
    "CHAR_BatVampire_VBlood": "Portrait_Large_Normal_NightmarshalStyxSunderer",
    "CHAR_Blackfang_CarverBoss_VBlood": "Portrait_Large_Normal_GerardCarver",
    "CHAR_Blackfang_Livith_VBlood": "Portrait_Large_Normal_Livith",
    "CHAR_Blackfang_Lucie_VBlood": "Portrait_Large_Normal_Lucie",
    "CHAR_Blackfang_Morgana_VBlood": "Portrait_Large_Normal_Morgana",
    "CHAR_Blackfang_Valyr_VBlood": "Portrait_Large_Normal_ForgeBinder",
    "CHAR_ChurchOfLight_Cardinal_VBlood": "Portrait_Large_Normal_AzarielSunbringer",
    "CHAR_ChurchOfLight_Overseer_VBlood": "Portrait_Large_Normal_Overseer",
    "CHAR_ChurchOfLight_Paladin_VBlood": "Portrait_Large_Normal_SolarusImmaculate",
    "CHAR_ChurchOfLight_Sommelier_VBlood": "Portrait_Large_Normal_Sommelier",
    "CHAR_Cursed_ToadKing_VBlood": "Portrait_Large_Normal_DukeBalaton",
    "CHAR_Cursed_Witch_VBlood": "Portrait_Large_Normal_MatkaCurseWeaver",
    "CHAR_Cursed_MountainBeast_VBlood": "Portrait_Large_Normal_GorecrusherBehemoth",
    "CHAR_Forest_Bear_Dire_Vblood": "Portrait_Large_Normal_FerociousBear",
    "CHAR_Forest_Wolf_VBlood": "Portrait_Large_Normal_AlphaWolf",
    "CHAR_Geomancer_Human_VBlood": "Portrait_Large_Normal_TerahGeomancer",
    "CHAR_Gloomrot_Iva_VBlood": "Portrait_Large_Normal_Iva",
    "CHAR_Gloomrot_Monster_VBlood": "Portrait_Large_Normal_Monster",
    "CHAR_Gloomrot_Purifier_VBlood": "Portrait_Large_Normal_Purifier",
    "CHAR_Gloomrot_RailgunSergeant_VBlood": "Portrait_Large_Normal_SergeantRailgunner",
    "CHAR_Gloomrot_TheProfessor_VBlood": "Portrait_Large_Normal_Professor",
    "CHAR_Gloomrot_Voltage_VBlood": "Portrait_Large_Normal_Voltage",
    "CHAR_Harpy_Matriarch_VBlood": "Portrait_Large_Normal_MorianStormwingMatriarch",
    "CHAR_Manticore_VBlood": "Portrait_Large_Normal_WingedHorror",
    "CHAR_Militia_BishopOfDunley_VBlood": "Portrait_Large_Normal_RazielShepherd",
    "CHAR_Militia_Fabian_VBlood": "Portrait_Large_Normal_Fabian",
    "CHAR_Militia_Glassblower_VBlood": "Portrait_Large_Normal_Glassblower",
    "CHAR_Militia_Leader_VBlood": "Portrait_Large_Normal_OctavianMilitiaCaptain",
    "CHAR_Militia_Guard_VBlood": "Portrait_Large_Normal_VincentFrostbringer",
    "CHAR_Militia_Longbowman_LightArrow_Vblood": "Portrait_Large_Normal_MeredithBrightArcher",
    "CHAR_Militia_Nun_VBlood": "Portrait_Large_Normal_ChristinaSunPriestess",
    "CHAR_Militia_Scribe_VBlood": "Portrait_Large_Normal_Scholar",
    "CHAR_Poloma_VBlood": "Portrait_Large_Normal_PoloraFeywalker",
    "CHAR_Spider_Queen_VBlood": "Portrait_Large_Normal_UngoraSpiderQueen",
    "CHAR_Undead_ArenaChampion_VBlood": "Portrait_Large_Normal_ArenaChampion",
    "CHAR_Undead_BishopOfShadows_VBlood": "Portrait_Large_Normal_LeandraShadowPriestess",
    "CHAR_Undead_BishopOfDeath_VBlood": "Portrait_Large_Normal_GoreswineRavager",
    "CHAR_Undead_CursedSmith_VBlood": "Portrait_Large_Normal_CursedSmith",
    "CHAR_Undead_Priest_VBlood": "Portrait_Large_Normal_NicholausFallen",
    "CHAR_Undead_Infiltrator_VBlood": "Portrait_Large_Normal_ShadowInfiltrator",
    "CHAR_Undead_Leader_Vblood": "Portrait_Large_Normal_UndeadGeneral",
    "CHAR_Undead_ZealousCultist_VBlood": "Portrait_Large_Normal_FoulrotSoultaker",
    "CHAR_Vampire_BloodKnight_VBlood": "Portrait_Large_Normal_BloodCommander",
    "CHAR_Vampire_HighLord_VBlood": "Portrait_Large_Normal_UnholyCommander",
    "CHAR_Vampire_IceRanger_VBlood": "Portrait_Large_Normal_FrostCommander",
    "CHAR_VHunter_CastleMan": "Portrait_Large_Normal_PMK01",
    "CHAR_VHunter_Jade_VBlood": "Portrait_Large_Normal_JadeVampireHunter",
    "CHAR_VHunter_Leader_VBlood": "Portrait_Large_Normal_TristanVampireHunter",
    "CHAR_Villager_CursedWanderer_VBlood": "Portrait_Large_Normal_CursedWanderer",
    "CHAR_Villager_Tailor_VBlood": "Portrait_Large_Normal_BeatriceTailor",
    "CHAR_WerewolfChieftain_Human": "Portrait_Large_Normal_WillfredWerewolfChief",
    "CHAR_Winter_Yeti_VBlood": "Portrait_Large_Normal_TerrorclawOgre",
    "CHAR_Wendigo_VBlood": "Portrait_Large_Normal_FrostmawMountainTerror",
}

BOSS_SMALL_PORTRAIT_OVERRIDES = {
    "CHAR_Cursed_MountainBeast_VBlood": "Portrait_Small_Normal_GorecrusherBehemoth2",
    "CHAR_Gloomrot_Monster_VBlood": "Portrait_Small_Normal_Monster2",
    "CHAR_Manticore_VBlood": "Portrait_Small_Normal_WingedHorror2",
}
BOSS_SMALL_PORTRAITS = {
    prefab_name: BOSS_SMALL_PORTRAIT_OVERRIDES.get(
        prefab_name,
        texture_stem.replace("Portrait_Large_", "Portrait_Small_", 1),
    )
    for prefab_name, texture_stem in BOSS_PORTRAITS.items()
}
BOSS_PORTRAIT_ICON_PREFIX = "BossPortrait_"


def boss_portrait_path(prefab_name: str) -> str | None:
    """Resource-relative WebP path for a reviewed fixed V Blood portrait."""
    if prefab_name not in BOSS_PORTRAITS:
        return None
    return f"bosses/{prefab_name}.webp"


def boss_portrait_icon(prefab_name: str) -> str | None:
    """Marker-icon stem for a reviewed fixed V Blood portrait."""
    if prefab_name not in BOSS_PORTRAITS:
        return None
    return f"{BOSS_PORTRAIT_ICON_PREFIX}{prefab_name}"


__all__ = [
    "BOSS_PORTRAITS",
    "BOSS_PORTRAIT_ICON_PREFIX",
    "BOSS_SMALL_PORTRAITS",
    "boss_portrait_icon",
    "boss_portrait_path",
]
