import type { MapAssets } from '@gamemap/map-engine'
import { RES_BASE } from './urls'

const pad2 = (n: number) => String(n).padStart(2, '0')

/**
 * Asset-URL resolution, injected into the engine (which builds no URLs itself).
 * Tile grid: ONE native zoom level, `<res>/tiles/<MapId>/<MapId>_<col>_<row>.webp`,
 * (0,0) top-left, row index increasing downward — the same convention palworld
 * and aion2 use. The engine rejects out-of-grid indices before calling tileUrl.
 */
export const vrisingAssets: MapAssets = {
  tileUrl: (map, x, y) => `${RES_BASE}/tiles/${map.id}/${map.id}_${pad2(x)}_${pad2(y)}.webp`,
  markerIconUrl: (icon) => (icon ? `${RES_BASE}/icons/${icon}.webp` : ''),
}

/** Whole-map preview WebP written by the tiles stage. */
export const mapPreviewUrl = (mapId: string): string => `${RES_BASE}/preview/${mapId}.webp`

/** Resolve a resource-relative marker image emitted by the data pipeline. */
export const markerImageUrl = (path: string): string => `${RES_BASE}/${path.replace(/^\/+/, '')}`
