"""Icon-id collection, and the write ordering that keeps the two repos consistent."""

from __future__ import annotations

import json
import os

import pytest
from PIL import Image

from gmzz import equipicons as mod


# Note every `icon` differs from its row `id`, and that 3280621 is shared: that
# is the real shape of the client's data, and the trap this stage exists around.
EQUIPMENT = {
    "items": [
        {"id": 3001059, "icon": "3280621"},
        {"id": 3001060, "icon": "3280621"},
        {"id": 3001061, "icon": "3010623"},
    ]
}
RELICS = {
    "artifacts": [{"id": 2085029, "icon": "2000543"}],
    "materials": {"items": [{"id": 2085107, "icon": "2085107"}]},
}
DISTINCT = ["2000543", "2085107", "3010623", "3280621"]
PLATES = [f"ItemQuality{n:02d}" for n in range(1, 8)]
#: A stand-in for the client's asset: a 136x136 transparent field with the
#: 120x120 plate at (9, 9), so the crop has an edge to be wrong about.
PLATE_SIZE = 136


def _plate_png(path):
    img = Image.new("RGBA", (PLATE_SIZE, PLATE_SIZE), (0, 0, 0, 0))
    img.paste((40, 40, 40, 255), (9, 9, 129, 129))
    img.save(path)


def _data_out(tmp_path, equipment=EQUIPMENT, relics=RELICS):
    data_out = tmp_path / "data"
    for rel, payload in ((mod.EQUIPMENT_FILE, equipment), (mod.RELICS_FILE, relics)):
        if payload is None:
            continue
        path = data_out / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload), encoding="utf-8")
    return data_out


def _raw(tmp_path, pngs, plates=PLATES):
    raw = tmp_path / "raw"
    (raw / mod.ICON_SOURCE).mkdir(parents=True)
    for name in pngs:
        Image.new("RGBA", (4, 4), (1, 2, 3, 255)).save(raw / mod.ICON_SOURCE / f"{name}.png")
    (raw / mod.PLATE_SOURCE).mkdir(parents=True)
    for name in plates:
        _plate_png(raw / mod.PLATE_SOURCE / f"{name}.png")
    return raw


def test_collects_the_icon_field_deduplicated(tmp_path):
    # Keyed off `icon`, not `id` — the two never coincide here, so a stage that
    # read the row id would return a completely different set rather than a
    # slightly wrong one.
    assert mod.icon_ids(_data_out(tmp_path)) == DISTINCT


def test_names_the_module_to_run_first_when_an_input_is_absent(tmp_path):
    data_out = _data_out(tmp_path, relics=None)
    with pytest.raises(RuntimeError, match="gmzz.relics"):
        mod.icon_ids(data_out)


def test_writes_one_webp_per_distinct_icon_and_per_plate(tmp_path):
    data_out = _data_out(tmp_path)
    raw = _raw(tmp_path, DISTINCT)
    res_out = tmp_path / "res"
    assert mod.build(raw, data_out, res_out) == (11, 11, 0)
    assert sorted(p.name for p in (res_out / mod.OUT_SUBDIR).iterdir()) == [
        f"{icon}.webp" for icon in DISTINCT
    ]
    # The plates keep the client's names, in their own directory: they are
    # chrome rather than item art, and the page indexes them by quality.
    assert sorted(p.name for p in (res_out / mod.PLATE_OUT_SUBDIR).iterdir()) == [
        f"{plate}.webp" for plate in PLATES
    ]


def test_plates_are_cropped_to_the_plate(tmp_path):
    # The asset carries a soft shadow around the plate; shipped as-is the
    # coloured bar would float above the tile's edge.
    data_out = _data_out(tmp_path)
    raw = _raw(tmp_path, DISTINCT)
    res_out = tmp_path / "res"
    mod.build(raw, data_out, res_out)
    with Image.open(res_out / mod.PLATE_OUT_SUBDIR / f"{PLATES[0]}.webp") as plate:
        assert plate.size == (120, 120)
        alpha = plate.convert("RGBA").getchannel("A")
        assert alpha.getextrema() == (255, 255), "no transparent margin survives"


@pytest.mark.parametrize("missing", ["icon", "plate"])
def test_a_partial_export_writes_nothing_at_all(tmp_path, missing):
    # resource-gmzz is committed separately from data-gmzz, so converting the
    # icons that are present and then failing would ship a half-filled image
    # repo against a dataset that names the whole set. A missing plate must
    # stop the icons too, or a re-export of one directory alone ships half.
    data_out = _data_out(tmp_path)
    if missing == "icon":
        raw = _raw(tmp_path, DISTINCT[:-1])
    else:
        raw = _raw(tmp_path, DISTINCT, plates=PLATES[:-1])
    res_out = tmp_path / "res"
    with pytest.raises(FileNotFoundError, match=f"{missing}.*partial export"):
        mod.build(raw, data_out, res_out)
    assert not res_out.exists()


def test_re_runs_skip_images_already_current(tmp_path):
    data_out = _data_out(tmp_path)
    raw = _raw(tmp_path, DISTINCT)
    res_out = tmp_path / "res"
    mod.build(raw, data_out, res_out)

    assert mod.build(raw, data_out, res_out) == (11, 0, 11)

    # A source newer than its image is reconverted; the rest still are not.
    stale = raw / mod.ICON_SOURCE / f"{DISTINCT[0]}.png"
    webp = res_out / mod.OUT_SUBDIR / f"{DISTINCT[0]}.webp"
    os.utime(stale,(webp.stat().st_mtime + 10, webp.stat().st_mtime + 10))
    assert mod.build(raw, data_out, res_out) == (11, 1, 10)
