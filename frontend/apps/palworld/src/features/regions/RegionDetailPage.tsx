import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
// The coord helpers come from the three-free `/coords` subpath and the type
// erases, so only the lazy boundary below pulls the engine in.
import type { EmbedPin } from '@gamemap/map-engine-gl'
import { dataToPoint, pointToData } from '@gamemap/map-engine-gl/coords'
const GameMapEmbed = lazy(() => import('../map/GlMapEmbed'))
import { ContentPage } from '../../components/ContentPage'
import { palworldAssets } from '../../lib/assets'
import { loadAreas, type AreaInfo } from '../../lib/areas'
import { loadItems, type ItemEntry, type ItemsBundle } from '../../lib/catalog'
import {
  loadMarkers,
  loadRegions,
  loadStatic,
  type MapMeta,
  type MapsLocale,
  type RegionLocale,
  type Taxonomy,
} from '../../lib/data'
import { loadPals, type PalsBundle } from '../../lib/pals'
import {
  CatalogDataProvider,
  CatalogNotFound,
  CatalogPageLoading,
  CatalogSection,
  ItemLink,
} from '../catalog/components'
import { ChanceBadge, TierBadge, useAreaLabel } from '../items/ItemSources'
import { CLUSTER_TIERS, cellKey, tierFor } from '../maps/embedCluster'

/** Loot-spot pin scale on the embedded map (chest icons are dense; keep small). */
const PIN_SCALE = 0.8

interface LootSpot {
  id: string
  subtype: string
  x: number
  y: number
  /** Named-region id containing the spot (regions/<map>.json), for the tooltip. */
  region?: string
}

interface MapData {
  map: MapMeta
  spots: LootSpot[]
  regionNames: RegionLocale
}

interface Loaded {
  info: AreaInfo | null
  taxonomy: Taxonomy
  mapsL10n: MapsLocale
  /** Per map id in `info.maps`, the meta + this area's loot spots. */
  byMap: Record<string, MapData>
  items: ItemsBundle
  pals: PalsBundle
}

/** One rendered pin: an exact loot spot (`count` 1, keeps its named region for
 *  the tooltip) or a same-subtype cluster drawn with a count badge. `x`/`y` are
 *  DATA space, which is what the embed takes. */
interface RenderSpot {
  x: number
  y: number
  subtype: string
  count: number
  region?: string
}

/** Grid-bucket the spots per subtype (chest clusters never swallow the
 *  fishing spot next door); `cell: 0` shows every exact spot.
 *
 *  Bucketing happens in map-image PIXELS — see `cellKey` — so a cluster's
 *  centroid is averaged there and converted back to DATA for the pin. */
function clusterSpots(map: MapMeta, spots: LootSpot[], cell: number): RenderSpot[] {
  if (cell === 0) {
    return spots.map((p) => ({
      x: p.x,
      y: p.y,
      subtype: p.subtype,
      count: 1,
      region: p.region,
    }))
  }
  interface Bucket {
    xSum: number
    ySum: number
    count: number
    subtype: string
    first: RenderSpot
  }
  const buckets = new Map<string, Bucket>()
  for (const p of spots) {
    const point = dataToPoint(map, p.x, p.y)
    const key = `${p.subtype}:${cellKey(point.x, point.y, cell)}`
    let b = buckets.get(key)
    if (!b) {
      b = {
        xSum: 0,
        ySum: 0,
        count: 0,
        subtype: p.subtype,
        first: { x: p.x, y: p.y, subtype: p.subtype, count: 1, region: p.region },
      }
      buckets.set(key, b)
    }
    b.xSum += point.x
    b.ySum += point.y
    b.count += 1
  }
  return [...buckets.values()].map((b) => {
    if (b.count === 1) return b.first
    const centroid = pointToData(map, b.xSum / b.count, b.ySum / b.count)
    return { x: centroid.x, y: centroid.y, subtype: b.subtype, count: b.count }
  })
}

/** Embedded mini-map of one map's loot spots for the area: pins per subtype,
 *  dynamically clustered by zoom (same tiers as the pal spawn map). */
