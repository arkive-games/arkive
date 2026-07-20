"""Unit tests for the pure icon-matching helpers (no game paks needed)."""

from palworld.breeding import _is_roster
from palworld.maps.emit import _pal_icon


def _names(cid: str) -> dict:
    # _is_roster needs a real English name for the id. Name-table keys are
    # lowercased (see breeding._pal_name); en-US + ja-JP fallback are indexed.
    return {"en-US": {cid.lower(): "Some Name"}, "ja-JP": {}}


def test_is_roster_icon_match_is_case_insensitive():
    # The pak stores this icon lowercase ("T_Thunderdog_Ice..."), the pal id is
    # uppercase ("ThunderDog_Ice"). UE resolves case-insensitively, so the roster
    # gate must too — otherwise the whole pal is dropped.
    row = {"IsPal": True, "CombiRank": 100}
    stems_lower = {"t_thunderdog_ice_icon_normal"}
    assert _is_roster("ThunderDog_Ice", row, _names("ThunderDog_Ice"), stems_lower)


def test_is_roster_exact_case_still_matches():
    row = {"IsPal": True, "CombiRank": 100}
    stems_lower = {"t_sheepball_icon_normal"}
    assert _is_roster("SheepBall", row, _names("SheepBall"), stems_lower)


def test_is_roster_missing_icon_still_dropped():
    row = {"IsPal": True, "CombiRank": 100}
    assert not _is_roster("NoIconPal", row, _names("NoIconPal"), {"t_sheepball_icon_normal"})


def test_pal_icon_case_insensitive_returns_canonical_stem():
    # Membership is case-insensitive, but the returned stem keeps canonical casing
    # so it matches the webp the breeding stage writes (T_<cid>_icon_normal.webp).
    pal_icons_lower = {"t_thunderdog_ice_icon_normal"}
    assert _pal_icon(pal_icons_lower, "ThunderDog_Ice") == "T_ThunderDog_Ice_icon_normal"
    assert _pal_icon(pal_icons_lower, "Missing") is None
