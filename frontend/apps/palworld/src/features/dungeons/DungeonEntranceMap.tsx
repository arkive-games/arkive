import { useEffect, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { GameMapEmbed, type EmbedPin } from '@gamemap/map-engine-gl'
import { palworldAssets } from '../../lib/assets'
import { loadStatic, loadMarkers, type MapMeta } from '../../lib/data'
import { CatalogSection } from '../catalog/components'

/** Every dungeon portal marker lives on MainWorld (157 portals in the dataset,
 *  none on WorldTree). */
const PORTAL_MAP_ID = 'MainWorld'

/** Portal pins sit a touch under full size so a dense cluster stays readable. */
const PIN_SCALE = 0.95

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
 * (bare tiles and pins, no engine chrome). Best-effort: hides itself when the
 * marker data fails to load or the dungeon has no portals.
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

  const pins = useMemo<EmbedPin[]>(() => {
    if (!data || data === 'error') return []
    return data.entrances.map((p) => ({
      id: p.id,
      x: p.x,
      y: p.y,
      icon: data.icon,
      iconScale: PIN_SCALE,
      tooltip: p.name,
    }))
  }, [data])

  if (data === 'error') return null
  if (data && data.entrances.length === 0) return null
  if (!data) {
    return <div className="h-80 animate-pulse rounded-lg bg-secondary" />
  }

  return (
    <CatalogSection
      title={t('dungeon.entrances', { count: data.entrances.length })}
      testId="dungeon-entrance-map"
      className="self-start"
    >
      <div className="relative isolate h-72 overflow-hidden rounded-lg border border-border">
        {/* Keyed on the dungeon so switching pages opens on the whole map again
            rather than inheriting wherever the previous one was panned to. */}
        <GameMapEmbed
          key={dungeonId}
          map={data.map}
          assets={palworldAssets}
          pins={pins}
          initialFit="map"
        />
        <Link
          to="/"
          search={{ map: PORTAL_MAP_ID, q: dungeonName }}
          className="absolute top-2 right-2 z-[var(--arkive-layer-map-control)] rounded bg-background/80 px-2 py-1 text-xs hover:bg-background"
          data-testid="dungeon-entrance-open-full"
        >
          {t('dungeon.viewOnMap')}
        </Link>
      </div>
    </CatalogSection>
  )
}
