"""Contract tests for the engraving roster, its icons and its grade strings."""

import collections

import pytest

from lostark import icons, locales
from lostark.db import Tables
from lostark.engravings import (
    BOOK_GRADES,
    BOOK_MAX_LEVEL,
    CHANNELS,
    CLASS,
    GENERAL,
    GRADE_COLOUR_KEYS,
    GRADES,
    ICONLESS,
    PENALTY_GROUP,
    STONE_ENGRAVING_GROUP,
    STONE_MAX_LEVEL,
    UI_KEYS,
    effect_values,
    extract,
    growth_code,
    growth_state,
    localization_keys,
    locate,
    reworked_ability_ids,
    slug,
    stone_level_bonus,
    stone_penalties,
)
from lostark.env import optional_dir, optional_file

TABLES = optional_dir("LOSTARK_TABLES")
ATLAS = optional_dir("LOSTARK_ICON_ATLAS")
ICON_INFO = optional_file("LOSTARK_ICON_INFO")

needs_tables = pytest.mark.skipif(
    TABLES is None or not TABLES.exists(), reason="LOSTARK_TABLES not set"
)
needs_atlas = pytest.mark.skipif(
    ATLAS is None or not ATLAS.exists(), reason="LOSTARK_ICON_ATLAS not set"
)
needs_icon_info = pytest.mark.skipif(
    ICON_INFO is None or not ICON_INFO.exists(), reason="LOSTARK_ICON_INFO not set"
)

# The growth code of "no stone, four epic books" — the cheapest state the client
# defines at stone level 0, and the row every column below is measured against.
BASE_CODE = 9  # legend 4: the state the fan site calls an engraving's "base"


def _columns(grid: dict[str, float]) -> tuple[float, list[float], list[float]]:
    """``(base, relic-book column, stone column)`` of one amp grid, as the UI dials it.

    The grid is exactly additive, so these three read out of it losslessly — which is
    what makes them comparable with the fan site's three arrays.
    """
    base = grid[str(BASE_CODE)]
    books = [round(grid[str(BASE_CODE + k)] - base, 6) for k in range(BOOK_MAX_LEVEL + 1)]
    stones = [0.0] + [
        round(grid[str(20 * s + BASE_CODE)] - base, 6) for s in range(1, STONE_MAX_LEVEL + 1)
    ]
    return base, books, stones


