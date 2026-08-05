"""Contract tests for the engraving roster, its icons and its grade strings."""

import pytest

from lostark import locales
from lostark.db import Tables
from lostark.engravings import (
    CELL,
    CLASS,
    GENERAL,
    GRADE_COLOUR_KEYS,
    GRADES,
    ICONLESS,
    UI_KEYS,
    atlas_pages,
    cell_box,
    extract,
    localization_keys,
    locate,
    slug,
)
from lostark.env import optional_dir

TABLES = optional_dir("LOSTARK_TABLES")
ATLAS = optional_dir("LOSTARK_ICON_ATLAS")

needs_tables = pytest.mark.skipif(
    TABLES is None or not TABLES.exists(), reason="LOSTARK_TABLES not set"
)
needs_atlas = pytest.mark.skipif(
    ATLAS is None or not ATLAS.exists(), reason="LOSTARK_ICON_ATLAS not set"
)


@pytest.fixture(scope="module")
def engravings():
    return extract(Tables(TABLES))


def test_slug_drops_the_level_digit():
    # The level-1 row's name key carries a trailing 1 that is not part of the
    # engraving's identity, so ruthless1 and ruthless must not be two engravings.
    assert slug("tip.name.ability_RUTHLESS1") == "ruthless"
    assert slug("tip.name.ability_CLIMAX") == "climax"
    assert slug("tip.name.ability_gravity_Glove1") == "gravity_glove"


@needs_tables
def test_roster_is_the_ninety_five_ability_engrave_rows(engravings):
    """AbilityEngrave drives the roster, not Ability.IsEngraveAbility.

    The flag is true for 163 ability ids; 68 of those are retired engravings with
    no AbilityEngrave row. Pinned so a switch to the flag is caught here rather
    than shipping engravings the game no longer offers.
    """
    assert len(engravings) == 95
    with Tables(TABLES).connect("Ability") as con:
        (flagged,) = con.execute(
            "SELECT COUNT(DISTINCT PrimaryKey) FROM Ability WHERE IsEngraveAbility=1"
        ).fetchone()
    assert flagged == 163


@needs_tables
def test_general_and_class_engravings_split_as_the_client_does(engravings):
    general = [e for e in engravings.values() if e["type"] == GENERAL]
    klass = [e for e in engravings.values() if e["type"] == CLASS]
    assert len(general) == 43
    assert len(klass) == 52
    # Only class engravings name a class, and every one of them does.
    assert all(e["class_id"] is None for e in general)
    assert all(e["class_id"] for e in klass)


@needs_tables
def test_general_engravings_have_five_levels_and_class_engravings_four(engravings):
    """The level count is read per engraving because the two kinds differ."""
    for e in engravings.values():
        expected = 5 if e["type"] == GENERAL else 4
        assert list(e["levels"]) == [str(i) for i in range(1, expected + 1)], e["slug"]
        # Engraving points rise with level; the game charges 3/6/9/12.
        points = [e["levels"][str(i)] for i in range(1, expected + 1)]
        assert points[:4] == [3, 6, 9, 12], e["slug"]


@needs_tables
def test_slugs_are_unique_and_file_safe(engravings):
    slugs = [e["slug"] for e in engravings.values()]
    assert len(set(slugs)) == 95
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
    assert all(e["role"] is None for e in rows.values() if e["type"] == GENERAL)
    roles = {e["role"] for e in rows.values() if e["type"] == CLASS}
    assert roles == {"dps", "support"}
    supports = sorted(e["slug"] for e in rows.values() if e["role"] == "support")
    assert supports == ["bless", "fullbloom", "monsoon", "urgentrescue"]


@needs_tables
def test_every_engraving_has_a_name_and_an_icon_reference(engravings):
    assert all(e["name_key"] for e in engravings.values())
    assert all(e["icon"] for e in engravings.values())
    # IconIndex 0 means "no icon" elsewhere in Ability; no engraving relies on it,
    # which is what lets the zero-based cell mapping be used unconditionally.
    assert all(e["icon_index"] > 0 for e in engravings.values())


@needs_tables
def test_iconless_engravings_are_exactly_the_two_unexported_groups(engravings):
    """Seven engravings point at atlas groups no package ships.

    achieve_03/04/06/07/08 and GL_Skill_01 have no <group>_<page> textures in any
    of the 22 EFUI_ICONATLAS_* packages. They are flagged rather than pointed at
    the similarly named achievement sheets, whose cells hold unrelated art.
    """
    missing = {e["slug"] for e in engravings.values() if e["icon_slug"] is None}
    assert missing == ICONLESS
    groups = {e["icon"] for e in engravings.values() if e["icon_slug"] is None}
    assert groups == {
        "achieve_03",
        "achieve_04",
        "achieve_06",
        "achieve_07",
        "achieve_08",
        "GL_Skill_01",
    }
    # Everything else resolves, and its slug is its file name.
    assert all(e["icon_slug"] == e["slug"] for e in engravings.values() if e["icon_slug"])
    assert len(engravings) - len(missing) == 88


