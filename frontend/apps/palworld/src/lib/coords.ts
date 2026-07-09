// Palworld in-game map coordinate readout.
//
// Markers and the cursor now carry RAW WORLD coordinates (x = worldX,
// y = worldY, z = worldZ = height). Palworld's in-game readout is a fixed
// linear map of world position: the horizontal axes are SWAPPED (game-x ←
// worldY, game-y ← worldX), scaled by 459 world-units per in-game unit, and
// shifted by the landscape midpoint (palworld-coord library constants; verified
// against 6 tower entrances — see
// docs/superpowers/specs/2026-07-04-palworld-ingame-coordinates-design.md):
//
//   game_x = (worldY - 158000) / 459
//   game_y = (worldX + 123888) / 459
//
// The vertical axis (height) is NOT swapped and has no published midpoint, so
// we only apply the same isotropic /459 scale to keep it in the same in-game
// units as game-x/game-y:
//
//   game_z = worldZ / 459   (height / altitude; the game itself shows no Z)
//
// The Paldex formula is a property of Palworld's world space, not of any one
// map: MainWorld and WorldTree markers share the same UE world coordinates
// (both are extracted from the persistent MainWorld_5 level), so the same
// affine applies to both. Unknown map ids fall through as raw coords.

const WORLD_GRID = {
  scale: 459,
  shiftX: 158000, // subtracted from worldY → game x
  shiftY: 123888, // added to worldX → game y
}
const GRID_MAPS = new Set(['MainWorld', 'WorldTree'])

/**
 * RAW WORLD (x, y[, z]) → Palworld in-game coords. Identity for maps without a
 * known grid. `z` is world height; when supplied it is scaled to in-game units
 * and returned (the caller labels it as the Z / height axis). Omitted when `z`
 * is undefined.
 */
export function toGameCoords(
  mapId: string,
  x: number,
  y: number,
  z?: number,
): { x: number; y: number; z?: number } {
  if (!GRID_MAPS.has(mapId)) return z === undefined ? { x, y } : { x, y, z }
  return {
    x: (y - WORLD_GRID.shiftX) / WORLD_GRID.scale,
    y: (x + WORLD_GRID.shiftY) / WORLD_GRID.scale,
    ...(z === undefined ? {} : { z: z / WORLD_GRID.scale }),
  }
}
