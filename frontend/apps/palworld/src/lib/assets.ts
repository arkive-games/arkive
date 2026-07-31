import type { MapAssets } from '@gamemap/map-engine'
import { RES_BASE } from './urls'

const pad2 = (n: number) => String(n).padStart(2, '0')

export const palworldAssets: MapAssets = {
  // Level 0 tiles sit flat in tiles/<Map>/; pyramid levels in tiles/<Map>/z-<L>/
  // (same XX_YY naming). See the tile-pyramid design spec.
  tileUrl: (map, x, y, level = 0) =>
    `${RES_BASE}/tiles/${map.id}/${level > 0 ? `z-${level}/` : ''}${map.id}_${pad2(x)}_${pad2(y)}.webp`,
  markerIconUrl: (icon) =>
    icon ? `${RES_BASE}/icons/${icon}.webp` : '',
}

/** Note illustration (e.g. `T_Note_SorajimaBoss1`) — a full-page drawing. */
export const noteImageUrl = (stem: string): string => `${RES_BASE}/notes/${stem}.webp`
/** Pal roster icon (e.g. `T_Anubis_icon_normal`). */
export const palIconUrl = (icon: string): string => `${RES_BASE}/icons/${icon}.webp`
/** Element badge icon; the nine real elements have one — boss-only skills
 *  carry element "None", which has no icon file (gate with hasElementIcon). */
export const elementIconUrl = (element: string): string => `${RES_BASE}/icons/element_${element}.webp`
export const hasElementIcon = (element: string): boolean => element !== 'None'
/** Work-suitability icon; OilExtraction has none (callers fall back to the label). */
export const workIconUrl = (work: string): string => `${RES_BASE}/icons/work_${work}.webp`
/** Inventory item icon (e.g. `item_Wood`); present only for items whose icon
 *  texture was exported (callers gate on the icon field / handle 404). */
export const itemIconUrl = (icon: string): string => `${RES_BASE}/icons/${icon}.webp`
