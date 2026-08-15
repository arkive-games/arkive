import type { MapAssets } from '@gamemap/map-engine-gl'
import { dataUrl } from '@/lib/data'

const pad2 = (n: number) => String(n).padStart(2, '0')

/**
 * Lost Ark has no `resource-lostark` repo, so the minimap tiles ride along in
 * `data-lostark` beside the JSON and resolve through the same `dataUrl` helper,
 * which stamps the artifact version onto every request.
 *
 * Marker icons resolve to '': the client ships no artwork for a deploy actor,
 * so the engine falls back to a coloured pin from the subtype rather than have
 * us invent icons the game does not have.
 */
export const lostarkMapAssets: MapAssets = {
  tileUrl: (map, x, y) => dataUrl(`tiles/${map.id}/${map.id}_${pad2(x)}_${pad2(y)}.webp`),
  markerIconUrl: () => '',
}
