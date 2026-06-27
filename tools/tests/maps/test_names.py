from aion2.tools.maps.names import tokens
from aion2.tools.maps.regions_ref import load_frontend_regions, centroid
from aion2.tools.maps import regions_yaml_path


def test_tokens_split_camel_and_underscore():
    assert tokens("AltamiaCanyon") == frozenset({"altamia", "canyon"})
    # reordered words still match as a set
    assert tokens("WesternAltamiaHighland") == tokens("AltamiaHighland_Western")


def test_centroid_of_square():
    assert centroid([[0.0, 0.0], [2.0, 0.0], [2.0, 2.0], [0.0, 2.0]]) == (1.0, 1.0)


def test_load_frontend_regions_world_l_a():
    regions = load_frontend_regions(regions_yaml_path("World_L_A"))
    names = {r.name for r in regions}
    assert "AltamiaCanyon" in names
    az = next(r for r in regions if r.name == "AltamiaCanyon")
    assert len(az.points) >= 3        # flattened pixel vertices