# Every engraving amp the client grants, as ``slug -> (base, books, stones)``.
#
# This is the drift guard: it is read straight out of BattlePoint Type 10/11 and a
# patch that moves any coefficient fails here rather than silently changing every
# score. 26 damage-dealer entries, 4 support and 1 support heal — against the fan
# site's 17 damage entries (one of which, "头击/背击", is two engravings with
# identical grids) and 5 support.
DPS_AMPS: dict[str, tuple[float, list[float], list[float]]] = {
    "adrenaline": (0.152, [0.0, 0.0105, 0.021, 0.0315, 0.042], [0.0, 0.0288, 0.036, 0.0498, 0.057]),
    "backstab_master": (
        0.153,
        [0.0, 0.007, 0.014, 0.021, 0.028],
        [0.0, 0.027, 0.034, 0.047, 0.054],
    ),
    "barricade": (0.14, [0.0, 0.0075, 0.015, 0.0225, 0.03], [0.0, 0.03, 0.0375, 0.0525, 0.06]),
    "bilitzkrieg": (0.144, [0.0, 0.006, 0.012, 0.018, 0.024], [0.0, 0.024, 0.03, 0.042, 0.048]),
    "broken_bone": (0.074, [0.0, 0.0025, 0.005, 0.0075, 0.01], [0.0, 0.008, 0.01, 0.014, 0.016]),
    "cursed_toy": (0.14, [0.0, 0.0075, 0.015, 0.0225, 0.03], [0.0, 0.03, 0.0375, 0.0525, 0.06]),
    "dagger_critical": (
        0.106,
        [0.0, 0.0053, 0.0105, 0.0158, 0.021],
        [0.0, 0.021, 0.0263, 0.0368, 0.042],
    ),
    "ether_boy": (
        0.04,
        [0.0, 0.0016, 0.0032, 0.0048, 0.0064],
        [0.0, 0.0048, 0.006, 0.0084, 0.0096],
    ),
    "ether_junkie": (0.126, [0.0, 0.009, 0.018, 0.027, 0.036], [0.0, 0.03, 0.039, 0.054, 0.06]),
    "gladiator": (
        0.0168,
        [0.0, 0.0, 0.0021, 0.0021, 0.0042],
        [0.0, 0.003, 0.0038, 0.0053, 0.006],
    ),
    "gravity_glove": (0.16, [0.0, 0.0075, 0.015, 0.0225, 0.03], [0.0, 0.03, 0.0375, 0.0525, 0.06]),
    "grinding_glove": (
        0.013,
        [0.0, 0.0008, 0.0015, 0.0023, 0.003],
        [0.0, 0.0015, 0.0019, 0.0026, 0.003],
    ),
    "grudge": (0.18, [0.0, 0.0075, 0.015, 0.0225, 0.03], [0.0, 0.03, 0.0375, 0.0525, 0.06]),
    "headattack_master": (
        0.153,
        [0.0, 0.007, 0.014, 0.021, 0.028],
        [0.0, 0.027, 0.034, 0.047, 0.054],
    ),
    "mana_efficiency": (
        0.13,
        [0.0, 0.0075, 0.015, 0.0225, 0.03],
        [0.0, 0.03, 0.0375, 0.0525, 0.06],
    ),
    "mana_flow": (0.0753, [0.0, 0.0087, 0.0176, 0.0267, 0.0358], [0.0, 0.0, 0.0, 0.0, 0.0]),
    "maneuver_attack": (
        0.098,
        [0.0, 0.0053, 0.0105, 0.0158, 0.021],
        [0.0, 0.021, 0.0263, 0.0368, 0.042],
    ),
    "matt_critical": (
        0.1439,
        [0.0, 0.0074, 0.0149, 0.0223, 0.0297],
        [0.0, 0.0279, 0.035, 0.0492, 0.0559],
    ),
    "nondirection_attack": (
        0.14,
        [0.0, 0.0075, 0.015, 0.0225, 0.03],
        [0.0, 0.03, 0.0375, 0.0525, 0.06],
    ),
    "ruthless": (0.099, [0.0, 0.0083, 0.0165, 0.0248, 0.033], [0.0, 0.024, 0.03, 0.042, 0.048]),
    "shiled_penetration": (
        0.046,
        [0.0, 0.002, 0.004, 0.006, 0.008],
        [0.0, 0.008, 0.01, 0.014, 0.016],
    ),
    "signature_move": (
        0.075,
        [0.0, 0.0038, 0.0075, 0.0113, 0.015],
        [0.0, 0.012, 0.015, 0.021, 0.024],
    ),
    "steady_state": (0.14, [0.0, 0.0075, 0.015, 0.0225, 0.03], [0.0, 0.03, 0.0375, 0.0525, 0.06]),
    "strength_master": (
        0.14,
        [0.0, 0.0075, 0.015, 0.0225, 0.03],
        [0.0, 0.03, 0.0375, 0.0525, 0.06],
    ),
    "super_charge": (0.144, [0.0, 0.006, 0.012, 0.018, 0.024], [0.0, 0.024, 0.03, 0.042, 0.048]),
    "troop_leader": (0.16, [0.0, 0.008, 0.016, 0.024, 0.032], [0.0, 0.03, 0.0376, 0.0528, 0.06]),
}

SUPPORT_AMPS: dict[str, tuple[float, list[float], list[float]]] = {
    "awakening": (0.27, [0.0, 0.0075, 0.015, 0.0225, 0.03], [0.0, 0.03, 0.0375, 0.0525, 0.06]),
    "ether_boy": (
        0.24,
        [0.0, 0.0096, 0.0192, 0.0288, 0.0384],
        [0.0, 0.0288, 0.036, 0.0504, 0.0576],
    ),
    "grinding_glove": (0.024, [0.0, 0.0, 0.0, 0.0, 0.0], [0.0, 0.009, 0.0113, 0.0158, 0.018]),
    "mana_flow": (0.14, [0.0, 0.015, 0.03, 0.045, 0.06], [0.0, 0.0, 0.0, 0.0, 0.0]),
}

SUPPORT_HEAL_AMPS: dict[str, tuple[float, list[float], list[float]]] = {
    "rescue": (0.392, [0.0, 0.014, 0.028, 0.042, 0.056], [0.0, 0.028, 0.035, 0.049, 0.056]),
}


