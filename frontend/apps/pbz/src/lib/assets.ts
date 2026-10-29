import type { MapAssets } from '@gamemap/map-engine-gl'
import { RES_BASE } from './urls'

const pad2 = (n: number) => String(n).padStart(2, '0')

/**
 * Asset-URL resolution, injected into the engine (which builds no URLs itself).
 * Tiles are palworld's pyramid: level 0 flat in `tiles/<Map>/`, halving levels
 * in `tiles/<Map>/z-<L>/`, `<Map>_<col>_<row>.webp` with (0,0) top-left.
 */
export const pbzAssets: MapAssets = {
  tileUrl: (map, x, y, level = 0) => level > 0
    ? `${RES_BASE}/tiles/${map.id}/z-${level}/${map.id}_${pad2(x)}_${pad2(y)}.webp`
    : `${RES_BASE}/tiles/${map.id}/${map.id}_${pad2(x)}_${pad2(y)}.webp`,
  markerIconUrl: (icon) => (icon ? `${RES_BASE}/icons/${icon}.webp` : ''),
}
