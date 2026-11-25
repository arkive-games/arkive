# /// script
# requires-python = ">=3.10"
# dependencies = ["shapely==2.1.2"]
# ///
"""Bake island rims into the existing SVG tiles. No runtime geometry or filters."""
import re
import sys
from pathlib import Path
from xml.etree import ElementTree as ET

from shapely import Polygon, box, make_valid, union_all


def parts(geometry, kind):
    if geometry.is_empty:
        return
    if geometry.geom_type == kind:
        yield geometry
    elif hasattr(geometry, "geoms"):
        for child in geometry.geoms:
            yield from parts(child, kind)


def bake(directory):
    tiles, footprints = [], {}
    for tile in sorted(directory.glob("glimmith-terrain-*.svg")):
        original = tile.read_text(encoding="utf8")
        svg = re.sub(r'<g id="island-rim".*?</g>', "", original)
        root = ET.fromstring(svg)
        tiles.append((tile, original, svg, map(int, root.attrib["viewBox"].split())))
        # Structural floors and rock footprints are polygons. Leave freestanding
        # foliage, ladder rungs and other mesh detail out of the island contour.
        for item in root.findall("{*}polygon"):
            points = item.attrib["points"]
            if points not in footprints:
                poly = Polygon([tuple(map(float, p.split(","))) for p in points.split()])
                footprints[points] = list(parts(make_valid(poly) if not poly.is_valid else poly, "Polygon"))

    if not tiles or not footprints:
        raise ValueError("No projected terrain found")
    land = union_all([p for polys in footprints.values() for p in polys], grid_size=0.1)
    rims = [p.exterior.simplify(1.5) for p in parts(land, "Polygon") if p.area >= 4800]
    for tile, original, svg, (x, y, w, h) in tiles:
        # Clip already-joined lines with overscan for stroke and shadow. Never
        # trace the tile rectangle or close a line that crosses a tile boundary.
        bounds = box(x-10, y-10, x+w+10, y+h+10)
        segments = [line for rim in rims if rim.intersects(bounds)
                    for line in parts(rim.intersection(bounds), "LineString")]
        d = "".join("M" + " ".join(f"{a:.0f},{b:.0f}" for a, b in s.coords) for s in segments)
        if d:
            # Reference the geometry once; put style on each use, not the path.
            rim = (f'<g id="island-rim" fill="none" stroke-linejoin="round">'
                   f'<defs><path id="shore" d="{d}"/></defs>'
                   '<use href="#shore" transform="translate(0 3)" stroke="#182e39" stroke-width="7"/>'
                   '<use href="#shore" stroke="#c0c7ab" stroke-width="3.5"/></g>')
            svg = svg.replace("/>", "/>" + rim, 1)
        if svg != original:
            tile.write_bytes(svg.encode("utf8"))


if __name__ == "__main__":
    bake(Path(sys.argv[1]))
