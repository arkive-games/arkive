from __future__ import annotations

import json

import numpy as np
import pytest
from PIL import Image

from vrising.maps.extract import build_parsed, resolve_mask_paths, scale_check


def _write_export(root, entries, guid_rows, mask_sizes):
    (root / "MonoBehaviour").mkdir(parents=True)
    (root / "Texture2D").mkdir(parents=True)
    (root / "MonoBehaviour" / "ZoneMap_VRisingWorld_POIPolygonTextureCollection.json").write_text(
        json.dumps({"m_Name": "ZoneMap_VRisingWorld_POIPolygonTextureCollection", "Entries": entries}),
        encoding="utf-8",
    )
    (root / "MonoBehaviour" / "ZoneMap_VRisingWorld_TerritoryTextureCollection.json").write_text(
        json.dumps({"m_Name": "ZoneMap_VRisingWorld_TerritoryTextureCollection", "Entries": []}),
        encoding="utf-8",
    )
    (root / "guid-index.json").write_text(json.dumps({"objects": guid_rows}), encoding="utf-8")
    for name, (w, h) in mask_sizes.items():
        Image.new("RGBA", (w, h), (255, 255, 255, 255)).save(root / "Texture2D" / f"{name}.png")
    # The world map's size is read from the image itself.
    Image.new("RGBA", (16, 16), (0, 0, 0, 255)).save(
        root / "Texture2D" / "ZoneMap_Wilderness_VRisingWorld.png"
    )


def _entry(path_id, ax, ay, cx, cy):
    """One collection entry; MinUV/MaxUV are world AABBs (not UVs)."""
    return {
        "MainTex": {"m_FileID": 0, "m_PathID": path_id},
        "AccessID": {"x": 1, "y": 2, "z": 3},
        "CenterPosWS": {"x": cx, "y": cy},
        "AspectRatio": {"x": ax, "y": ay},
        "MinUV": {"x": cx - ax / 2, "y": cy - ay / 2},
        "MaxUV": {"x": cx + ax / 2, "y": cy + ay / 2},
    }


def test_resolves_mask_paths_through_the_guid_index(tmp_path):
    _write_export(
        tmp_path,
        [_entry(101, 100.0, 50.0, -500.0, -300.0)],
        [{"pathId": 101, "name": "POIPolygon_7", "typeName": "Texture2D", "outputPath": "Texture2D/POIPolygon_7.png"}],
        {"POIPolygon_7": (200, 100)},
    )
    resolved = resolve_mask_paths(tmp_path)
    assert resolved[101] == "Texture2D/POIPolygon_7.png"


def test_unresolved_pptr_raises_and_names_the_entry(tmp_path):
    _write_export(
        tmp_path,
        [_entry(999, 100.0, 50.0, -500.0, -300.0)],
        [{"pathId": 101, "name": "POIPolygon_7", "typeName": "Texture2D", "outputPath": "Texture2D/POIPolygon_7.png"}],
        {"POIPolygon_7": (200, 100)},
    )
    with pytest.raises(RuntimeError, match="999"):
        build_parsed(tmp_path)


def test_center_is_the_aabb_midpoint_and_aspect_is_the_span(tmp_path):
    _write_export(
        tmp_path,
        [_entry(101, 100.0, 50.0, -500.0, -300.0)],
        [{"pathId": 101, "name": "POIPolygon_7", "typeName": "Texture2D", "outputPath": "Texture2D/POIPolygon_7.png"}],
        {"POIPolygon_7": (200, 100)},
    )
    parsed = build_parsed(tmp_path)
    (e,) = parsed["entries"]
    assert e["kind"] == "poi"
    assert e["center"] == [-500.0, -300.0]
    assert e["min"] == [-550.0, -325.0]
    assert e["max"] == [-450.0, -275.0]
    assert e["mask"] == "Texture2D/POIPolygon_7.png"
    assert e["maskSize"] == [200, 100]


def test_scale_check_reports_units_per_pixel_and_axis_order(tmp_path):
    # 100 world units over 200 mask px = 0.5 u/px, no axis swap.
    entries = [
        {"min": [-550.0, -325.0], "max": [-450.0, -275.0], "maskSize": [200, 100]},
        {"min": [0.0, 0.0], "max": [40.0, 20.0], "maskSize": [80, 40]},
    ]
    report = scale_check(entries)
    assert report["direct"] == 2
    assert report["swapped"] == 0
    assert report["unitsPerPixel"] == pytest.approx(0.5)


def test_scale_check_detects_a_swapped_axis_order():
    entries = [{"min": [0.0, 0.0], "max": [40.0, 20.0], "maskSize": [40, 80]}]
    report = scale_check(entries)
    assert report["direct"] == 0
    assert report["swapped"] == 1


def test_union_bounds_cover_every_entry():
    from vrising.maps.extract import union_bounds

    entries = [
        {"min": [-100.0, -50.0], "max": [-40.0, 10.0]},
        {"min": [-200.0, -30.0], "max": [-150.0, 60.0]},
    ]
    assert union_bounds(entries) == {"min": [-200.0, -50.0], "max": [-40.0, 60.0]}


def test_mask_alpha_is_read_as_a_boolean_silhouette(tmp_path):
    from vrising.maps.extract import load_mask

    img = np.zeros((4, 4, 4), dtype=np.uint8)
    img[1:3, 1:3, 3] = 255
    img[0, 0, 3] = 8  # antialiased fringe, below threshold
    Image.fromarray(img, "RGBA").save(tmp_path / "m.png")
    m = load_mask(tmp_path / "m.png")
    assert m.shape == (4, 4)
    assert m.sum() == 4
    assert not m[0, 0]