@needs_tables
def test_the_two_icon_groups_that_do_resolve_are_buff_and_ability(engravings):
    groups = {e["icon"] for e in engravings.values() if e["icon_slug"]}
    assert groups == {"Buff", "Ability"}


@needs_tables
def test_every_key_resolves_in_every_locale(engravings):
    keys = localization_keys(engravings)
    got = locales.resolve(Tables(TABLES), keys, missing="skip")
    assert set(got) == {"zh-CN", "ko-KR"}
    for locale, table in got.items():
        missing = [k for k in keys if k not in table]
        assert not missing, f"{locale} is missing {len(missing)}: {missing[:5]}"
        blank = [k for k in keys if not table[k].strip()]
        assert not blank, f"{locale} has blank text for {blank[:5]}"


@needs_tables
def test_four_descriptions_are_still_template_directives(engravings):
    """Four engraving descriptions embed runtime table lookups.

    They resolve to text containing <$…> directives this pipeline cannot finish,
    so a caller must not ship them as display strings. Pinned so the count moving
    is noticed either way.
    """
    keys = localization_keys(engravings)
    table = locales.resolve(Tables(TABLES), keys, missing="skip")["zh-CN"]
    templated = sorted(k for k in keys if locales.has_template(table[k]))
    assert templated == [
        "tip.desc.ability_ARTHETINE1",
        "tip.desc.ability_MADNESS1",
        "tip.desc.ability_RETURN1",
        "tip.desc.ability_SURA1",
    ]


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


def test_cell_box_is_row_major_and_zero_based():
    # 1024x1024 at 64px is a 16x16 grid; cell 0 is the top-left corner and cell 17
    # is one row down and one column across.
    assert cell_box((1024, 1024), 0) == (0, 0, CELL, CELL)
    assert cell_box((1024, 1024), 17) == (CELL, CELL, 2 * CELL, 2 * CELL)
    # A short page holds fewer cells and reports the overflow rather than wrapping.
    assert cell_box((1024, 128), 31) is not None
    assert cell_box((1024, 128), 32) is None


@needs_atlas
def test_atlas_group_matching_is_whole_name_not_prefix():
    """Group names may end in digits, so the page suffix cannot be split off.

    Ark_Passive_01's pages are ark_passive_01_0/_1 — evidence that the trailing
    number in a group name belongs to the group. Matching by prefix would fold
    ark_passive_01 into ark_passive and shift every index.
    """
    assert [p.stem for p in atlas_pages(ATLAS, "Ark_Passive_01")] == [
        "ark_passive_01_0",
        "ark_passive_01_1",
    ]
    assert [p.stem for p in atlas_pages(ATLAS, "buff")] == [f"buff_{i}" for i in range(5)]
    assert atlas_pages(ATLAS, "achieve_03") == []


@needs_atlas
def test_icon_index_runs_flat_across_the_pages_of_a_group():
    """buff_0..buff_4 concatenate into one 912-cell index space.

    Page cell counts are 256/256/112/256/32, so index 600 must land on buff_2 at
    its local cell 88 — the case that proves the walk is cumulative rather than
    per-page.
    """
    page, box = locate(ATLAS, "Buff", 600)
    assert page.stem == "buff_2"
    assert box == (8 * CELL, 5 * CELL, 9 * CELL, 6 * CELL)
    page, _ = locate(ATLAS, "Buff", 255)
    assert page.stem == "buff_0"
    page, _ = locate(ATLAS, "Buff", 256)
    assert page.stem == "buff_1"
    assert locate(ATLAS, "Buff", 912) is None


@needs_atlas
@needs_tables
def test_every_resolvable_engraving_lands_inside_its_atlas(engravings):
    for e in engravings.values():
        found = locate(ATLAS, e["icon"], e["icon_index"])
        assert (found is not None) == (e["icon_slug"] is not None), e["slug"]


@needs_tables
def test_almost_every_buff_group_engraving_sits_on_the_verified_first_page(engravings):
    """buff_0 is the region the nine semantic checks cover.

    34 of the 35 Buff-group engravings index into it; only handgunner (600) reaches
    a later page, where the flat walk is consistent but uncorroborated. Pinned so
    that a patch moving more engravings past cell 255 is noticed, since it would
    move them out of the verified region.
    """
    buff = [e for e in engravings.values() if e["icon"] == "Buff"]
    assert len(buff) == 35
    beyond = sorted(e["slug"] for e in buff if e["icon_index"] > 255)
    assert beyond == ["handgunner"]
