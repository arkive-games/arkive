"""Contract tests for the client's atlas sprite table (``IconInfo.loa``)."""

import pytest

from lostark.env import optional_dir, optional_file
from lostark.icons import locate, pages, sprite_table

ATLAS = optional_dir("LOSTARK_ICON_ATLAS")
ICON_INFO = optional_file("LOSTARK_ICON_INFO")

needs_atlas = pytest.mark.skipif(
    ATLAS is None or not ATLAS.exists(), reason="LOSTARK_ICON_ATLAS not set"
)
needs_icon_info = pytest.mark.skipif(
    ICON_INFO is None or not ICON_INFO.exists(), reason="LOSTARK_ICON_INFO not set"
)


@pytest.fixture(scope="module")
def sprites():
    return sprite_table(ICON_INFO)


@needs_icon_info
def test_table_covers_the_whole_ui_icon_set(sprites):
    """44,121 records, 44,106 addressable sprites, 1,144 pages.

    The page count is the check that matters: ``laex textures`` writes 1,147
    Texture2D exports across the 22 EFUI_ICONATLAS_* packages, so the table
    describes the whole atlas but for three textures no sprite references (a page
    used whole, not as a sheet). Nothing it names is outside the extraction.
    """
    assert len(sprites) == 44106
    assert len({s.page for s in sprites.values()}) == 1144


@needs_icon_info
def test_sprites_are_not_laid_out_in_index_order(sprites):
    """Buff_61/62 sit on buff_3, which is what breaks every arithmetic model.

    Indices 60 and 63 are neighbours on buff_0's row 3; the two indices between
    them are elsewhere. So a flat row-major walk reads two cells late from 63
    onward — the origin of the "-2 offset" the art appeared to want.
    """
    assert sprites[("buff", 60)].page == "Buff_0"
    assert (sprites[("buff", 60)].x, sprites[("buff", 60)].y) == (768, 192)
    assert sprites[("buff", 61)].page == "Buff_3"
    assert (sprites[("buff", 61)].x, sprites[("buff", 61)].y) == (0, 0)
    assert sprites[("buff", 62)].page == "Buff_3"
    assert sprites[("buff", 63)].page == "Buff_0"
    assert (sprites[("buff", 63)].x, sprites[("buff", 63)].y) == (832, 192)


@needs_icon_info
def test_page_order_is_not_the_numeric_suffix(sprites):
    # The Ability group starts on page Ability_1 and only reaches Ability_0 at 207.
    assert sprites[("ability", 0)].page == "Ability_1"
    assert sprites[("ability", 207)].page == "Ability_0"


@needs_icon_info
def test_cell_size_is_per_sprite(sprites):
    # 64x64 is the common icon, but the table also carries 128x128 achievement art
    # (engravings reference some of it) and page-sized banners.
    assert (sprites[("buff", 71)].width, sprites[("buff", 71)].height) == (64, 64)
    assert (sprites[("achieve_03", 40)].width, sprites[("achieve_03", 40)].height) == (128, 128)
    sizes = {(s.width, s.height) for s in sprites.values()}
    assert (64, 64) in sizes and (128, 128) in sizes and len(sizes) > 50


@needs_icon_info
def test_group_names_ending_in_digits_keep_them(sprites):
    """Only the last run of digits in a sprite name is the index.

    GL_Skill_01_26.png is index 26 of group GL_Skill_01, not index 1 of GL_Skill
    nor index 126 of GL. Splitting at the first digit run would silently address a
    different group.
    """
    assert ("gl_skill_01", 26) in sprites
    assert ("ark_passive_01", 5) in sprites
    assert ("gl_skill", 126) not in sprites


@needs_icon_info
@needs_atlas
def test_locate_maps_a_sprite_onto_an_extracted_page():
    sprites = sprite_table(ICON_INFO)
    page_index = pages(ATLAS)
    page, box = locate(sprites, page_index, "Buff", 71)
    assert page.stem == "buff_0"
    assert box == (320, 256, 384, 320)
    # Case does not matter on either side: the tables spell groups inconsistently
    # and the sprite table uses the artist's casing.
    assert locate(sprites, page_index, "bUfF", 71) == (page, box)
    # Absent sprite and absent page both resolve to None rather than raising.
    assert locate(sprites, page_index, "Buff", 258) is None
    assert locate(sprites, page_index, "NoSuchGroup", 0) is None
