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


def _data_out(tmp_path, equipment=EQUIPMENT, relics=RELICS):
    data_out = tmp_path / "data"
    for rel, payload in ((mod.EQUIPMENT_FILE, equipment), (mod.RELICS_FILE, relics)):
        if payload is None:
            continue
        path = data_out / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload), encoding="utf-8")
    return data_out


def _raw(tmp_path, pngs):
    raw = tmp_path / "raw"
    (raw / mod.ICON_SOURCE).mkdir(parents=True)
    for name in pngs:
        Image.new("RGBA", (4, 4), (1, 2, 3, 255)).save(raw / mod.ICON_SOURCE / f"{name}.png")
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


def test_writes_one_webp_per_distinct_icon(tmp_path):
    data_out = _data_out(tmp_path)
    raw = _raw(tmp_path, DISTINCT)
    res_out = tmp_path / "res"
    assert mod.build(raw, data_out, res_out) == (4, 4, 0)
    assert sorted(p.name for p in (res_out / mod.OUT_SUBDIR).iterdir()) == [
        f"{icon}.webp" for icon in DISTINCT
    ]


def test_a_partial_export_writes_nothing_at_all(tmp_path):
    # resource-gmzz is committed separately from data-gmzz, so converting the
    # icons that are present and then failing would ship a half-filled image
    # repo against a dataset that names the whole set.
    data_out = _data_out(tmp_path)
    raw = _raw(tmp_path, DISTINCT[:-1])
    res_out = tmp_path / "res"
    with pytest.raises(FileNotFoundError, match="partial export"):
        mod.build(raw, data_out, res_out)
    assert not (res_out / mod.OUT_SUBDIR).exists()


def test_re_runs_skip_icons_already_current(tmp_path):
    data_out = _data_out(tmp_path)
    raw = _raw(tmp_path, DISTINCT)
    res_out = tmp_path / "res"
    mod.build(raw, data_out, res_out)

    assert mod.build(raw, data_out, res_out) == (4, 0, 4)

    # A source newer than its image is reconverted; the rest still are not.
    stale = raw / mod.ICON_SOURCE / f"{DISTINCT[0]}.png"
    webp = res_out / mod.OUT_SUBDIR / f"{DISTINCT[0]}.webp"
    os.utime(stale,(webp.stat().st_mtime + 10, webp.stat().st_mtime + 10))
    assert mod.build(raw, data_out, res_out) == (4, 1, 3)
