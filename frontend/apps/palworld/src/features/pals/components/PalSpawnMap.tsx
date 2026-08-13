import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Moon } from 'lucide-react'
import {
  GameMapEmbed,
  dataToPoint,
  pointToData,
  type EmbedPin,
  type PointCloud,
} from '@gamemap/map-engine-gl'
import { cn } from '@gamemap/ui'
import { palworldAssets } from '../../../lib/assets'
import { loadPalSpawns, type PalSpawns, type SpawnKind, type SpawnPoint } from '../../../lib/pals'
import { dataUrl } from '../../../lib/urls'
import { CLUSTER_TIERS, cellKey, tierFor } from '../../maps/embedCluster'

type MapsLocale = Record<string, { name: string; shortName?: string }>

function useMapLabels(lng: string): Record<string, string> {
  const [labels, setLabels] = useState<Record<string, string>>({})
  useEffect(() => {
    let cancelled = false
    fetch(dataUrl(`locales/${lng}/maps.json`))
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
 * more than one map, a toggle switches between them. Bare tiles and pins (no
 * full engine chrome), mirroring aion2's wiki `EmbeddedMap`.
 */
// Boss category color (data_src/types.yaml) — boss spawn points ring red.
const BOSS_RING = '#ef4444'
// Night-restricted wild points ring indigo (boss identity wins over night).
const NIGHT_RING = '#818cf8'

// Match the main map's pal marker: circular portrait at scale 0.9. Boss points
// sit slightly larger so they read as highlighted.
const WILD_SCALE = 0.9
const BOSS_SCALE = 1

// Habitat cloud discs — the game's own Paldex point clouds, drawn under the pins.
const CLOUD_RADIUS = 3
const CLOUD_FILL_OPACITY = 0.45
const CLOUD_COLORS = { day: '#f59e0b', night: '#6366f1' } as const

// Dynamic clustering: tiers shared by the embedded mini-maps (see
// features/maps/embedCluster). Wild spawn points cluster into count-badged pins
// when zoomed out and split apart as you zoom in (bosses never cluster).
// Above this many wild points, the deepest tier keeps clustering (with a cell
// fine enough to only merge same-spawner stacks) instead of showing all — a
// few common pals carry 1.5k–4.9k exact points (spawner grids sit ~50 m apart).
const SHOW_ALL_MAX = 1500
const DENSE_FINEST_CELL = 44

/** One rendered pin: an exact spawn point (`count` 1) or a cluster of nearby
 *  wild points (`count` > 1, drawn with a count badge at the centroid). `x`/`y`
 *  are DATA space, which is what the embed takes. */
interface RenderMarker {
  x: number
  y: number
  kind: SpawnKind
  night?: boolean
  level?: string
  /** Pack size (single points only; clusters omit it). */
  pack?: string
  count: number
}

/**
 * Bucketing happens in map-image PIXELS — see `cellKey` — so a cluster's
 * centroid is averaged there and converted back to DATA for the pin.
 */
function clusterPoints(
  map: PalSpawns['map'],
  points: SpawnPoint[],
  cell: number,
): RenderMarker[] {
  const wild: RenderMarker[] = []
  // Bosses render last (= on top) so overlapping wild pins never hide them.
  const bosses: RenderMarker[] = []
  interface Bucket {
    xSum: number
    ySum: number
    count: number
    allNight: boolean
    lvMin: number
    lvMax: number
    first: SpawnPoint
  }
  const buckets = new Map<string, Bucket>()
  for (const p of points) {
    if (p.kind === 'boss') {
      bosses.push({ x: p.x, y: p.y, kind: 'boss', night: p.night, level: p.level, count: 1 })
      continue
    }
    if (cell === 0) {
      wild.push({ x: p.x, y: p.y, kind: 'wild', night: p.night, level: p.level, pack: p.pack, count: 1 })
      continue
    }
    const point = dataToPoint(map, p.x, p.y)
    const key = cellKey(point.x, point.y, cell)
    let b = buckets.get(key)
    if (!b) {
      b = {
        xSum: 0,
        ySum: 0,
        count: 0,
        allNight: true,
        lvMin: Infinity,
        lvMax: -Infinity,
        first: p,
      }
      buckets.set(key, b)
    }
    b.xSum += point.x
    b.ySum += point.y
    b.count += 1
    if (!p.night) b.allNight = false
    // Levels arrive preformatted ("Lv.12" / "Lv.5–9"); merge cluster ranges by
    // pulling the numbers back out.
    for (const n of p.level?.match(/\d+/g) ?? []) {
      const lv = Number(n)
      if (lv < b.lvMin) b.lvMin = lv
      if (lv > b.lvMax) b.lvMax = lv
    }
  }
  for (const b of buckets.values()) {
    if (b.count === 1) {
      const p = b.first
      wild.push({ x: p.x, y: p.y, kind: 'wild', night: p.night, level: p.level, pack: p.pack, count: 1 })
      continue
    }
    const centroid = pointToData(map, b.xSum / b.count, b.ySum / b.count)
    wild.push({
      x: centroid.x,
      y: centroid.y,
      kind: 'wild',
      night: b.allNight,
      level: Number.isFinite(b.lvMin)
        ? b.lvMin === b.lvMax
          ? `Lv.${b.lvMin}`
          : `Lv.${b.lvMin}–${b.lvMax}`
        : undefined,
      count: b.count,
    })
  }
  return [...wild, ...bosses]
}

/**
 * A rendered spawn point as an embed pin. Bosses ring red and sit slightly
 * larger; night-restricted wild points and clusters ring indigo (a cluster counts
 * as night only when every merged point is); other wild pins keep the default
 * white ring. Clusters carry a count badge, and the level / pack size becomes the
 * hover tooltip.
 */
function toPin(m: RenderMarker, index: number, palIcon: string): EmbedPin {
  const ringColor = m.kind === 'boss' ? BOSS_RING : m.night ? NIGHT_RING : undefined
  const tooltip = [m.level, m.pack ? `×${m.pack}` : undefined].filter(Boolean).join(' · ')
  return {
    // Clusters are recomputed per tier and have no identity of their own, so the
    // index is the id — as it was the React key before.
    id: `spawn-${index}`,
    x: m.x,
    y: m.y,
    icon: palIcon,
    variant: 'circular',
    iconScale: m.kind === 'boss' ? BOSS_SCALE : WILD_SCALE,
    color: ringColor,
    count: m.count > 1 ? m.count : undefined,
    tooltip: tooltip || undefined,
  }
}

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
  // Coarsest tier by default; the embed's first `onZoom` corrects it on mount if
  // a map opens more zoomed in.
  const [tier, setTier] = useState(0)
  const onZoom = useCallback((zoom: number) => setTier(tierFor(zoom)), [])
  // Paldex habitat cloud overlay: off / day / night (game's own point clouds).
  const [cloud, setCloud] = useState<'off' | 'day' | 'night'>('off')

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

  // Re-cluster only when the pal/map or the zoom tier changes — a full pass
  // over ≤ 5k points is a few ms, and the tier only flips at zoom boundaries.
  const pins = useMemo<EmbedPin[]>(() => {
    if (!map || !current) return []
    let cell = CLUSTER_TIERS[tier].cell
    if (cell === 0 && wildCount > SHOW_ALL_MAX) cell = DENSE_FINEST_CELL
    return clusterPoints(map, current.points, cell).map((m, i) => toPin(m, i, palIcon))
  }, [map, current, tier, wildCount, palIcon])

  const clouds = useMemo<PointCloud[]>(() => {
    if (cloud === 'off' || !current?.paldex) return []
    const points = current.paldex[cloud] ?? []
    if (!points.length) return []
    return [
      {
        id: cloud,
        points,
        radius: CLOUD_RADIUS,
        color: CLOUD_COLORS[cloud],
        fillOpacity: CLOUD_FILL_OPACITY,
      },
    ]
  }, [cloud, current])

  if (spawns && spawns.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="pal-spawn-empty">
        {emptyMessage ?? t('pal.noSpawns')}
      </p>
    )
  }
  if (!spawns || !map || !current) {
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

      {current.paldex ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">
            {t('pal.habitatLabel')}:
          </span>
          {(['day', 'night'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setCloud(cloud === k ? 'off' : k)}
              data-testid={`habitat-${k}`}
              className={cn(
                'rounded px-2 py-0.5 text-xs font-medium',
                cloud === k
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-accent',
              )}
            >
              {k === 'day' ? t('pal.habitatDay') : t('pal.habitatNight')}
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
        {/* Keyed on the map so switching a multi-map pal's tab opens on the whole
            map again rather than inheriting the previous camera. */}
        <GameMapEmbed
          key={`${map.id}:${current.points.length}`}
          map={map}
          assets={palworldAssets}
          pins={pins}
          dots={clouds}
          onZoom={onZoom}
          // The whole map, not this pal's spawn cluster: where a pal does NOT
          // live is as much of the answer as where it does.
          initialFit="map"
        />
        {(hasWild && hasBoss) || (hasNight && !allNight) ? (
          <div className="absolute bottom-2 left-2 z-[var(--arkive-layer-map-control)] flex items-center gap-3 rounded bg-background/80 px-2 py-1 text-xs">
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
            className="absolute bottom-2 left-2 z-[var(--arkive-layer-map-control)] flex items-center gap-1.5 rounded bg-background/80 px-2 py-1 text-xs text-indigo-500 dark:text-indigo-400"
            data-testid="pal-spawn-night-note"
          >
            <Moon className="h-3 w-3" aria-hidden />
            {t('pal.nightOnlyNote')}
          </div>
        ) : null}
        <Link
          to="/"
          search={{ map: map.id, q: palName }}
          className="absolute top-2 right-2 z-[var(--arkive-layer-map-control)] rounded bg-background/80 px-2 py-1 text-xs hover:bg-background"
          data-testid="pal-spawn-open-full"
        >
          {t('pal.viewOnMap')}
        </Link>
      </div>
    </div>
  )
}