function RegionLootMap({ area, data, taxonomy }: { area: string; data: MapData; taxonomy: Taxonomy }) {
  // Coarsest tier by default; the embed's first `onZoom` corrects it on mount if
  // the area's footprint opens more zoomed in.
  const [tier, setTier] = useState(0)
  const onZoom = useCallback((zoom: number) => setTier(tierFor(zoom)), [])

  // Re-cluster only when the map data or the zoom tier changes.
  const pins = useMemo<EmbedPin[]>(() => {
    const subtypeDef = (id: string) => taxonomy.subtypes.find((s) => s.id === id)
    return clusterSpots(data.map, data.spots, CLUSTER_TIERS[tier].cell).map((m, i) => {
      const def = subtypeDef(m.subtype)
      return {
        // Clusters are recomputed per tier and have no stable identity of their
        // own, so the index is the id — as it was the React key before.
        id: `spot-${i}`,
        x: m.x,
        y: m.y,
        icon: def?.icon,
        // No icon ⇒ the engine falls back to the dot pin, tinted with this.
        color: def?.color,
        iconScale: PIN_SCALE,
        count: m.count > 1 ? m.count : undefined,
        tooltip: [
          def?.name ?? m.subtype,
          m.count > 1 ? `×${m.count}` : m.region ? data.regionNames[m.region]?.name : undefined,
        ]
          .filter(Boolean)
          .join(' · '),
      }
    })
  }, [data, tier, taxonomy])

  return (
    <div className="relative isolate h-96 overflow-hidden rounded-lg border border-border">
      {/* Keyed on area + map so switching either re-fits onto the new spots
          instead of keeping the previous camera. */}
      <Suspense fallback={<div className="h-full w-full animate-pulse bg-secondary" />}>
        <GameMapEmbed
          key={`${area}-${data.map.id}`}
          map={data.map}
          assets={palworldAssets}
          pins={pins}
          onZoom={onZoom}
        />
      </Suspense>
    </div>
  )
}

/** One blueprint row of the reverse index: the schematic chip + the grade /
 *  odds of its source entry for this area (best entry per kind). */
function RegionBlueprintChip({ item, source, items }: { item: ItemEntry; source: { grade?: number; chance?: number }; items: ItemsBundle }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <ItemLink id={item.id} name={items.text[item.id]?.name ?? item.id} icon={item.icon} />
      <TierBadge grade={source.grade} />
      {source.chance != null ? <ChanceBadge pct={source.chance} /> : null}
    </span>
  )
}

export default function RegionDetailPage() {
  const { id } = useParams({ from: '/regions/$id' })
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'

  const [data, setData] = useState<Loaded | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [mapId, setMapId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoadError(null)
    setData(null)
    setMapId(null)
    Promise.all([loadAreas(), loadStatic(lng), loadItems(lng), loadPals(lng)])
      .then(async ([areasFile, stat, items, pals]) => {
        const info = areasFile.areas[id] ?? null
        const byMap: Record<string, MapData> = {}
        if (info) {
          await Promise.all(
            Object.keys(info.maps).map(async (mid) => {
              const map = stat.maps.find((m) => m.id === mid)
              if (!map) return
              const [markerData, regionData] = await Promise.all([
                loadMarkers(mid, lng),
                loadRegions(mid, lng),
              ])
              byMap[mid] = {
                map,
                spots: markerData.markers
                  .filter((m) => m.lootArea === id)
                  .map((m) => ({ id: m.id, subtype: m.subtype, x: m.x, y: m.y, region: m.region })),
                regionNames: regionData.l10n,
              }
            }),
          )
        }
        if (cancelled) return
        setData({ info, taxonomy: stat.types, mapsL10n: stat.mapsL10n, byMap, items, pals })
        setMapId(info ? Object.keys(info.maps)[0] ?? null : null)
      })
      .catch((err) => {
        console.error(err)
        if (!cancelled) setLoadError(t('loadError'))
      })
    return () => {
      cancelled = true
    }
  }, [lng, id, t])

  // Reverse index: every blueprint obtainable in this area, grouped by channel
  // kind, keeping each item's (grade, chance) for the badge chips.
  const blueprintsByKind = useMemo(() => {
    if (!data) return new Map<string, { item: ItemEntry; source: { grade?: number; chance?: number } }[]>()
    const byKind = new Map<string, { item: ItemEntry; source: { grade?: number; chance?: number } }[]>()
    for (const item of data.items.items) {
      for (const s of item.sources ?? []) {
        if (s.area !== id) continue
        const lst = byKind.get(s.kind)
        const entry = { item, source: { grade: s.grade, chance: s.chance } }
        if (lst) lst.push(entry)
        else byKind.set(s.kind, [entry])
      }
    }
    for (const lst of byKind.values()) lst.sort((a, b) => a.item.sortId - b.item.sortId)
    return byKind
  }, [data, id])

  let body: React.ReactNode
  if (loadError) {
    body = <div className="text-center text-destructive">{loadError}</div>
  } else if (!data) {
    body = <CatalogPageLoading />
  } else if (!data.info) {
    body = <CatalogNotFound message={t('item.notFound', { id })} to="/items" backLabel={t('item.backToList')} />
  } else {
    body = (
      <RegionBody
        id={id}
        data={data}
        mapId={mapId}
        setMapId={setMapId}
        blueprintsByKind={blueprintsByKind}
      />
    )
  }

  return (
    <ContentPage active="/items" title={t('item.title')}>
      <CatalogDataProvider items={data?.items ?? undefined} pals={data?.pals ?? undefined}>
        {body}
      </CatalogDataProvider>
    </ContentPage>
  )
}

