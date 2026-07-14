import { useEffect, useMemo, useState } from 'react'
import L from 'leaflet'
import { CircleMarker, MapContainer, Marker, Tooltip } from 'react-leaflet'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Moon } from 'lucide-react'
// Importing the map-engine barrel also registers the smooth wheel-zoom handler.
import { GameMapTiles, createPinIcon, dataToLatLng } from '@gamemap/map-engine'
import { cn } from '@gamemap/ui'
import { palworldAssets, palIconUrl } from '../../../lib/assets'
import { loadPalSpawns, type PalSpawns, type SpawnKind } from '../../../lib/pals'
import { DATA_BASE } from '../../../lib/urls'

type MapsLocale = Record<string, { name: string; shortName?: string }>

function useMapLabels(lng: string): Record<string, string> {
  const [labels, setLabels] = useState<Record<string, string>>({})
  useEffect(() => {
    let cancelled = false
    fetch(`${DATA_BASE}/locales/${lng}/maps.json`)
      .then((r) => (r.ok ? (r.json() as Promise<MapsLocale>) : ({} as MapsLocale)))
      .then((m) => {
        if (cancelled) return
        const out: Record<string, string> = {}
        for (const [id, v] of Object.entries(m)) out[id] = v.shortName ?? v.name ?? id
        setLabels(out)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [lng])
  return labels
}

/**
 * Embedded mini-map of a single pal's exact spawn positions (unclustered, from
 * `spawns/<palId>.json`). Loads spawns across every map; when the pal spawns on
 * more than one map, a toggle switches between them. Bare Leaflet + tiles (no
 * full engine chrome), mirroring aion2's wiki `EmbeddedMap`.
 */
// Boss category color (data_src/types.yaml) — boss spawn points ring red.
const BOSS_RING = '#ef4444'
// Night-restricted wild points ring indigo (boss identity wins over night).
const NIGHT_RING = '#818cf8'
// Above this many wild points on one map, icon pins stack into an unreadable
// pile (spawner grids sit ~50 m apart; verified at ~270 points); fall back to
// small canvas-rendered dots. Bosses stay pins.
const MAX_PIN_POINTS = 50
// Wild dot style, matching the legend's muted, white-ringed swatch; night
// points keep their indigo ring in dot form too.
const dotStyle = (night?: boolean): L.PathOptions => ({
  color: night ? NIGHT_RING : 'rgba(255,255,255,0.9)',
  weight: 1,
  fillColor: '#64748b',
  fillOpacity: 0.9,
})

export function PalSpawnMap({
  palId,
  palIcon,
  palName,
  className,
  emptyMessage,
}: {
  palId: string
  palIcon: string
  /** Prefills the full map's search box so it surfaces this pal's markers. */
  palName?: string
  className?: string
  /** Shown when the pal has no spawn points at all (page decides the wording). */
  emptyMessage?: string
}) {
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'
  const mapLabels = useMapLabels(lng)
  const [spawns, setSpawns] = useState<PalSpawns[] | null>(null)
  const [active, setActive] = useState(0)

  useEffect(() => {
    let cancelled = false
    setSpawns(null)
    setActive(0)
    loadPalSpawns(palId)
      .then((s) => {
        if (!cancelled) setSpawns(s)
      })
      .catch(() => {
        if (!cancelled) setSpawns([])
      })
    return () => {
      cancelled = true
    }
  }, [palId])

  const current = spawns?.[active]
  const map = current?.map
  const wildCount = current?.points.filter((p) => p.kind === 'wild').length ?? 0
  const hasWild = wildCount > 0
  const hasBoss = !!current?.points.some((p) => p.kind === 'boss')
  const hasNight = !!current?.points.some((p) => p.night)
  // Every point night-restricted → one prominent note instead of a legend entry.
  const allNight = !!current && current.points.length > 0 && current.points.every((p) => p.night)
  // High-volume pals (5k+ exact points) would choke on icon pins; draw their
  // wild points as canvas dots instead. Bosses always stay pins.
  const useDots = wildCount > MAX_PIN_POINTS

  // Match the main map's pal marker: circular portrait at scale 0.9.
  const iconUrl = useMemo(() => palIconUrl(palIcon), [palIcon])
  // Boss points ring red and sit slightly larger so they read as highlighted;
  // night-restricted wild points ring indigo; other wild points keep the
  // default white ring at scale 0.9.
  const iconFor = (kind: SpawnKind, night?: boolean) =>
    createPinIcon(iconUrl, kind === 'boss' ? 1 : 0.9, false, {
      variant: 'circular',
      ...(kind === 'boss' ? { ringColor: BOSS_RING } : night ? { ringColor: NIGHT_RING } : {}),
    })

  // Full map extent — the embedded map opens zoomed out to show the whole map
  // (rather than fitting tightly to this pal's spawn cluster).
  const bounds = useMemo(() => {
    if (!map) return null
    const width = map.tileWidth * map.tilesCountX
    const height = map.tileHeight * map.tilesCountY
    return [
      [0, 0],
      [height, width],
    ] as L.LatLngBoundsExpression
  }, [map])

  if (spawns && spawns.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="pal-spawn-empty">
        {emptyMessage ?? t('pal.noSpawns')}
      </p>
    )
  }
  if (!spawns || !map || !current || !bounds) {
    return <div className={cn('animate-pulse rounded-lg bg-secondary', className ?? 'h-72')} />
  }

  return (
    <div className="space-y-2" data-testid="pal-spawn-map">
      {spawns.length > 1 ? (
        <div className="flex flex-wrap gap-1.5">
          {spawns.map((s, i) => (
            <button
              key={s.map.id}
              type="button"
              onClick={() => setActive(i)}
              className={cn(
                'rounded px-2 py-0.5 text-xs font-medium',
                i === active
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-accent',
              )}
            >
              {mapLabels[s.map.id] ?? s.map.id} ({s.points.length})
            </button>
          ))}
        </div>
      ) : null}

      <div
        className={cn(
          'relative isolate overflow-hidden rounded-lg border border-border',
          className ?? 'h-72',
        )}
      >
        <MapContainer
          key={`${map.id}:${current.points.length}`}
          bounds={bounds}
          maxBounds={bounds}
          crs={L.CRS.Simple}
          preferCanvas={true}
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
          <GameMapTiles selectedMap={map} assets={palworldAssets} />
          {current.points.map((p, i) =>
            p.kind === 'wild' && useDots ? (
              <CircleMarker
                key={i}
                center={dataToLatLng(map, p.x, p.y)}
                radius={3}
                pathOptions={dotStyle(p.night)}
              >
                {p.level ? <Tooltip direction="top">{p.level}</Tooltip> : null}
              </CircleMarker>
            ) : (
              <Marker key={i} position={dataToLatLng(map, p.x, p.y)} icon={iconFor(p.kind, p.night)}>
                {p.level ? <Tooltip direction="top">{p.level}</Tooltip> : null}
              </Marker>
            ),
          )}
        </MapContainer>
        {(hasWild && hasBoss) || (hasNight && !allNight) ? (
          <div className="absolute bottom-2 left-2 z-[500] flex items-center gap-3 rounded bg-background/80 px-2 py-1 text-xs">
            <span className="flex items-center gap-1">
              <span className="inline-block size-2.5 rounded-full border border-[rgba(255,255,255,0.9)] bg-muted-foreground/40" />
              {t('pal.spawnWild')}
            </span>
            {hasNight ? (
              <span className="flex items-center gap-1">
                <span
                  className="inline-block size-2.5 rounded-full bg-muted-foreground/40"
                  style={{ border: `1.5px solid ${NIGHT_RING}` }}
                />
                {t('pal.nightOnly')}
              </span>
            ) : null}
            {hasBoss ? (
              <span className="flex items-center gap-1">
                <span
                  className="inline-block size-2.5 rounded-full bg-muted-foreground/40"
                  style={{ border: `1.5px solid ${BOSS_RING}` }}
                />
                {t('pal.spawnBoss')}
              </span>
            ) : null}
          </div>
        ) : null}
        {allNight ? (
          <div
            className="absolute bottom-2 left-2 z-[500] flex items-center gap-1.5 rounded bg-background/80 px-2 py-1 text-xs text-indigo-500 dark:text-indigo-400"
            data-testid="pal-spawn-night-note"
          >
            <Moon className="h-3 w-3" aria-hidden />
            {t('pal.nightOnlyNote')}
          </div>
        ) : null}
        <Link
          to="/"
          search={{ map: map.id, q: palName }}
          className="absolute top-2 right-2 z-[500] rounded bg-background/80 px-2 py-1 text-xs hover:bg-background"
          data-testid="pal-spawn-open-full"
        >
          {t('pal.viewOnMap')}
        </Link>
      </div>
    </div>
  )
}
