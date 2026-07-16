import { useEffect, useMemo, useState } from 'react'
import L from 'leaflet'
import { MapContainer, Marker, Tooltip } from 'react-leaflet'
import { Link, useParams } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
// Importing the map-engine barrel also registers the smooth wheel-zoom handler.
import { GameMapTiles, createPinIcon, dataToLatLng } from '@gamemap/map-engine'
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
import { CLUSTER_TIERS, ZoomTierWatcher } from '../maps/embedCluster'

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
 *  the tooltip) or a same-subtype cluster drawn with a count badge. */
interface RenderSpot {
  pos: L.LatLng
  subtype: string
  count: number
  region?: string
}

/** Grid-bucket the spots per subtype (chest clusters never swallow the
 *  fishing spot next door); `cell: 0` shows every exact spot. */
function clusterSpots(map: MapMeta, spots: LootSpot[], cell: number): RenderSpot[] {
  if (cell === 0) {
    return spots.map((p) => ({
      pos: dataToLatLng(map, p.x, p.y),
      subtype: p.subtype,
      count: 1,
      region: p.region,
    }))
  }
  interface Bucket {
    latSum: number
    lngSum: number
    count: number
    subtype: string
    first: RenderSpot
  }
  const buckets = new Map<string, Bucket>()
  for (const p of spots) {
    const pos = dataToLatLng(map, p.x, p.y)
    const key = `${p.subtype}:${Math.floor(pos.lng / cell)}:${Math.floor(pos.lat / cell)}`
    let b = buckets.get(key)
    if (!b) {
      b = {
        latSum: 0,
        lngSum: 0,
        count: 0,
        subtype: p.subtype,
        first: { pos, subtype: p.subtype, count: 1, region: p.region },
      }
      buckets.set(key, b)
    }
    b.latSum += pos.lat
    b.lngSum += pos.lng
    b.count += 1
  }
  return [...buckets.values()].map((b) =>
    b.count === 1
      ? b.first
      : {
          pos: new L.LatLng(b.latSum / b.count, b.lngSum / b.count),
          subtype: b.subtype,
          count: b.count,
        },
  )
}

/** Embedded mini-map of one map's loot spots for the area: pins per subtype,
 *  dynamically clustered by zoom (same tiers as the pal spawn map). */
function RegionLootMap({ area, data, taxonomy }: { area: string; data: MapData; taxonomy: Taxonomy }) {
  // Coarsest tier by default — matches the initial fit-to-bounds zoom; the
  // watcher corrects it on mount if the map opens more zoomed in.
  const [tier, setTier] = useState(0)
  const subtypeDef = (id: string) => taxonomy.subtypes.find((s) => s.id === id)

  const maxBounds = useMemo(
    () =>
      [
        [0, 0],
        [data.map.tileHeight * data.map.tilesCountY, data.map.tileWidth * data.map.tilesCountX],
      ] as L.LatLngBoundsExpression,
    [data.map],
  )
  // Open on the spot spread (the area's footprint), not the whole map.
  const bounds = useMemo(() => {
    if (!data.spots.length) return maxBounds
    const b = L.latLngBounds(data.spots.map((p) => dataToLatLng(data.map, p.x, p.y)))
    return b.pad(0.12)
  }, [data, maxBounds])

  // Re-cluster only when the map data or the zoom tier changes.
  const markers = useMemo(
    () => clusterSpots(data.map, data.spots, CLUSTER_TIERS[tier].cell),
    [data, tier],
  )

  // createPinIcon caches the underlying DivIcon by visual signature, so
  // building per marker stays cheap.
  const iconFor = (m: RenderSpot) => {
    const def = subtypeDef(m.subtype)
    const badge = m.count > 1 ? { count: m.count } : {}
    return def?.icon
      ? createPinIcon(palworldAssets.markerIconUrl(def.icon, data.map), PIN_SCALE, false, badge)
      : createPinIcon('', PIN_SCALE, false, { variant: 'pin', innerColor: def?.color, ...badge })
  }

  return (
    <div className="relative isolate h-96 overflow-hidden rounded-lg border border-border">
      <MapContainer
        key={`${area}-${data.map.id}`}
        bounds={bounds}
        maxBounds={maxBounds}
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
        <ZoomTierWatcher onTier={setTier} />
        {markers.map((m, i) => {
          const label = [
            subtypeDef(m.subtype)?.name ?? m.subtype,
            m.count > 1 ? `×${m.count}` : m.region ? data.regionNames[m.region]?.name : undefined,
          ]
            .filter(Boolean)
            .join(' · ')
          return (
            <Marker key={i} position={m.pos} icon={iconFor(m)}>
              <Tooltip direction="top">{label}</Tooltip>
            </Marker>
          )
        })}
      </MapContainer>
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
    <ContentPage active="/items" title={t('item.title')} maxWidth="max-w-5xl">
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
