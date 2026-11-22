"""Check floor projection at both texture densities and pyramid levels."""
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from PIL import Image

from apps.oss.restore_redroom_floors import restore


class RedRoomFloorTests(unittest.TestCase):
    def test_nine_source_cells_are_not_collapsed_to_the_center_mesh(self):
        with TemporaryDirectory() as temporary:
            root = Path(temporary)
            data, resources = root / "data", root / "resources"
            data.mkdir()
            resources.mkdir()
            meta = dict(id="ground", tileWidth=64, tileHeight=64, tilesCountX=1, tilesCountY=1, worldBounds={"min": {"x": 79, "y": 89}, "max": {"x": 87, "y": 97}}, orientation={"pxAxis": "X", "flipX": False, "flipY": True})
            (data / "map-display.json").write_text(json.dumps({"maps": [meta]}))
            Image.new("RGBA", (64, 64), (90, 100, 110, 255)).save(resources / "original.png")
            (data / "tile-overrides.json").write_text(json.dumps({"ground:0:0:0": "original.png"}))
            objects = [{"triangles": [], "guide_cell": [x - .5, y - .5, x + .5, y + .5]} for y in (92, 93, 94) for x in (82, 83, 84)]
            placements = data / "placements.json"
            placements.write_text(json.dumps({"material": "goal_room_Ruby", "color_srgb": [173, 0, 19], "objects": objects}))
            report = restore(data, resources, placements)
            self.assertEqual(len(report["changed"]), 1)
            with Image.open(resources / report["changed"][0]["path"]) as result:
                result = result.convert("RGB")
                for y in (92, 93, 94):
                    for x in (82, 83, 84):
                        self.assertEqual(result.getpixel(((x - 79) * 8, (97 - y) * 8)), (173, 0, 19))
                self.assertEqual(result.getpixel((0, 0)), (90, 100, 110))

    def test_world_projection_preserves_pixels_outside_source_footprint(self):
        with TemporaryDirectory() as temporary:
            root = Path(temporary)
            data, resources = root / "data", root / "resources"
            data.mkdir()
            resources.mkdir()
            meta = dict(id="ground", tileWidth=16, tileHeight=16, tilesCountX=2, tilesCountY=2, tileLevels=1, worldBounds={"min": {"x": -10, "y": -20}, "max": {"x": 22, "y": 12}}, orientation={"pxAxis": "X", "flipX": False, "flipY": True})
            (data / "map-display.json").write_text(json.dumps({"maps": [meta]}))
            manifest = {}
            for level, count in ((0, 2), (1, 1)):
                for y in range(count):
                    for x in range(count):
                        name = f"{level}-{x}-{y}.png"
                        Image.new("RGBA", (64 if level == 0 else 16,) * 2, (90, 100, 110, 255)).save(resources / name)
                        manifest[f"ground:{level}:{x}:{y}"] = name
            (data / "tile-overrides.json").write_text(json.dumps(manifest))
            placement = data / "placements.json"
            placement.write_text(json.dumps({"material": "goal_room_Ruby", "color_srgb": [173, 0, 19], "objects": [{"triangles": [[[-8, 10], [-4, 10], [-8, 6]]]}]}))
            report = restore(data, resources, placement)
            self.assertEqual(len(report["changed"]), 2)
            updated = json.loads((data / "tile-overrides.json").read_text())
            self.assertEqual(updated["ground:0:1:1"], manifest["ground:0:1:1"])
            for key, inside in (("ground:0:0:0", (10, 10)), ("ground:1:0:0", (1, 1))):
                with Image.open(resources / updated[key]) as image:
                    image = image.convert("RGBA")
                    self.assertEqual(image.getpixel(inside), (173, 0, 19, 255))
                    self.assertEqual(image.getpixel((image.width - 1, image.height - 1)), (90, 100, 110, 255))
            with Image.open(resources / manifest["ground:0:0:0"]) as original:
                self.assertEqual(original.getpixel((10, 10)), (90, 100, 110, 255))