@pytest.fixture(scope="module")
def engravings():
    return extract(Tables(TABLES))


@pytest.fixture(scope="module")
def penalties():
    return stone_penalties(Tables(TABLES))


def test_slug_drops_the_level_digit():
    # The level-1 row's name key carries a trailing 1 that is not part of the
    # engraving's identity, so ruthless1 and ruthless must not be two engravings.
    assert slug("tip.name.ability_RUTHLESS1") == "ruthless"
    assert slug("tip.name.ability_CLIMAX") == "climax"
    assert slug("tip.name.ability_gravity_Glove1") == "gravity_glove"


@needs_tables
def test_roster_is_the_general_ability_engrave_rows(engravings):
    """AbilityEngrave drives the roster, not Ability.IsEngraveAbility.

    The flag is true for 163 ability ids; 68 of those are retired engravings with
    no AbilityEngrave row. Pinned so a switch to the flag is caught here rather
    than shipping engravings the game no longer offers.

    Of the 95 AbilityEngrave rows only the 43 general ones are kept. The rework
    turned class engravings into class identities, and the client agrees: none of
    the 52 has an AbilityMapping entry, AbilitySpecification rows or a
    BattlePoint Type 10 grid.
    """
    assert len(engravings) == 43
    with Tables(TABLES).connect("Ability") as con:
        (flagged,) = con.execute(
            "SELECT COUNT(DISTINCT PrimaryKey) FROM Ability WHERE IsEngraveAbility=1"
        ).fetchone()
    assert flagged == 163


@needs_tables
def test_class_engravings_are_excluded(engravings):
    assert all(e["type"] == GENERAL for e in engravings.values())
    assert not [e for e in engravings.values() if e["type"] == CLASS]
    # No general engraving names a class.
    assert all(e["class_id"] is None for e in engravings.values())
    # The 52 excluded rows still exist upstream, so the filter is what drops
    # them rather than the source having changed.
    raw = [r for r in Tables(TABLES).read("AbilityEngrave")]
    assert len({r["PrimaryKey"] for r in raw}) == 95


@needs_tables
def test_general_engravings_have_five_levels(engravings):
    """The level count is read per engraving rather than assumed."""
    for e in engravings.values():
        expected = 5
        assert list(e["levels"]) == [str(i) for i in range(1, expected + 1)], e["slug"]
        # Engraving points rise with level; the game charges 3/6/9/12.
        points = [e["levels"][str(i)] for i in range(1, expected + 1)]
        assert points[:4] == [3, 6, 9, 12], e["slug"]


@needs_tables
def test_slugs_are_unique_and_file_safe(engravings):
    slugs = [e["slug"] for e in engravings.values()]
    assert len(set(slugs)) == 43
    assert all(s and s.replace("_", "").isalnum() and s.islower() for s in slugs)


@needs_tables
def test_role_is_only_claimed_for_class_engravings(engravings):
    """The client marks no engraving as damage or support.

    Class engravings inherit the role of their sub-class (by name, as
    lostark.classes does it); general engravings stay unmarked rather than being
    guessed at.
    """
    names = locales.resolve(Tables(TABLES), localization_keys(engravings), missing="skip")["zh-CN"]
    rows = extract(Tables(TABLES), locale_names=names)
    # Now that class engravings are excluded, NOTHING carries a role: the client
    # marks no general engraving as damage or support, and the roster is all
    # general. Which channel an engraving scores through is decided by whether it
    # has a dps or support amp grid, not by this field.
    assert all(e["role"] is None for e in rows.values())


@needs_tables
def test_every_engraving_has_a_name_and_an_icon_reference(engravings):
    assert all(e["name_key"] for e in engravings.values())
    assert all(e["icon"] for e in engravings.values())
    # IconIndex 0 means "no icon" elsewhere in Ability; no engraving relies on it,
    # which is what lets the zero-based cell mapping be used unconditionally.
    assert all(e["icon_index"] > 0 for e in engravings.values())


@needs_tables
def test_no_engraving_is_iconless(engravings):
    """Every engraving has an icon, including the four on achievement pages.

    These four used to be flagged iconless: their ``Icon`` reads ``achieve_03``
    /``04``/``06``/``08``, and no package ships an ``achieve_03_<page>`` texture, so
    an arithmetic model has nothing to address. The sprite table does not need one —
    it names the page outright (``Achieve_20`` for ``achieve_03`` 40) and the art is
    on theme: 尖刺重锤 a spiked mace, 愤怒之锤 a war hammer, 先发制人 a backstab.
    """
    assert ICONLESS == set()
    assert all(e["icon_slug"] == e["slug"] for e in engravings.values())
    assert len(engravings) == 43


