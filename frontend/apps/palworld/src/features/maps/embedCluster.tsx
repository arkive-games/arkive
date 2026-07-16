import { useEffect } from 'react'
import { useMap } from 'react-leaflet'

// Dynamic clustering for embedded mini-maps (PalSpawnMap, RegionDetailPage):
// dense point sets cluster into count-badged pins when zoomed out and split
// apart as you zoom in. Clusters are square grid buckets in map-image px; a
// cell renders at `cell * 2^zoom` screen px, so each tier's cell keeps cluster
// pins ≥ ~44px apart (one pin width) at the tier's minimum zoom. `cell: 0` =
// no clustering, every exact point shows.
export const CLUSTER_TIERS = [
  { minZoom: -Infinity, cell: 704 },
  { minZoom: -3, cell: 352 },
  { minZoom: -2, cell: 176 },
  { minZoom: -1, cell: 88 },
  { minZoom: 0, cell: 0 },
]

export function tierFor(zoom: number): number {
  let tier = 0
  for (let i = 1; i < CLUSTER_TIERS.length; i++) if (zoom >= CLUSTER_TIERS[i].minZoom) tier = i
  return tier
}

/** Reports the map's cluster tier into parent state. Listens to the raw zoom
 *  stream but the value only changes at tier boundaries, so a continuous
 *  smooth-wheel glide re-renders the markers at most once per crossing. */
export function ZoomTierWatcher({ onTier }: { onTier: (tier: number) => void }) {
  const map = useMap()
  useEffect(() => {
    const update = () => onTier(tierFor(map.getZoom()))
    update()
    map.on('zoom', update)
    return () => {
      map.off('zoom', update)
    }
  }, [map, onTier])
  return null
}
