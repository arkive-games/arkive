/**
 * Shared geometry types for the framework-free core. One named point type for
 * the whole package: `coords.ts` (map-pixel space) and `camera.ts` (map-pixel
 * AND screen space) both use it, so nothing lower in the dependency chain has
 * to import from a layer above it.
 */

/** A 2D point. Both spaces this package uses are y-DOWN. */
export interface Point {
  x: number;
  y: number;
}

/**
 * An axis-aligned rectangle in map-pixel space. y is DOWN, so `minY` is the
 * TOP edge and `maxY` the bottom one.
 */
export interface PixelBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