@needs_tables
def test_engraving_icon_groups_are_not_all_page_prefixes(engravings):
    """The group name is a sprite-name prefix, not necessarily a page-name one.

    Buff and Ability happen to be both; achieve_03/04/06/08 are only the former.
    Pinned because it is the assumption whose failure was invisible: a group with
    no matching pages used to read as "this engraving has no icon".
    """
    groups = {e["icon"] for e in engravings.values()}
    assert groups == {"Buff", "Ability", "achieve_03", "achieve_04", "achieve_06", "achieve_08"}


def test_growth_code_packs_the_two_dials_the_way_the_client_notes_do():
    """The codes the designer notes spell out, in both directions.

    ``Ability`` 1118's ``Comment2`` reads "스톤 0 / 영웅 4 / 전설 0 / 유물 0" against
    ``OptionValue00`` 5, "…전설 1" against 6 and "…전설 4 / 유물 4" against 13, with
    stone 1 repeating the block at 25. That is the whole encoding.
    """
    assert growth_code(0, 2, 4) == 5
    assert growth_code(0, 3, 1) == 6
    assert growth_code(0, 3, 4) == 9
    assert growth_code(0, 4, 4) == 13
    assert growth_code(1, 2, 4) == 25
    assert growth_code(4, 4, 4) == 93
    for stone in range(STONE_MAX_LEVEL + 1):
        for grade in BOOK_GRADES:
            for level in range(1, BOOK_MAX_LEVEL + 1):
                code = growth_code(stone, grade, level)
                assert growth_state(code) == (stone, grade, level)
    # Codes ending in 1 are the empty state, which only the stone blocks define.
    assert growth_state(21) == (1, None, 0)
    for bad in ((5, 2, 1), (0, 1, 1), (0, 2, 5)):
        with pytest.raises(ValueError):
            growth_code(*bad)


@needs_tables
def test_only_general_engravings_have_a_reworked_ability_row(engravings):
    """AbilityMapping is what splits "has per-level numbers" from "does not".

    43 general engravings map to a reworked ("S3") ability id that carries the
    effect table and the combat-power grid; all 52 class engravings map to nothing,
    and their power reaches the score through the enlightenment rate instead.
    """
    mapped = {e["slug"] for e in engravings.values() if e["reworked_id"]}
    general = {e["slug"] for e in engravings.values() if e["type"] == GENERAL}
    assert mapped == general
    assert len(mapped) == 43
    assert all(not e["effect"] for e in engravings.values() if e["type"] == CLASS)
    assert all(not e["amp"]["dps"] for e in engravings.values() if e["type"] == CLASS)
    # AbilityMapping stores each pair both ways, 94 rows for 47 pairs: the 43 general
    # engravings plus the four stone penalties. The reworked id is id + 1000 in every
    # pair — asserted as an observation, not used as the join.
    ids = reworked_ability_ids(Tables(TABLES))
    assert len(ids) == 47
    assert all(new == old + 1000 for old, new in ids.items())
    assert sorted(set(ids) - {int(e_id) for e_id in engravings}) == [800, 801, 802, 803]
    # AbilityStoneAbilityGroup agrees: 4000 is what a stone can carve, 4010 the
    # downside it carves alongside, and the two partition the reworked ids.
    groups: dict[int, set[int]] = {STONE_ENGRAVING_GROUP: set(), PENALTY_GROUP: set()}
    for row in Tables(TABLES).read("AbilityStoneAbilityGroup"):
        if row["PrimaryKey"] in groups:
            groups[row["PrimaryKey"]].add(row["AbilityId"])
    assert groups[STONE_ENGRAVING_GROUP] == {
        int(e["reworked_id"]) for e in engravings.values() if e["reworked_id"]
    }
    assert groups[PENALTY_GROUP] == {1800, 1801, 1802, 1803}


