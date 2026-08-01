from __future__ import annotations

from PIL import Image

from vrising.maps.tiles import (
    COUNT,
    MAP_ID,
    TILE,
    convert_boss_portrait_icons,
    convert_boss_portraits,
    convert_resource_icons,
    slice_tiles,
    tile_grid,
)


def test_tile_grid_divides_6080_exactly():
    assert TILE * COUNT == 6080
    assert tile_grid(6080) == (1216, 5)


def test_tile_grid_rejects_a_size_it_cannot_divide():
    # A non-divisible size must raise rather than silently pad: padding would
    # put a fudge factor into worldBounds.
    try:
        tile_grid(6081)
    except ValueError as exc:
        assert "6081" in str(exc)
    else:
        raise AssertionError("expected ValueError")


def test_slice_tiles_writes_a_full_named_grid(tmp_path):
    src = tmp_path / "map.png"
    # A tiny stand-in grid: 4 px per tile, 5 tiles per side.
    Image.new("RGBA", (20, 20), (10, 20, 30, 255)).save(src)
    res_out = tmp_path / "res"
    written = slice_tiles(src, res_out, tile=4, count=5)
    assert written == 25
    names = sorted(p.name for p in (res_out / "tiles" / MAP_ID).iterdir())
    assert names[0] == f"{MAP_ID}_00_00.webp"
    assert names[-1] == f"{MAP_ID}_04_04.webp"
    assert len(names) == 25


def test_slice_tiles_indexes_column_then_row(tmp_path):
    # Column index comes first in the filename; row second. Paint one tile a
    # unique colour and check it lands in the file the engine will request.
    img = Image.new("RGB", (8, 8), (0, 0, 0))
    for x in range(4, 8):
        for y in range(0, 4):
            img.putpixel((x, y), (255, 0, 0))   # column 1, row 0
    src = tmp_path / "map.png"
    img.save(src)
    res_out = tmp_path / "res"
    slice_tiles(src, res_out, tile=4, count=2)
    # Tiles are lossy WebP (quality 90, as palworld ships), so compare within a
    # tolerance rather than exactly: the point of the test is which file the
    # painted tile lands in, not codec fidelity.
    with Image.open(res_out / "tiles" / MAP_ID / f"{MAP_ID}_01_00.webp") as t:
        r, g, b = t.convert("RGB").getpixel((1, 1))
        assert r > 200 and g < 40 and b < 40
    with Image.open(res_out / "tiles" / MAP_ID / f"{MAP_ID}_00_00.webp") as t:
        r, g, b = t.convert("RGB").getpixel((1, 1))
        assert r < 40 and g < 40 and b < 40


def test_convert_icons_copies_every_map_icon(tmp_path):
    from vrising.maps.tiles import convert_icons

    src = tmp_path / "Texture2D"
    src.mkdir(parents=True)
    for name in ("MapIcon_Player", "MapIcon_CavePassage", "MiniMapMask", "NotAnIcon"):
        Image.new("RGBA", (8, 8), (1, 2, 3, 255)).save(src / f"{name}.png")
    res_out = tmp_path / "res"
    written = convert_icons(tmp_path, res_out)
    names = sorted(p.stem for p in (res_out / "icons").iterdir())
    assert names == ["MapIcon_CavePassage", "MapIcon_Player", "MiniMapMask"]
    assert written == 3


def test_convert_boss_portraits_writes_prefab_keyed_webp(tmp_path):
    src = tmp_path / "Texture2D"
    src.mkdir(parents=True)
    Image.new("RGBA", (16, 8), (80, 20, 120, 255)).save(
        src / "Portrait_Large_Normal_Iva.png"
    )
    Image.new("RGBA", (8, 16), (20, 120, 80, 255)).save(
        src / "Portrait_Small_Normal_Iva.png"
    )
    res_out = tmp_path / "res"

    written = convert_boss_portraits(
        tmp_path,
        res_out,
        {"CHAR_Gloomrot_Iva_VBlood": "Portrait_Large_Normal_Iva"},
    )
    icons_written = convert_boss_portrait_icons(
        tmp_path,
        res_out,
        {"CHAR_Gloomrot_Iva_VBlood": "Portrait_Small_Normal_Iva"},
    )

    portrait = res_out / "bosses" / "CHAR_Gloomrot_Iva_VBlood.webp"
    icon = res_out / "icons" / "BossPortrait_CHAR_Gloomrot_Iva_VBlood.webp"
    assert written == 1
    assert icons_written == 1
    assert portrait.is_file()
    assert icon.is_file()
    with Image.open(portrait) as image:
        assert image.size == (16, 8)
    with Image.open(icon) as image:
        assert image.size == (8, 16)


def test_convert_resource_icons_writes_reviewed_lightweight_webp(tmp_path):
    src = tmp_path / "Texture2D"
    src.mkdir(parents=True)
    Image.new("RGBA", (320, 240), (190, 110, 50, 255)).save(
        src / "CopperOre.png"
    )
    res_out = tmp_path / "res"

    written = convert_resource_icons(
        tmp_path,
        res_out,
        {"copper": "CopperOre"},
    )

    icon = res_out / "icons" / "ResourceIcon_Copper.webp"
    assert written == 1
    assert icon.is_file()
    with Image.open(icon) as image:
        assert max(image.size) <= 160