/** Kind display order for the reverse index (mirrors BlueprintSections). */
const KIND_ORDER = ['chest', 'fishing', 'supply', 'camp', 'oilrig'] as const

function RegionBody({
  id,
  data,
  mapId,
  setMapId,
  blueprintsByKind,
}: {
  id: string
  data: Loaded
  mapId: string | null
  setMapId: (m: string) => void
  blueprintsByKind: Map<string, { item: ItemEntry; source: { grade?: number; chance?: number } }[]>
}) {
  const { t } = useTranslation()
  const areaLabel = useAreaLabel(data.items)
  const info = data.info!
  const mapIds = Object.keys(info.maps)
  const activeMap = mapId && data.byMap[mapId] ? mapId : mapIds[0]
  const mapData = activeMap ? data.byMap[activeMap] : undefined
  const counts = activeMap ? info.maps[activeMap] : undefined

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="min-w-0">
        <div className="text-sm text-muted-foreground">{t('bp.regionTag')}</div>
        <h1 className="text-3xl font-bold">{areaLabel(id)}</h1>
        <div className="mt-0.5 font-mono text-xs text-muted-foreground">{id}</div>
      </div>

      {/* Loot locations */}
      <CatalogSection title={t('bp.regionSpots')} testId="region-loot-map">
        {mapIds.length > 1 ? (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {mapIds.map((mid) => (
              <button
                key={mid}
                type="button"
                onClick={() => setMapId(mid)}
                className={
                  mid === activeMap
                    ? 'rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground'
                    : 'rounded-md border border-border bg-secondary/40 px-2 py-1 text-xs hover:bg-accent'
                }
              >
                {data.mapsL10n[mid]?.name ?? mid}
              </button>
            ))}
          </div>
        ) : null}
        {counts ? (
          <div className="mb-2 flex flex-wrap gap-1.5" data-testid="region-loot-counts">
            {Object.entries(counts).map(([sub, n]) => (
              <span
                key={sub}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary/40 px-2 py-1 text-sm"
              >
                {data.taxonomy.subtypes.find((s) => s.id === sub)?.name ?? sub}
                <span className="text-xs tabular-nums text-muted-foreground">×{n}</span>
              </span>
            ))}
          </div>
        ) : null}
        {mapData ? <RegionLootMap area={id} data={mapData} taxonomy={data.taxonomy} /> : null}
        {activeMap ? (
          <div className="mt-2 text-right">
            <Link
              to="/"
              search={{ map: activeMap }}
              className="text-xs text-primary hover:underline"
              data-testid="region-open-full-map"
            >
              {t('dungeon.viewOnMap')}
            </Link>
          </div>
        ) : null}
      </CatalogSection>

      {/* Obtainable blueprints */}
      {blueprintsByKind.size ? (
        <CatalogSection title={t('bp.regionBlueprints')} testId="region-blueprints">
          <div className="space-y-3">
            {KIND_ORDER.filter((k) => blueprintsByKind.has(k)).map((kind) => (
              <div key={kind}>
                <div className="mb-1.5 text-xs text-muted-foreground">{t(`bp.kind.${kind}`)}</div>
                <div className="flex flex-wrap gap-1.5">
                  {blueprintsByKind.get(kind)!.map(({ item, source }) => (
                    <RegionBlueprintChip key={item.id} item={item} source={source} items={data.items} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CatalogSection>
      ) : null}

      <Link to="/items" className="inline-block text-sm text-primary hover:underline">
        {t('item.backToList')}
      </Link>
    </div>
  )
}
