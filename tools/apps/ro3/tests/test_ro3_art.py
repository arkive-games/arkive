"""Tests for the art pipeline's pure decisions: categorisation, atlas cropping, naming.

None of this needs the game or unex. The cropping test is the one that matters: Unity
measures a sprite's rect from the bottom of the atlas page while Pillow measures from the
top, and getting that backwards produces icons that are plausible-looking but wrong.
"""

from __future__ import annotations

import json

from PIL import Image

from ro3 import art, unex


def make_page() -> Image.Image:
    """A 8x8 page with a distinct colour in each corner, so orientation is visible."""
    page = Image.new("RGBA", (8, 8), (0, 0, 0, 255))
    page.putpixel((0, 0), (255, 0, 0, 255))  # top-left
    page.putpixel((7, 0), (0, 255, 0, 255))  # top-right
    page.putpixel((0, 7), (0, 0, 255, 255))  # bottom-left
    page.putpixel((7, 7), (255, 255, 0, 255))  # bottom-right
    return page


def test_crop_measures_the_rect_from_the_bottom_of_the_page():
    """Unity's y=0 is the bottom row, which Pillow calls y=7 on an 8-pixel page."""
    out = art.crop(make_page(), {"x": 0, "y": 0, "width": 2, "height": 2}, 0)

    assert out.size == (2, 2)
    assert out.getpixel((0, 1)) == (0, 0, 255, 255)  # the bottom-left blue


def test_crop_of_the_top_rect_returns_the_top_of_the_page():
    out = art.crop(make_page(), {"x": 0, "y": 6, "width": 2, "height": 2}, 0)
    assert out.getpixel((0, 0)) == (255, 0, 0, 255)  # the top-left red


def test_crop_undoes_the_packers_rotation():
    """settingsRaw bit 3 marks a sprite the packer turned 90 degrees to make it fit."""
    upright = art.crop(make_page(), {"x": 0, "y": 0, "width": 4, "height": 2}, 0)
    rotated = art.crop(make_page(), {"x": 0, "y": 0, "width": 4, "height": 2}, 0b1000)

    assert upright.size == (4, 2)
    assert rotated.size == (2, 4)
    assert rotated.transpose(Image.Transpose.ROTATE_90).tobytes() == upright.tobytes()


def test_crop_rounds_a_fractional_rect():
    out = art.crop(make_page(), {"x": 0.4, "y": 0.4, "width": 2.2, "height": 1.6}, 0)
    assert out.size == (2, 2)


# ------------------------------------------------------------------------ categorisation

def sprite(name: str) -> dict:
    return {"class": "Sprite", "name": name, "pathId": 1}


def texture(name: str) -> dict:
    return {"class": "Texture2D", "name": name, "pathId": 1}


def test_a_skill_icon_goes_to_the_skill_category():
    assert art.match(art.CATEGORIES, sprite("icon_skill_acolyte_blessing")).out == "icons/skills"


def test_the_specific_category_wins_over_the_icon_catch_all():
    """Both patterns match icon_talent_*; declaration order decides, and it must be talents."""
    assert art.match(art.CATEGORIES, sprite("icon_talent_assassin_poison_blade")).out \
        == "icons/talents"


def test_an_unclaimed_icon_falls_through_to_the_catch_all():
    assert art.match(art.CATEGORIES, sprite("icon_bag_slot_locked")).out == "icons/other"


def test_a_sprite_that_matches_nothing_is_not_claimed():
    assert art.match(art.CATEGORIES, sprite("common_btn_close_line")) is None


def test_a_texture_pattern_never_claims_a_sprite_of_the_same_name():
    """Category.klass is part of the match, so a Sprite cannot land in a Texture2D bucket."""
    assert art.match(art.CATEGORIES, sprite("Model_Boss_BaphometHigh_LOD0")) is None
    assert art.match(art.CATEGORIES, texture("Model_Boss_BaphometHigh_LOD0")).out \
        == "bosses/models"


def test_only_the_highest_lod_texture_is_claimed():
    assert art.match(art.CATEGORIES, texture("Model_Boss_BaphometHigh_LOD1")) is None


def test_every_category_has_a_distinct_output_directory():
    outs = [c.out for c in art.CATEGORIES]
    assert len(outs) == len(set(outs))


def test_resolution_variant_bundles_are_recognised():
    assert "a1/b2.bundle.hd.bundle".endswith(art.VARIANT_SUFFIXES)
    assert "a1/b2.bundle.ld.bundle".endswith(art.VARIANT_SUFFIXES)
    assert not "a1/b2.bundle".endswith(art.VARIANT_SUFFIXES)


def test_safe_name_replaces_the_characters_windows_refuses():
    assert art.safe_name("sactx-0-2048x2048-DXT5|BC3-Skill_Icon") \
        == "sactx-0-2048x2048-DXT5_BC3-Skill_Icon"
    assert art.safe_name("icon_skill_acolyte_blessing") == "icon_skill_acolyte_blessing"


# ---------------------------------------------------------------------------- unex glue

def test_write_profile_points_at_the_selection_directory(tmp_path):
    config = unex.write_profile(tmp_path / "work", tmp_path / "sel", tmp_path / "out")
    doc = json.loads(config.read_text(encoding="utf-8"))
    profile = doc["profiles"][unex.PROFILE]

    assert profile["dataDir"].endswith("/sel")
    assert profile["bundleRoots"] == ["."]
    assert profile["bundleSuffixes"] == [".bundle"]
    assert profile["unityVersion"] == unex.UNITY_VERSION