@needs_tables
def test_amp_grid_is_five_stone_blocks_of_thirteen_codes(engravings):
    """61 cells per engraving, and the shape of the gap at stone level 0.

    Stone level 0 defines only codes 5..13 — the client does not show a partly filled
    epic set without a stone — while every stone block defines all of 1..13.
    """
    grids = [
        grid
        for e in engravings.values()
        for grid in (e["amp"]["dps"], e["amp"]["support"], e["heal_amp"]["support"])
        if grid
    ]
    assert len(grids) == 31
    for grid in grids:
        codes = sorted(int(c) for c in grid)
        assert len(codes) == 61
        by_stone: dict[int, list[int]] = {}
        for code in codes:
            stone, within = divmod(code, 20)
            by_stone.setdefault(stone, []).append(within)
        assert by_stone[0] == list(range(5, 14))
        for stone in range(1, STONE_MAX_LEVEL + 1):
            assert by_stone[stone] == list(range(1, 14))


@needs_tables
def test_amp_grid_is_exactly_additive_over_its_two_axes(engravings):
    """A two-dial UI is faithful, not an approximation.

    ``amp(stone, code) == amp(0, 9) + book delta + stone delta`` holds at every cell
    of every grid, exactly — no rounding tolerance. Only codes 5..13 can be checked,
    because stone level 0 defines no smaller code to measure a delta against.
    """
    for e in engravings.values():
        for grid in (e["amp"]["dps"], e["amp"]["support"], e["heal_amp"]["support"]):
            if not grid:
                continue
            base, books, stones = _columns(grid)
            for stone in range(STONE_MAX_LEVEL + 1):
                for step in range(BOOK_MAX_LEVEL + 1):
                    code = 20 * stone + BASE_CODE + step
                    assert round(grid[str(code)], 6) == round(
                        base + books[step] + stones[stone], 6
                    ), (e["slug"], stone, step)


@needs_tables
def test_amp_value_set_matches_the_client_exactly(engravings):
    """The drift guard: every coefficient the game grants, pinned.

    Also the fan-site cross-check. 49 of the fan site's 51 arrays are reproduced here
    cell for cell, including its non-round numbers — 尖刺重锤 (``matt_critical``)
    0.1439 with a 0.0279/0.035/0.0492/0.0559 stone column is ``ValueC`` 1439 at code 9
    and codes 29/49/69/89 minus it. Two of its arrays are fits and diverge; see
    :func:`test_the_fan_site_diverges_in_two_places`.
    """
    by_slug = {e["slug"]: e for e in engravings.values()}
    dps = {s: _columns(e["amp"]["dps"]) for s, e in by_slug.items() if e["amp"]["dps"]}
    support = {s: _columns(e["amp"]["support"]) for s, e in by_slug.items() if e["amp"]["support"]}
    heal = {
        s: _columns(e["heal_amp"]["support"])
        for s, e in by_slug.items()
        if e["heal_amp"]["support"]
    }
    assert dps == {k: (v[0], v[1], v[2]) for k, v in DPS_AMPS.items()}
    assert support == {k: (v[0], v[1], v[2]) for k, v in SUPPORT_AMPS.items()}
    assert heal == {k: (v[0], v[1], v[2]) for k, v in SUPPORT_HEAL_AMPS.items()}


@needs_tables
def test_the_fan_site_diverges_in_two_places(engravings):
    """Two fan-site engraving arrays are fits, and the client disagrees.

    * ``ether_junkie`` (以太充能) stone level 2: the fan site says 0.04 where the
      client's code 49 gives 0.039.
    * ``dagger_critical`` (精密短刀) books: the fan site extrapolates its 0.0053 step
      linearly to 0.0106/0.0159/0.0212; the client rounds each level on its own and
      gives 0.0105/0.0158/0.021.

    Pinned as divergences so a later "fix" toward the fan site is caught.
    """
    by_slug = {e["slug"]: e for e in engravings.values()}
    _, _, stones = _columns(by_slug["ether_junkie"]["amp"]["dps"])
    assert stones[2] == 0.039 != 0.04
    _, books, _ = _columns(by_slug["dagger_critical"]["amp"]["dps"])
    assert books == [0.0, 0.0053, 0.0105, 0.0158, 0.021]
    assert books != [0.0, 0.0053, 0.0106, 0.0159, 0.0212]


@needs_tables
def test_head_and_back_attack_are_two_engravings_with_one_grid(engravings):
    """The fan site's "头击/背击" is the client's two separate engravings.

    ``headattack_master`` (决斗大师) and ``backstab_master`` (奇袭大师) carry
    identical grids, which is why one merged entry reproduced both.
    """
    by_slug = {e["slug"]: e for e in engravings.values()}
    assert by_slug["headattack_master"]["amp"] == by_slug["backstab_master"]["amp"]
    assert _columns(by_slug["headattack_master"]["amp"]["dps"])[0] == 0.153


