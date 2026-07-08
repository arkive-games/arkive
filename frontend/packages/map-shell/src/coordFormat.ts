/**
 * Format a DISPLAY coordinate (already transformed to the game-native space —
 * not raw data coords) into two representations:
 *
 * - `text`: the compact visible label `(X, Y, Z)`, or `(X, Y)` when there is no
 *   height. Values are rounded to integers.
 * - `aria`: an expanded, axis-labeled string `X: n, Y: n, Z: n` (or `X: n, Y: n`
 *   with no height) for `aria-label`/`title`, so screen-reader and hover users
 *   can tell which number is which axis — the up (Z / height) axis especially.
 */
export function formatCoords(
  x: number,
  y: number,
  z?: number,
): { text: string; aria: string } {
  const rx = Math.round(x)
  const ry = Math.round(y)
  if (z === undefined) {
    return { text: `(${rx}, ${ry})`, aria: `X: ${rx}, Y: ${ry}` }
  }
  const rz = Math.round(z)
  return { text: `(${rx}, ${ry}, ${rz})`, aria: `X: ${rx}, Y: ${ry}, Z: ${rz}` }
}
