"""Embed deduplicated map thumbnails in a derived OSS props document.

The original resource paths are unchanged and remain the source for details.
Run again after changing a prop icon or its source image.
"""
import argparse
import base64
import io
import json
from pathlib import Path

from PIL import Image


def pack(document: Path, resources: Path) -> None:
    data = json.loads(document.read_bytes())
    thumbnails = {}
    for relative in sorted({p["icon"] for p in data["props"] if p.get("icon")}):
        path = (resources / relative).resolve()
        if not path.is_relative_to(resources.resolve()):
            raise ValueError(f"Invalid icon path: {relative}")
        with Image.open(path) as source:
            icon = source.convert("RGBA")
        icon.thumbnail((64, 64), Image.Resampling.LANCZOS)
        with io.BytesIO() as buf:
            icon.save(buf, "WEBP", lossless=True, method=4)
            thumbnails[relative] = base64.b64encode(buf.getvalue()).decode("ascii")
    data["mapThumbnails"] = thumbnails
    document.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")


if __name__ == "__main__":
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("document", type=Path)
    cli.add_argument("resources", type=Path)
    args = cli.parse_args()
    pack(args.document, args.resources)