@needs_tables
def test_effect_values_are_the_tooltip_not_the_score(engravings):
    """AbilitySpecification is raw effect; BattlePoint Type 10 is combat power.

    They coincide for 怨恨 — a 15% boss-damage effect scores 0.15 — which is what
    makes the pairing legible. They do not for 尖刺重锤, whose 36% *crit damage*
    scores 0.1141. Neither table substitutes for the other.
    """
    by_slug = {e["slug"]: e for e in engravings.values()}
    for slug_, effect_base, amp_base in (("grudge", 15.0, 0.15), ("matt_critical", 36.0, 0.1141)):
        channels = {c["key"]: c for c in by_slug[slug_]["effect"]}
        assert channels["base"]["values"]["1"][0] == effect_base
        assert by_slug[slug_]["amp"]["dps"][str(growth_code(0, 2, 4))] == amp_base
    assert 15.0 / 100 == 0.15
    assert 36.0 / 100 != 0.1141


@needs_tables
def test_growth_channels_are_stone_base_legend_relic(engravings):
    """Four channels per engraving, and channel 2 never ships.

    ``SecondaryKey`` is not the grade number: 1 is the base (a full set of four epic
    books, growth code 5) and carries a single level, while 3 and 4 are the legend and
    relic increments with four levels each and 0 is the ability stone. Channel 2
    exists only on the stone-penalty abilities, where it is all zeros with blank
    GameMsg text — dropping it is what keeps the locale contract satisfied.
    """
    assert CHANNELS == {0: "stone", 1: "base", 2: "unused", 3: "legend", 4: "relic"}
    for e in engravings.values():
        if not e["effect"]:
            continue
        channels = {c["key"]: c for c in e["effect"]}
        assert set(channels) == {"stone", "base", "legend", "relic"}, e["slug"]
        assert list(channels["base"]["values"]) == ["1"]
        for key in ("stone", "legend", "relic"):
            assert list(channels[key]["values"]) == ["1", "2", "3", "4"], (e["slug"], key)
    # The raw table does carry channel 2, on the four penalties and nowhere else.
    raw = effect_values(Tables(TABLES))
    assert all("unused" not in {c["key"] for c in cs} for cs in raw.values())


@needs_tables
def test_the_stone_ladder_is_not_a_fixed_multiple_of_the_book_step(engravings):
    """[4, 5, 7, 8] is the common shape, not the rule.

    怨恨's stone column is exactly four/five/seven/eight book steps, and 11 of the
    fan site's 17 damage engravings look like that. But the unit is per-engraving:
    尖刺重锤's stone unit is 1.875 against a book step of 2.0, and 肾上腺素 drives
    its stone off a different ``SpecValue`` slot than its books. So the ladder is read
    cell by cell.
    """
    by_slug = {e["slug"]: e for e in engravings.values()}

    def ratio(name: str) -> list[float]:
        _, books, stones = _columns(by_slug[name]["amp"]["dps"])
        return [round(s / books[1], 3) for s in stones[1:]]

    assert ratio("grudge") == [4.0, 5.0, 7.0, 8.0]
    assert ratio("matt_critical") == [3.77, 4.73, 6.649, 7.554]
    assert ratio("adrenaline") == [2.743, 3.429, 4.743, 5.429]
    # And the raw effect table shows why: adrenaline's stone moves SpecValue1 while
    # its books move SpecValue2 — two different sub-effects, not one scaled ladder.
    channels = {c["key"]: c for c in by_slug["adrenaline"]["effect"]}
    assert channels["stone"]["values"]["1"] == [0.48, 0.0, 0.0, 0.0]
    assert channels["relic"]["values"]["1"] == [0.0, 1.5, 0.0, 0.0]


