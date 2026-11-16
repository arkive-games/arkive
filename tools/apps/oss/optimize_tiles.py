"""Repack the exported OSS tiles without moving markers or changing world bounds.

Run with Pillow installed. Publish output resources before output data.
Source directories are read-only; output directories must be separate worktrees.
"""

import argparse
import hashlib
import json
import math
from pathlib import Path

from PIL import Image


def optimize(data_dir: Path, resource_dir: Path, output_data: Path, output_res: Path):
    if data_dir.resolve() == output_data.resolve() or resource_dir.resolve() == output_res.resolve():
        raise ValueError("Use separate output directories to preserve the source export")
    document = json.loads((data_dir / "map-display.json").read_text(encoding="utf-8"))
    overrides = json.loads((data_dir / "tile-overrides.json").read_text(encoding="utf-8"))
    result = {}
    report = []
    for meta in document["maps"]:
        map_id = meta["id"]
        width = meta["tileWidth"] * meta["tilesCountX"]
        height = meta["tileHeight"] * meta["tilesCountY"]
        size = 512
        if width % size or height % size:
            raise ValueError(f"{map_id}: dimensions must be divisible by {size}")
        first = resource_dir / overrides.get(f"{map_id}:0:0:0", f"tiles/{map_id}-base-expanded/0/0_0.png")
        with Image.open(first) as tile:
            density = tile.width // meta["tileWidth"]
        if density < 1:
            raise ValueError("Source textures must cover their logical tile size")
        image = Image.new("RGBA", (width * density, height * density))
        source_bytes = 0
        for y in range(meta["tilesCountY"]):
            for x in range(meta["tilesCountX"]):
                relative = overrides.get(f"{map_id}:0:{x}:{y}", f"tiles/{map_id}-base-expanded/0/{x}_{y}.png")
                source = resource_dir / relative
                source_bytes += source.stat().st_size
                with Image.open(source) as tile:
                    if tile.size != (meta["tileWidth"] * density, meta["tileHeight"] * density):
                        raise ValueError(f"Unexpected source tile size: {source}")
                    image.paste(tile.convert("RGBA"), (x * meta["tileWidth"] * density, y * meta["tileHeight"] * density))
        # Content-address the complete composite so old CDN caches cannot mix exports.
        digest = hashlib.sha256(image.tobytes()).hexdigest()[:16]
        levels = math.ceil(math.log2(max(width, height) / size))
        output_bytes = 0
        count = 0
        for level in range(levels + 1):
            scaled = image if level == 0 else image.resize((width // 2**level, height // 2**level), Image.Resampling.LANCZOS)
            texture_size = size * density if level == 0 else size
            for y in range(math.ceil(scaled.height / texture_size)):
                for x in range(math.ceil(scaled.width / texture_size)):
                    tile = Image.new("RGBA", (texture_size, texture_size))
                    tile.paste(scaled.crop((x * texture_size, y * texture_size, min((x + 1) * texture_size, scaled.width), min((y + 1) * texture_size, scaled.height))), (0, 0))
                    relative = f"tiles/optimized-{digest}/{map_id}/{level}/{x}_{y}.webp"
                    target = output_res / relative
                    target.parent.mkdir(parents=True, exist_ok=True)
                    tile.save(target, "WEBP", lossless=True, method=4)
                    result[f"{map_id}:{level}:{x}:{y}"] = relative
                    output_bytes += target.stat().st_size
                    count += 1
        meta.update(tileWidth=size, tileHeight=size, tilesCountX=width // size, tilesCountY=height // size, tileLevels=levels)
        report.append(dict(map=map_id, source_bytes=source_bytes, output_bytes=output_bytes, tiles=count, levels=levels))
    output_data.mkdir(parents=True, exist_ok=True)
    (output_data / "map-display.json").write_text(json.dumps(document, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    (output_data / "tile-overrides.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("data", "resources", "output-data", "output-resources"):
        parser.add_argument(f"--{name}", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(optimize(args.data, args.resources, args.output_data, args.output_resources), indent=2))
