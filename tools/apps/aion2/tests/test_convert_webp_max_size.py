"""The icon-tree pixel cap in the PNG -> WebP conversion.

The cap exists because the icon trees ship at 256px for a UI that renders them
at 32-56px; see ``aion2.tools.assets.__main__`` for the per-tree audit.
"""

from __future__ import annotations

import os

from PIL import Image

from aion2.tools.assets.convert_webp import convert_tree


def _png(path, size):
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGBA", size, (255, 0, 0, 255)).save(path)


def _dims(path):
    with Image.open(path) as img:
        return img.size


def test_caps_the_longest_edge(tmp_path):
    _png(tmp_path / "src" / "icon.png", (256, 256))
    convert_tree(tmp_path / "src", tmp_path / "out", max_size=128)
    assert _dims(tmp_path / "out" / "icon.webp") == (128, 128)


def test_preserves_aspect_ratio(tmp_path):
    _png(tmp_path / "src" / "banner.png", (512, 256))
    convert_tree(tmp_path / "src", tmp_path / "out", max_size=128)
    assert _dims(tmp_path / "out" / "banner.webp") == (128, 64)


def test_never_enlarges(tmp_path):
    _png(tmp_path / "src" / "small.png", (64, 64))
    convert_tree(tmp_path / "src", tmp_path / "out", max_size=128)
    assert _dims(tmp_path / "out" / "small.webp") == (64, 64)


def test_no_cap_keeps_native_size(tmp_path):
    """Map tiles and UI plates go through the same function uncapped."""
    _png(tmp_path / "src" / "tile.png", (1024, 1024))
    convert_tree(tmp_path / "src", tmp_path / "out")
    assert _dims(tmp_path / "out" / "tile.webp") == (1024, 1024)


def test_lowering_the_cap_reconverts_an_up_to_date_output(tmp_path):
    """The regression that makes a new cap a silent no-op.

    Outputs are skipped when newer than their source -- which every .webp is,
    right after conversion. Without a size check, introducing a cap would skip
    the entire tree and change nothing.
    """
    src = tmp_path / "src" / "icon.png"
    _png(src, (256, 256))
    out = tmp_path / "out" / "icon.webp"

    convert_tree(tmp_path / "src", tmp_path / "out")
    assert _dims(out) == (256, 256)
    # Make the output unambiguously newer than the source.
    os.utime(out, (os.path.getmtime(src) + 10, os.path.getmtime(src) + 10))

    converted, skipped = convert_tree(tmp_path / "src", tmp_path / "out", max_size=128)
    assert (converted, skipped) == (1, 0)
    assert _dims(out) == (128, 128)


def test_an_output_already_within_the_cap_is_skipped(tmp_path):
    """The size check must not defeat idempotency once the tree has settled."""
    _png(tmp_path / "src" / "icon.png", (256, 256))
    convert_tree(tmp_path / "src", tmp_path / "out", max_size=128)

    converted, skipped = convert_tree(tmp_path / "src", tmp_path / "out", max_size=128)
    assert (converted, skipped) == (0, 1)
