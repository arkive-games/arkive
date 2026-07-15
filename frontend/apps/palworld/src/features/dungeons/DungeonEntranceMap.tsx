import { useEffect, useMemo, useState } from 'react'
import L from 'leaflet'
import { MapContainer, Marker, Tooltip } from 'react-leaflet'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
// Importing the map-engine barrel also registers the smooth wheel-zoom handler.
import { GameMapTiles, createPinIcon, dataToLatLng } from '@gamemap/map-engine'
import { palworldAssets } from '../../lib/assets'
import { loadStatic, loadMarkers, type MapMeta } from '../../lib/data'
import { CatalogSection } from '../catalog/components'

/** Every dungeon portal marker lives on MainWorld (157 portals in the dataset,
 *  none on WorldTree). */
const PORTAL_MAP_ID = 'MainWorld'

interface Entrance {
  id: string
  x: number
  y: number
  name?: string
}

interface Loaded {
  map: MapMeta
  icon?: string
  entrances: Entrance[]
}

/**
 * Embedded mini-map of a dungeon's entrance portals, modeled on PalSpawnMap
 * (bare Leaflet + tiles, no engine chrome). Best-effort: hides itself when
 * the marker data fails to load or the dungeon has no portals.
 */
export function DungeonEntranceMap({
  dungeonId,
  dungeonName,
}: {
  dungeonId: string
  /** Prefills the full map's search box (portal markers share the dungeon name). */
  dungeonName: string
}) {
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'
  const [data, setData] = useState<Loaded | 'error' | null>(null)

  useEffect(() => {
    let cancelled = false
    setData(null)
    Promise.all([loadStatic(lng), loadMarkers(PORTAL_MAP_ID, lng)])
      .then(([stat, markerData]) => {
        if (cancelled) return
        const map = stat.maps.find((m) => m.id === PORTAL_MAP_ID)
        if (!map) {
          setData('error')
          return
        }
        setData({
          map,
          icon: stat.types.subtypes.find((s) => s.id === 'dungeon')?.icon,
          entrances: markerData.markers
            .filter((m) => m.dungeonArea === dungeonId)
            .map((m) => ({ id: m.id, x: m.x, y: m.y, name: markerData.l10n[m.id]?.name })),
        })
      })
      .catch(() => {
        if (!cancelled) setData('error')
      })
    return () => {
      cancelled = true
    }
  }, [lng, dungeonId])

  // Full map extent — open zoomed out so the portal spread is visible at once.
  const bounds = useMemo(() => {
    if (!data || data === 'error') return null
    const { map } = data
    return [
      [0, 0],
      [map.tileHeight * map.tilesCountY, map.tileWidth * map.tilesCountX],
    ] as L.LatLngBoundsExpression
  }, [data])

  if (data === 'error') return null
  if (data && data.entrances.length === 0) return null
  if (!data || !bounds) {
    return <div className="h-80 animate-pulse rounded-lg bg-secondary" />
  }

  const pin = createPinIcon(
    data.icon ? palworldAssets.markerIconUrl(data.icon, data.map) : '',
    0.95,
    false,
  )

  return (
    <CatalogSection
      title={t('dungeon.entrances', { count: data.entrances.length })}
      testId="dungeon-entrance-map"
      className="self-start"
    >
      <div className="relative isolate h-72 overflow-hidden rounded-lg border border-border">
        <MapContainer
          key={dungeonId}
          bounds={bounds}
          maxBounds={bounds}
          crs={L.CRS.Simple}
          minZoom={-4}
          maxZoom={2}
          zoomSnap={0}
          zoomDelta={0.25}
          scrollWheelZoom={false}
          smoothWheelZoom={true}
          smoothSensitivity={4}
          zoomControl={false}
          attributionControl={false}
          className="h-full w-full"
        >
          <GameMapTiles selectedMap={data.map} assets={palworldAssets} />
          {data.entrances.map((p) => (
            <Marker key={p.id} position={dataToLatLng(data.map, p.x, p.y)} icon={pin}>
              {p.name ? <Tooltip direction="top">{p.name}</Tooltip> : null}
            </Marker>
          ))}
        </MapContainer>
        <Link
          to="/"
          search={{ map: PORTAL_MAP_ID, q: dungeonName }}
          className="absolute top-2 right-2 z-[500] rounded bg-background/80 px-2 py-1 text-xs hover:bg-background"
          data-testid="dungeon-entrance-open-full"
        >
          {t('dungeon.viewOnMap')}
        </Link>
      </div>
    </CatalogSection>
  )
}
