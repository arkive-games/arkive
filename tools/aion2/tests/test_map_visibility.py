from tools.maps.emit_frontend import MAP_META


def test_world_b_maps_are_visible():
    assert MAP_META["World_L_B"]["isVisible"] is True
    assert MAP_META["World_D_B"]["isVisible"] is True


def test_reshanta_b_is_hidden():
    # Abyss_Reshanta_B is deprecated (absent from Map.json, replaced by C).
    assert MAP_META["Abyss_Reshanta_B"]["isVisible"] is False
