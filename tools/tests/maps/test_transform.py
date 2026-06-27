from aion2.tools.maps.worldmap import WorldMapMeta
from aion2.tools.maps import worldmap_path


def test_worldmap_meta_from_real_world_l_a():
    meta = WorldMapMeta.from_json(worldmap_path("World_L_A"), "World_L_A")
    assert (meta.min_x, meta.min_y) == (-408000.0, -408000.0)
    assert (meta.max_x, meta.max_y) == (408000.0, 408000.0)
    assert meta.sector_count_x == 8 and meta.sector_count_y == 8
    assert meta.sector_plane_size == 1024.0
    assert meta.pixel_width == 8192.0
    assert meta.pixel_height == 8192.0