@needs_tables
def test_stone_penalties_are_four_abilities_and_only_one_costs_power(penalties):
    """The stone's downside, keyed by penalty level rather than by growth code.

    Three levels each (``AbilitySpecification`` pads a fourth all-zero row that no
    ``Ability`` row backs), and only the attack-power one carries a BattlePoint amp.
    """
    assert [p["slug"] for p in penalties] == ["damdown", "defdown", "atkspeeddown", "movdown"]
    assert [p["ability_id"] for p in penalties] == ["1800", "1801", "1802", "1803"]
    for penalty in penalties:
        assert list(penalty["values"]) == ["1", "2", "3"]
    scoring = {p["slug"]: p["amp"]["dps"] for p in penalties if p["amp"]["dps"]}
    assert scoring == {"damdown": {"1": -0.02, "2": -0.04, "3": -0.06}}
    assert [p["values"][level][0] for p in penalties for level in ("1", "2", "3")][:3] == [
        -2.0,
        -4.0,
        -6.0,
    ]
    # Defence down is the steepest effect and still free.
    defence = next(p for p in penalties if p["slug"] == "defdown")
    assert [defence["values"][level][0] for level in ("1", "2", "3")] == [-5.0, -10.0, -15.0]
    assert not defence["amp"]["dps"] and not defence["amp"]["support"]


@needs_tables
def test_stone_level_bonus_threshold_is_the_clients_but_its_amp_is_not():
    """AbilityStoneBase gates a flat bonus at five stone levels.

    All 58 stones share ``LevelStage00 = 5`` and ``LevelOptionId = 9100``, and the
    option is a flat ``KeyStat 150 += 150`` at every stone grade. The stat has no
    name in any table and no BattlePoint Type is keyed by it, so this ships as a raw
    stat: the fan site's 0.015 amp for it is not corroborated by the client.
    """
    bonus = stone_level_bonus(Tables(TABLES))
    assert bonus["threshold"] == 5
    assert bonus["option_id"] == "9100"
    assert list(bonus["by_grade"]) == ["2", "3", "4", "5", "6"]
    assert all(
        option == {"option_type": 2, "stat": 150, "value": 150}
        for option in bonus["by_grade"].values()
    )


@needs_tables
def test_every_key_resolves_in_every_locale(engravings, penalties):
    keys = localization_keys(engravings, penalties)
    assert len(keys) == 438
    got = locales.resolve(Tables(TABLES), keys, missing="skip")
    assert set(got) == {"zh-CN", "ko-KR"}
    for locale, table in got.items():
        missing = [k for k in keys if k not in table]
        assert not missing, f"{locale} is missing {len(missing)}: {missing[:5]}"
        blank = [k for k in keys if not table[k].strip()]
        assert not blank, f"{locale} has blank text for {blank[:5]}"


@needs_tables
def test_no_description_is_left_as_a_template_directive(engravings):
    """Every general engraving's description resolves fully.

    Four descriptions DID embed runtime table lookups this pipeline cannot
    finish - ARTHETINE1, MADNESS1, RETURN1, SURA1 - but all four were class
    engravings, which the roster no longer includes. Pinned the other way now, so
    a caller can ship these as display strings, and so a regression that
    reintroduces an unresolved directive is caught.
    """
    keys = localization_keys(engravings)
    table = locales.resolve(Tables(TABLES), keys, missing="skip")["zh-CN"]
    assert sorted(k for k in keys if locales.has_template(table[k])) == []


@needs_tables
def test_grade_names_carry_the_grade_colour_from_the_client():
    """The grade colour comes from GameMsg, never from a hex typed in here.

    sys.engrave.name_color_grade_<n> wraps a name in grade n's colour, and the
    grade's own label is coloured the same way — except grade 1, whose label the
    client prints white while colouring names blue. That asymmetry is the client's,
    so it is asserted rather than smoothed over.
    """
    keys = [str(g["name_key"]) for g in GRADES] + list(GRADE_COLOUR_KEYS.values())
    table = locales.resolve(Tables(TABLES), keys, missing="skip")["zh-CN"]
    colours = {g["grade"]: table[GRADE_COLOUR_KEYS[g["grade"]]] for g in GRADES}
    assert colours[2].startswith("<c #ce43fc>")
    assert colours[3].startswith("<c #fe9600>")
    assert colours[4].startswith("<c #ff6000>")
    assert colours[1].startswith("<c #00b5ff>")
    for grade in (2, 3, 4):
        name = table[str(next(g for g in GRADES if g["grade"] == grade)["name_key"])]
        assert name.startswith(colours[grade][: len("<c #xxxxxx>")]), (grade, name)
    assert table["sys.tooltip.engrave_grade_rare"].startswith("<c #ffffff>")


