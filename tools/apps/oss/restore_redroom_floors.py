"""Bake source-backed Ruby goal floors into an existing OSS tile pyramid.

Placements contain projected mesh triangles in world XY and a material color.
This is a flat guide-map treatment, not a crystal shader reproduction.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw


def restore(data_dir: Path, resources: Path, placements_file: Path):
    document = json.loads((data_dir / "map-display.json").read_text(encoding="utf-8"))
    manifest_path = data_dir / "tile-overrides.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    placements = json.loads(placements_file.read_text(encoding="utf-8"))
    meta = next(m for m in document["maps"] if m["id"] == "ground")
    assert meta["orientation"] == {"pxAxis": "X", "flipX": False, "flipY": True}
    bounds = meta["worldBounds"]
    width = meta["tileWidth"] * meta["tilesCountX"]
    height = meta["tileHeight"] * meta["tilesCountY"]
    color = tuple(placements["color_srgb"]) + (255,)
    triangles = [triangle for obj in placements["objects"] for triangle in obj["triangles"]]
    changed = []
    for level in range(meta.get("tileLevels", 0) + 1):
        logical_size = meta["tileWidth"] * 2**level
        for y in range(math.ceil(meta["tilesCountY"] / 2**level)):
            for x in range(math.ceil(meta["tilesCountX"] / 2**level)):
                key = f"ground:{level}:{x}:{y}"
                relative = manifest[key]
                original = Image.open(resources / relative).convert("RGBA")
                density = original.width / logical_size
                mask = Image.new("L", original.size)
                draw = ImageDraw.Draw(mask)
                for triangle in triangles:
                    points = [(
                        ((px - bounds["min"]["x"]) / (bounds["max"]["x"] - bounds["min"]["x"]) * width - x * logical_size) * density,
                        ((bounds["max"]["y"] - py) / (bounds["max"]["y"] - bounds["min"]["y"]) * height - y * logical_size) * density,
                    ) for px, py in triangle]
                    if max(p[0] for p in points) < 0 or min(p[0] for p in points) >= original.width:
                        continue
                    if max(p[1] for p in points) < 0 or min(p[1] for p in points) >= original.height:
                        continue
                    draw.polygon(points, fill=255)
                if not mask.getbbox():
                    continue
                result = Image.composite(Image.new("RGBA", original.size, color), original, mask)
                digest = hashlib.sha256(result.tobytes()).hexdigest()[:16]
                target = f"tiles/redroom-{digest}/ground/{level}/{x}_{y}.webp"
                output = resources / target
                output.parent.mkdir(parents=True, exist_ok=True)
                result.save(output, "WEBP", lossless=True, method=4)
                manifest[key] = target
                changed.append({"key": key, "path": target, "source": relative})
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return {"material": placements["material"], "color": color[:3], "objects": len(placements["objects"]), "changed": changed}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, required=True)
    parser.add_argument("--resources", type=Path, required=True)
    parser.add_argument("--placements", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(restore(args.data, args.resources, args.placements), indent=2))
