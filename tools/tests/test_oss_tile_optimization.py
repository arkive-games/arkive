"""Coordinate and pixel preservation checks for the OSS artifact repacker."""

import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from PIL import Image

from apps.oss.optimize_tiles import optimize


class TileOptimizationTests(unittest.TestCase):
    def test_preserves_composite_overrides_and_coordinates(self):
        with TemporaryDirectory() as temporary:
            root = Path(temporary)
            data, resources, output_data, output_res = [root / name for name in ("data", "res", "out-data", "out-res")]
            data.mkdir()
            meta = dict(id="ground", tileWidth=128, tileHeight=128, tilesCountX=8, tilesCountY=4, worldBounds={"min": {"x": -40, "y": -44}, "max": {"x": 24, "y": -12}})
            document = dict(maps=[meta], markers={"ground": [{"id": "test", "x": 2, "y": 3}]}, regions={"ground": []})
            (data / "map-display.json").write_text(json.dumps(document))
            (data / "tile-overrides.json").write_text(json.dumps({"ground:0:1:2": "override.png"}))
            expected = Image.new("RGBA", (2048, 1024))
            for y in range(4):
                for x in range(8):
                    relative = "override.png" if (x, y) == (1, 2) else f"tiles/ground-base-expanded/0/{x}_{y}.png"
                    target = resources / relative
                    target.parent.mkdir(parents=True, exist_ok=True)
                    tile = Image.new("RGBA", (256, 256), (x * 30, y * 60, 100, 255))
                    tile.save(target)
                    expected.paste(tile, (x * 256, y * 256))
            optimize(data, resources, output_data, output_res)
            actual = json.loads((output_data / "map-display.json").read_text())
            manifest = json.loads((output_data / "tile-overrides.json").read_text())
            self.assertEqual(actual["markers"], document["markers"])
            self.assertEqual(actual["regions"], document["regions"])
            self.assertEqual(actual["maps"][0]["worldBounds"], meta["worldBounds"])
            self.assertEqual(actual["maps"][0]["tileLevels"], 1)
            composite = Image.new("RGBA", expected.size)
            for x in range(2):
                with Image.open(output_res / manifest[f"ground:0:{x}:0"]) as tile:
                    composite.paste(tile, (x * 1024, 0))
            self.assertEqual(composite.tobytes(), expected.tobytes())
            with Image.open(output_res / manifest["ground:1:0:0"]) as overview:
                self.assertEqual(overview.crop((0, 0, 512, 256)).tobytes(), expected.resize((512, 256), Image.Resampling.LANCZOS).tobytes())
            self.assertEqual(json.loads((data / "map-display.json").read_text()), document)


if __name__ == "__main__":
    unittest.main()