@needs_tables
def test_stone_strings_are_the_clients_own_number_formats():
    table = locales.resolve(Tables(TABLES), list(UI_KEYS.values()), missing="skip")["zh-CN"]
    # The panel counts a stone by level, not by grade, and colours success blue
    # and penalty red.
    assert "{0}" in table[UI_KEYS["stone_level"]]
    assert "#00b5ff" in table[UI_KEYS["stone_level"]]
    assert "#c24b46" in table[UI_KEYS["stone_penalty_level"]]
    # A grade has stages inside it: "{0}阶段刻印".
    assert "{0}" in table[UI_KEYS["stage"]]
    assert "{0}" in table[UI_KEYS["grade_and_stage"]] and "{1}" in table[UI_KEYS["grade_and_stage"]]


@needs_atlas
@needs_icon_info
def test_locate_reads_the_sprite_table_not_a_cell_grid():
    """The three ways the old arithmetic went wrong, pinned as one test.

    * 怨恨 is ``Buff`` 71 and its art — the demon hound head, confirmed in game — is
      at (320, 256) on ``buff_0``, i.e. row 4 column 5. A flat 16x16 walk puts index
      71 at (448, 256), two cells later, because ``Buff_61``/``Buff_62`` are stored
      on ``buff_3``.
    * ``handgunner`` is ``Buff`` 600 (the crossed revolvers) and lives on ``buff_3``,
      not on the ``buff_2`` the cumulative walk computed.
    * The ``achieve_*`` groups are not pages at all: ``achieve_03`` 40 is a 128x128
      sprite on page ``Achieve_20``.
    """
    page, box = locate(ATLAS, ICON_INFO, "Buff", 71)
    assert page.stem == "buff_0"
    assert box == (320, 256, 384, 320)

    page, box = locate(ATLAS, ICON_INFO, "Buff", 600)
    assert page.stem == "buff_3"
    assert box == (640, 192, 704, 256)

    page, box = locate(ATLAS, ICON_INFO, "achieve_03", 40)
    assert page.stem.lower() == "achieve_20"
    assert box == (256, 256, 384, 384)

    # A group/index the table does not define resolves to nothing rather than to a
    # cell computed off the end of a page.
    assert locate(ATLAS, ICON_INFO, "Buff", 912) is None
    assert locate(ATLAS, ICON_INFO, "Buff", 258) is None


@needs_atlas
@needs_icon_info
@needs_tables
def test_every_engraving_resolves_to_a_sprite(engravings):
    """All 95, with no ICONLESS survivors.

    The seven ``achieve_*``/``GL_Skill_01`` engravings were previously reported as
    having no exported atlas; they resolve to 128x128 sprites on the ``Achieve_*``
    pages (except ``free_bombardment``, a 64x64 on ``GL_Skill_0``).
    """
    assert ICONLESS == set()
    sizes = set()
    for e in engravings.values():
        found = locate(ATLAS, ICON_INFO, e["icon"], e["icon_index"])
        assert found is not None, (e["slug"], e["icon"], e["icon_index"])
        assert e["icon_slug"] == e["slug"], e["slug"]
        _page, (x0, y0, x1, y1) = found
        sizes.add((x1 - x0, y1 - y0))
    assert sizes == {(64, 64), (128, 128)}


@needs_atlas
@needs_icon_info
@needs_tables
def test_engraving_icons_span_seven_atlas_pages(engravings):
    """Kept as a shape check, no longer as a "verified region" claim.

    The old note here treated ``buff_0`` as the only trustworthy page, because the
    only semantic evidence sat on it, and expected everything else to follow one
    flat walk from there. The sprite table scatters the 43 icons over seven pages in
    two packages — and two of the 29 ``Buff``-group engravings land on ``buff_3``,
    which no cumulative walk over 64x64 cells would ever reach for an index below
    256.
    """
    sprites = icons.sprite_table(ICON_INFO)
    pages = icons.pages(ATLAS)
    spread = collections.Counter(
        icons.locate(sprites, pages, e["icon"], e["icon_index"])[0].stem
        for e in engravings.values()
    )
    assert dict(spread) == {
        "buff_0": 27,
        "buff_3": 2,
        "ability_0": 10,
        "achieve_3": 1,
        "achieve_4": 1,
        "achieve_7": 1,
        "achieve_20": 1,
    }
    assert len([e for e in engravings.values() if e["icon"] == "Buff"]) == 29
