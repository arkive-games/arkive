import type { GameMapMeta } from "@gamemap/data-contract";
import type { Point } from "./types.ts";

/**
 * Coordinate conversion between DATA space and the GL scene's pixel space.
 *
 * DATA `(x, y)` on a marker/region is EITHER raw world coordinates (when the
 * map carries `worldBounds`+`orientation`) or already image-pixel coordinates
 * (legacy, no bounds). {@link worldToPixel} resolves that to a pixel position
 * (identity in the legacy case); the math here is byte-for-byte the same as
 * `@gamemap/map-engine`'s so both engines agree on where a marker sits.
 *
 * DIFFERENCE FROM THE LEAFLET ENGINE: Leaflet's `CRS.Simple` has latitude going
 * UP, so that engine ends every conversion with one vertical flip
 * (`lat = mapHeight - py`, `lng = px`). This engine renders in **image-pixel
 * space with y DOWN** — the same convention as the tile grid and as `tools`'
 * canonical dataset — so {@link dataToPoint} is exactly {@link worldToPixel}.
 * There is NO vertical flip anywhere in this engine: data space, scene space and
 * screen space all have y down, and the y-down convention is realised once, by the
 * three.js projection `renderer.ts` sets up. Do not add a flip.
 *
 * `mapHeight`/`mapWidth` are the pixel size of the full tile grid
 * (`tile* × tilesCount*`, e.g. 8192 for World_L_A).
 */

/** Pixel width of the full tile grid. */
export function mapWidthOf(map: GameMapMeta): number {
  return map.tileWidth * map.tilesCountX;
}

/** Pixel height of the full tile grid in image space. */
export function mapHeightOf(map: GameMapMeta): number {
  return map.tileHeight * map.tilesCountY;
}

/**
 * DATA `(x, y)` → image-pixel `(x, y)`. When the map has no
 * `worldBounds`/`orientation`, DATA is already pixels and this is the identity.
 * Otherwise it mirrors the `tools` world→pixel transform (linear map from the
 * world bounding box to the pixel grid, with the map's axis/flip orientation).
 */
export function worldToPixel(
  map: GameMapMeta,
  x: number,
  y: number,
): Point {
  const b = map.worldBounds;
  const o = map.orientation;
  if (!b || !o) return { x, y };
  const W = mapWidthOf(map);
  const H = mapHeightOf(map);
  const pyAxis = o.pxAxis === "X" ? "Y" : "X";
  const world = { X: x, Y: y };
  const min = { X: b.min.x, Y: b.min.y };
  const max = { X: b.max.x, Y: b.max.y };
  let px = ((world[o.pxAxis] - min[o.pxAxis]) / (max[o.pxAxis] - min[o.pxAxis])) * W;
  let py = ((world[pyAxis] - min[pyAxis]) / (max[pyAxis] - min[pyAxis])) * H;
  if (o.flipX) px = W - px;
  if (o.flipY) py = H - py;
  return { x: px, y: py };
}

/** Inverse of {@link worldToPixel} (identity for legacy pixel maps). */
export function pixelToWorld(
  map: GameMapMeta,
  px: number,
  py: number,
): Point {
  const b = map.worldBounds;
  const o = map.orientation;
  if (!b || !o) return { x: px, y: py };
  const W = mapWidthOf(map);
  const H = mapHeightOf(map);
  const pyAxis = o.pxAxis === "X" ? "Y" : "X";
  const min = { X: b.min.x, Y: b.min.y };
  const max = { X: b.max.x, Y: b.max.y };
  let fx = px;
  let fy = py;
  if (o.flipX) fx = W - fx;
  if (o.flipY) fy = H - fy;
  const world = { X: 0, Y: 0 };
  world[o.pxAxis] = (fx / W) * (max[o.pxAxis] - min[o.pxAxis]) + min[o.pxAxis];
  world[pyAxis] = (fy / H) * (max[pyAxis] - min[pyAxis]) + min[pyAxis];
  return { x: world.X, y: world.Y };
}

/**
 * DATA `(x, y)` → scene point in image-pixel space (y DOWN, no flip).
 *
 * The GL counterpart of the Leaflet engine's `dataToLatLng`; the two agree via
 * {@link worldToPixel} (`lat = mapHeightOf(map) - dataToPoint(...).y`).
 */
export function dataToPoint(
  map: GameMapMeta,
  x: number,
  y: number,
): Point {
  return worldToPixel(map, x, y);
}

/** Scene pixel point (y DOWN) → DATA `{x, y}`. Inverse of {@link dataToPoint}. */
export function pointToData(
  map: GameMapMeta,
  px: number,
  py: number,
): Point {
  return pixelToWorld(map, px, py);
}
