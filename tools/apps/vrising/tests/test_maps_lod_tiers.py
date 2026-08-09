"""LOD tier stamping for the V Rising marker set (maps/emit.py)."""

from vrising.maps.emit import _stamp_lod_tiers


def _src(default_active: set[str]) -> dict:
    return {
        "categories": [
            {
                "subtypes": [
                    {"id": "poi", "defaultActive": "poi" in default_active},
                    {"id": "territory", "defaultActive": "territory" in default_active},
                    {"id": "crowded", "defaultActive": "crowded" in default_active},
                ]
            }
        ]
    }


def _markers(counts: dict[str, int]) -> list[dict]:
    out: list[dict] = []
    for subtype, n in counts.items():
        out.extend({"id": f"{subtype}-{i}", "subtype": subtype} for i in range(n))
    return out


def test_every_marker_gets_a_tier():
    """A missing tier is treated as hidden by both engines, so none may be absent."""
    markers = _markers({"poi": 3, "territory": 400})
    _stamp_lod_tiers(markers, _src(set()))
    assert all("tier" in m for m in markers)


def test_default_active_subtypes_are_always_tier_one():
    """Density is the wrong signal for a layer curated as on-by-default."""
    markers = _markers({"crowded": 400})
    _stamp_lod_tiers(markers, _src({"crowded"}))
    assert {m["tier"] for m in markers} == {1}


def test_density_steps_back_the_rest():
    markers = _markers({"poi": 50, "territory": 251})
    _stamp_lod_tiers(markers, _src(set()))
    tiers = {m["subtype"]: m["tier"] for m in markers}
    assert tiers["poi"] == 1  # <= 50
    assert tiers["territory"] == 3  # > 250


def test_the_result_always_contains_a_tier_one_layer():
    """Only tier 1 is drawn at the opening zoom; without one the map is blank."""
    markers = _markers({"territory": 200, "crowded": 400})
    _stamp_lod_tiers(markers, _src({"territory"}))
    assert 1 in {m["tier"] for m in markers}
