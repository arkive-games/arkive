import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearch } from '@tanstack/react-router'
// Types erase at build time, and `/coords` is a three-free module, so the engine
// itself stays out of the entry chunk (it arrives through the `lazy()` boundary
// below). Importing `worldToPixel` from the barrel instead would undo that.
import type { EngineMarker, GameMapViewProps, GlMapRef } from '@gamemap/map-engine-gl'
import { worldToPixel } from '@gamemap/map-engine-gl/coords'
import {
  ArkiveMobileMapControls, FilterPanel, SearchPanel, ShellGameHeader, ShellLayout, ShellMapSelect, ShellSidebar,
  readMapView, useMapViewMemory,
  type FilterCategory, type MapViewState, type SearchItem,
  canUseLodTiers,
} from '@gamemap/map-shell'
import type { MarkerTypeSubtype, RegionInstance } from '@gamemap/data-contract'
import { useIsMobile } from '@gamemap/ui'
import { ArkiveAccountControl } from '@gamemap/auth'
import { defineMemoryRecord, isBoolean, memoryPolicy, useMemoryState } from '@gamemap/state-memory'
import {
  loadStatic, loadMarkers, loadRegions,
  type MapMeta, type MarkerLocale, type MarkerRow, type MapsLocale,
  type RegionLocale, type Taxonomy, type TypesLocale,
} from '../../lib/data'
import { markerImageUrl, vrisingAssets } from '../../lib/assets'
import { cleanGameText } from '../../lib/gameText'
import { mapViewStore, readVisibleSubtypes, writeVisibleSubtypes } from '../../lib/storage'
import { vrisingTheme } from '../../theme'
import { TopNav } from '../../components/TopNav'
import { InfoSidebar } from '../../components/InfoSidebar'
import { buildPatrolRouteLines } from './patrolRoutes'
import { regionAt, sortRegionsByArea } from './subzone'
import { VrisingMarkerDetail } from './popup'

const MAP_ID = 'Vardoran'
const labelsRecord = defineMemoryRecord({
  id: 'show-labels', namespace: 'vrising', surface: 'map',
  ...memoryPolicy.userPreference('reset-map-labels'),
  schemaVersion: '1.0.0', defaultValue: () => false, validate: isBoolean,
})
const regionsRecord = defineMemoryRecord({
  id: 'show-regions', namespace: 'vrising', surface: 'map',
  ...memoryPolicy.userPreference('reset-map-boundaries'),
  schemaVersion: '1.0.0',
  defaultValue: () => typeof window === 'undefined'
    || !window.matchMedia('(max-width: 767px)').matches,
  validate: isBoolean,
})

// The map engine behind a lazy boundary — see features/map/GlMapView.
const GameMapView = lazy(() => import('./GlMapView'))

export default function MapPage() {
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'
  // A small {getCenter,getZoom,flyTo,project,dispose} handle, not a DOM map.
  const glMapRef = useRef<GlMapRef | null>(null)
  const isMobile = useIsMobile()
  const [filterSheetOpen, setFilterSheetOpen] = useState(false)
  const [searchSheetOpen, setSearchSheetOpen] = useState(false)

  // Restore the persisted subtype selection once at mount; null = never chosen,
  // so the taxonomy's `defaultActive` flags apply instead.
  const [restoredVisible] = useState<Set<string> | null>(readVisibleSubtypes)
  const visibleInitialized = useRef(restoredVisible != null)

  const { q: initialQuery } = useSearch({ from: '/' })

  const [staticData, setStaticData] = useState<{
    maps: MapMeta[]; types: Taxonomy; mapsL10n: MapsLocale; typesL10n: TypesLocale
  } | null>(null)
  const [markerData, setMarkerData] = useState<{
    markers: MarkerRow[]
    l10n: MarkerLocale
  } | null>(null)
  const [regionData, setRegionData] = useState<{ regions: RegionInstance[]; l10n: RegionLocale } | null>(null)
  const [visible, setVisible] = useState<Set<string>>(() => restoredVisible ?? new Set())
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null)
  const [hoveredMarkerId, setHoveredMarkerId] = useState<string | null>(null)
  const [selectedPosition, setSelectedPosition] = useState<{ x: number; y: number } | null>(null)
  const [restoredMarkerId, setRestoredMarkerId] = useState<string | null>(null)
  const [searchResultIds, setSearchResultIds] = useState<string[]>([])
  const [showLabels, setShowLabels] = useMemoryState(labelsRecord)
  const [showRegions, setShowRegions] = useMemoryState(regionsRecord)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Camera + selection persistence. `useMapViewMemory` is storage-free; the
  // adapter comes from lib/storage.
  const { initialView, saveView, saveMarker } = useMapViewMemory(mapViewStore, MAP_ID)
  // `initialView` is frozen at page mount while `onViewChange` streams the live
  // camera into storage, so a remount would otherwise restore the camera the page
  // loaded with and jump. vrising has a single map, so nothing re-reads it during a
  // session — the state exists to keep the frozen value out of the render path.
  const [mountView] = useState<MapViewState | null>(initialView)

  useEffect(() => {
    let cancelled = false
    setLoadError(null)
    loadStatic(lng)
      .then((d) => {
        if (cancelled) return
        setStaticData(d)
        if (!visibleInitialized.current) {
          visibleInitialized.current = true
          setVisible(new Set(d.types.subtypes.filter((s) => s.defaultActive).map((s) => s.id)))
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return
        console.error(err)
        setLoadError(t('loadError'))
      })
    return () => { cancelled = true }
  }, [lng, t])

  useEffect(() => { writeVisibleSubtypes(visible) }, [visible])

  useEffect(() => {
    let cancelled = false
    setMarkerData(null)
    setSelectedMarkerId(null)
    setSelectedPosition(null)
    setRestoredMarkerId(null)
    loadMarkers(MAP_ID, lng)
      .then((d) => {
        if (cancelled) return
        setMarkerData(d)
        // Reopen the stored selection with the fly suppressed, so the restored
        // camera stays put instead of being yanked to the marker.
        const stored = readMapView(mapViewStore, MAP_ID).marker
        if (stored && d.markers.some((m) => m.id === stored)) {
          setRestoredMarkerId(stored)
          setSelectedMarkerId(stored)
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return
        console.error(err)
        setLoadError(t('loadError'))
      })
    return () => { cancelled = true }
  }, [lng, t])

  useEffect(() => {
    let cancelled = false
    setRegionData(null)
    loadRegions(MAP_ID, lng)
      .then((d) => { if (!cancelled) setRegionData(d) })
      .catch((err: unknown) => { console.error(err) })
    return () => { cancelled = true }
  }, [lng])

  useEffect(() => {
    if (markerData) saveMarker(selectedMarkerId)
  }, [markerData, selectedMarkerId, saveMarker])

  const map = staticData?.maps.find((m) => m.id === MAP_ID)

  const subtypeMetaMap = useMemo(
    () => new Map<string, MarkerTypeSubtype>((staticData?.types.subtypes ?? []).map((s) => [s.id, s])),
    [staticData],
  )

  // Localize + resolve subtype metadata here: the engine reads no i18n and knows
  // nothing about the taxonomy.
  const engineMarkers: EngineMarker[] = useMemo(() => {
    if (!staticData || !markerData) return []
    return markerData.markers.map((m) => {
      const loc = markerData.l10n[m.id]
      const subtypeL10n = staticData.typesL10n.subtypes[m.subtype]
      const subLabel = subtypeL10n?.name ?? m.subtype
      return {
        id: m.id,
        subtype: m.subtype,
        category: m.category,
        x: m.x,
        y: m.y,
        z: m.z,
        region: m.region,
        resourceKind: m.resourceKind,
        resourceDetail: m.resourceDetail,
        movement: m.movement,
        route: m.route,
        routePrecision: m.routePrecision,
        positionPrecision: m.positionPrecision,
        pairedMarkerId: m.pairedMarkerId,
        connection: m.connection,
        connectionGroup: m.connectionGroup,
        bossPrefab: m.bossPrefab,
        bossLevel: m.bossLevel,
        bossAct: m.bossAct,
        bossRegion: m.bossRegion,
        icon: m.icon,
        indexInSubtype: m.indexInSubtype,
        images: (m.images ?? []).map(markerImageUrl),
        contributors: [] as string[],
        localizedName: loc?.name ?? subLabel,
        localizedDescription: loc?.description ? cleanGameText(loc.description, '') : undefined,
        subtypeLabel: subLabel,
        subtypeMeta: subtypeMetaMap.get(m.subtype),
      }
    })
  }, [staticData, markerData, subtypeMetaMap])

  const forceShowIds = useMemo(() => new Set(searchResultIds), [searchResultIds])
  const selectedMarker = useMemo(
    () => engineMarkers.find((marker) => marker.id === selectedMarkerId),
    [engineMarkers, selectedMarkerId],
  )

  const patrolRouteLines = useMemo(
    () => buildPatrolRouteLines(engineMarkers, visible, hoveredMarkerId),
    [engineMarkers, visible, hoveredMarkerId],
  )

  const searchItems: SearchItem[] = useMemo(() => {
    if (!staticData || !map) return []
    return engineMarkers.map((m) => {
      const iconName = m.icon || m.subtypeMeta?.icon || ''
      const catId = m.subtypeMeta?.category ?? m.category
      return {
        id: m.id,
        name: m.localizedName || '',
        description: m.connectionGroup
          ? `${t('marker.connectionGroup', { group: m.connectionGroup })} · ${t('marker.bidirectional')}`
          : m.localizedDescription,
        subtypeLabel: m.subtypeLabel ?? m.subtype,
        categoryLabel: catId ? (staticData.typesL10n.categories[catId]?.name ?? catId) : '',
        iconUrl: iconName ? vrisingAssets.markerIconUrl(iconName, map) : undefined,
        x: m.x,
        y: m.y,
      }
    })
  }, [engineMarkers, staticData, map, t])

  const countBySubtype = useMemo(() => {
    const counts = new Map<string, number>()
    for (const m of markerData?.markers ?? []) {
      counts.set(m.subtype, (counts.get(m.subtype) ?? 0) + 1)
    }
    return counts
  }, [markerData])

  const filterCategories: FilterCategory[] = useMemo(() => {
    if (!staticData) return []
    return staticData.types.categories
      .map((cat) => ({
        id: cat.id,
        label: staticData.typesL10n.categories[cat.id]?.name ?? cat.id,
        subtypes: staticData.types.subtypes
          .filter((s) => s.category === cat.id)
          .filter((s) => (countBySubtype.get(s.id) ?? 0) > 0)
          .map((s) => ({
            id: s.id,
            label: staticData.typesL10n.subtypes[s.id]?.name ?? s.id,
            active: visible.has(s.id),
            count: countBySubtype.get(s.id) ?? 0,
          })),
      }))
      .filter((cat) => cat.subtypes.length > 0)
  }, [staticData, visible, countBySubtype])

  const onToggleSubtype = useCallback((id: string) => {
    setVisible((v) => {
      const next = new Set(v)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])

  const onSetCategory = useCallback((categoryId: string, show: boolean) => {
    setVisible((v) => {
      if (!staticData) return v
      const next = new Set(v)
      for (const s of staticData.types.subtypes) {
        if (s.category !== categoryId) continue
        if (show) next.add(s.id); else next.delete(s.id)
      }
      return next
    })
  }, [staticData])

  const onToggleMarker = useCallback((id: string | null) => {
    setSelectedMarkerId((cur) => (cur === id ? null : id))
  }, [])
  const onHoverMarker = useCallback((id: string | null) => {
    setHoveredMarkerId(id)
  }, [])
  const onSelectSearchMarker = useCallback((id: string) => {
    setSelectedMarkerId(id)
    if (isMobile) {
      setSearchSheetOpen(false)
      setSearchResultIds([])
    }
  }, [isMobile])

  const regionName = useCallback(
    (id?: string) => (id && regionData?.l10n[id]?.name) || '',
    [regionData],
  )
  const categoryName = useCallback(
    (id?: string) => (id && staticData?.typesL10n.categories[id]?.name) || id || '',
    [staticData],
  )

  // Cursor readout. The cursor arrives in DATA (world) space; region borders are
  // pixel polygons, so project first — the one place the asymmetry bites.
  const sortedRegions = useMemo(
    () => sortRegionsByArea(regionData?.regions ?? []),
    [regionData],
  )
  const subzoneAt = useCallback(
    (x: number, y: number) => {
      if (!map || sortedRegions.length === 0) return ''
      const p = worldToPixel(map, x, y)
      const hit = regionAt(sortedRegions, p.x, p.y)
      return hit ? regionName(hit.id) : ''
    },
    [map, sortedRegions, regionName],
  )

  const labels = useMemo(() => ({
    copyPosition: t('copyPosition'),
    noMapSelected: t('noMapSelected'),
    zoomIn: t('zoomIn'),
    zoomOut: t('zoomOut'),
  }), [t])

  const searchLabels = useMemo(() => ({
    search: t('search'),
    resultsCount: (n: number) => t('resultsCount', { count: n }),
    unnamed: t('unnamed'),
    noDescription: t('noDescription'),
  }), [t])

  const markerDetailFor = useCallback((marker: EngineMarker, anchored: boolean) => map ? (
    <VrisingMarkerDetail
      marker={marker}
      anchored={anchored}
      deps={{
        t,
        language: i18n.resolvedLanguage ?? i18n.language,
        regionName,
        categoryName,
        iconUrl: vrisingAssets.markerIconUrl(marker.icon || marker.subtypeMeta?.icon, map),
        onClose: () => setSelectedMarkerId(null),
        onSelectMarker: setSelectedMarkerId,
      }}
    />
  ) : null, [map, t, i18n.resolvedLanguage, i18n.language, regionName, categoryName])
  const renderPopupContent = useCallback(
    (marker: EngineMarker) => isMobile || searchResultIds.length > 0 ? null : markerDetailFor(marker, true),
    [isMobile, markerDetailFor, searchResultIds.length],
  )
  const markerDetail = isMobile && searchResultIds.length === 0 && selectedMarker
    ? markerDetailFor(selectedMarker, false)
    : null

  if (loadError) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background text-destructive">
        {loadError}
      </div>
    )
  }
  if (!staticData) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background text-muted-foreground">
        {t('loading')}
      </div>
    )
  }

  const mapSelect = (
    <div className="px-3 py-3 max-md:pr-8">
      <ShellMapSelect
        classNames={{
          trigger: 'min-h-11 rounded-xl border-border bg-card px-3 text-base font-semibold shadow-none hover:border-primary/40 hover:bg-card data-[state=open]:bg-card',
          content: 'border-border bg-popover',
        }}
        maps={staticData.maps.map((item) => ({
          id: item.id,
          label: staticData.mapsL10n[item.id]?.shortName
            ?? staticData.mapsL10n[item.id]?.name
            ?? item.id,
        }))}
        activeMapId={MAP_ID}
        onSelectMap={() => undefined}
      />
    </div>
  )

  const filterPanel = (
    <FilterPanel
      categories={filterCategories}
      onToggleSubtype={onToggleSubtype}
      onSetCategory={onSetCategory}
      categoryToggleLabels={{ show: t('showAll'), hide: t('hideAll') }}
      controls={[
        {
          id: 'show-all',
          label: t('showAll'),
          onClick: () => setVisible(new Set(staticData.types.subtypes.map((s) => s.id))),
        },
        { id: 'hide-all', label: t('hideAll'), onClick: () => setVisible(new Set()) },
        {
          id: 'show-tooltip',
          label: t('showTooltip'),
          onClick: () => setShowLabels((v) => !v),
          active: showLabels,
        },
        {
          id: 'show-regions',
          label: t('showRegions'),
          onClick: () => setShowRegions((value) => !value),
          active: showRegions,
        },
      ]}
      classNames={{
        root: 'px-3 pb-4',
        controls: 'mb-2 grid-cols-2 gap-2',
        controlButton: 'h-9 min-h-9 justify-center rounded-lg border border-[color:var(--arkive-divider)] bg-card px-2 text-xs font-semibold text-muted-foreground shadow-none hover:border-primary/35 hover:bg-[color:var(--arkive-filter-hover)] hover:text-foreground',
        controlButtonActive: 'border-primary/40 bg-[color:var(--arkive-filter-active)] text-primary shadow-none hover:bg-[color:var(--arkive-filter-active)]',
        category: 'border-b border-[color:var(--arkive-divider)] py-1.5 last:border-b-0',
        categoryHeader: 'min-h-10 pt-0 pb-0 text-foreground [&>svg]:size-5 [&>svg]:text-foreground/55',
        categoryEyeToggle: 'text-foreground/55 hover:bg-[color:var(--arkive-filter-hover)] hover:text-primary',
        subtypeGrid: 'gap-x-2 gap-y-1.5 pb-2',
        subtypeButton: 'h-auto min-h-9 rounded-md border border-transparent bg-transparent px-2 text-xs font-medium text-muted-foreground opacity-65 hover:border-[color:var(--arkive-divider)] hover:bg-card hover:text-foreground hover:opacity-100',
        subtypeButtonActive: 'border-primary/20 bg-[color:var(--arkive-filter-active)] font-semibold text-foreground opacity-100 shadow-[inset_0.18rem_0_0_var(--arkive-orange)]',
      }}
    />
  )

  const searchPanel = (variant: 'floating' | 'inline') => (
    <SearchPanel
      items={searchItems}
      onSelect={onSelectSearchMarker}
      onFlyTo={setSelectedPosition}
      onResultsChange={setSearchResultIds}
      initialQuery={initialQuery}
      labels={searchLabels}
      searchFields={['name']}
      variant={variant}
      floatingPlacement="center"
    />
  )

  const mapProps: Omit<GameMapViewProps, 'mapRef'> = {
    map,
    markers: engineMarkers,
    regions: showRegions ? (regionData?.regions ?? []) : [],
    visibleSubtypes: visible,
    showLabels,
    showBorders: showRegions,
    // Vardoran's 372 markers carry no `tier` yet, and LOD hides every tier-less
    // marker -- enabling it unconditionally rendered a completely empty phone
    // map. This turns itself on once the pipeline emits tiers.
    lodEnabled: isMobile && canUseLodTiers(engineMarkers),
    selectedMarkerId,
    forceShowIds,
    selectedPosition,
    initialView: mountView,
    onViewChange: saveView,
    suppressInitialFlyForId: restoredMarkerId,
    overlayLines: patrolRouteLines,
    onToggleMarker,
    onHoverMarker,
    subzoneAt,
    flyToDuration: 0.5,
    assets: vrisingAssets,
    theme: vrisingTheme,
    exposeTestHandle: import.meta.env.DEV,
    renderPopupContent,
    labels,
  }

  // The engine sits behind a lazy boundary (see features/map/GlMapView), so it
  // needs a Suspense fallback for the one chunk fetch. The fallback just holds the
  // map area open, borrowing the `.gmgl-map-root` void colour from index.css
  // (`flex-1` stands in for the sizing engine-gl.css normally supplies, since that
  // stylesheet arrives with the chunk) so there is no flash of a
  // differently-coloured panel.
  const mapView = (
    <Suspense
      fallback={<div className="gmgl-map-root flex-1" role="status" aria-label={t('loading')} />}
    >
      <GameMapView {...mapProps} mapRef={glMapRef} />
    </Suspense>
  )

  if (isMobile) {
    return (
      <div className="arkive-mobile-map relative flex h-dvh w-screen flex-col overflow-hidden bg-background text-foreground">
        <h1 className="sr-only">{t('title')}</h1>
        {/* Same flex chain as the desktop ShellLayout so the map root (flex:1)
            gets a definite height and the engine sizes correctly on mount. */}
        <main className="relative flex min-w-0 flex-1 overflow-hidden">{mapView}{markerDetail}</main>

        <ArkiveMobileMapControls
          // The map route renders no header, so this is the only account surface
          // on V Rising's landing page.
          account={<ArkiveAccountControl language={i18n.resolvedLanguage ?? i18n.language} variant="mobileHeader" />}
          search={{
            label: t('search'),
            open: searchSheetOpen,
            onOpenChange: (open) => {
              setSearchSheetOpen(open)
              if (!open) setSearchResultIds([])
            },
            content: searchPanel('inline'),
          }}
          filter={{
            label: t('filter'),
            open: filterSheetOpen,
            onOpenChange: setFilterSheetOpen,
            active: visible.size !== staticData.types.subtypes.length || showRegions,
            header: mapSelect,
            content: filterPanel,
          }}
        />
      </div>
    )
  }

  return (
    <>
      <h1 className="sr-only">{t('title')}</h1>
      <ShellLayout
        className="arkive-map-page vrising-map-page bg-background text-foreground"
        topBar={<TopNav active="/" />}
        sidebar={
          <ShellSidebar
            width={320}
            collapseLabel={t('collapse')}
            expandLabel={t('expand')}
            label={t('filter')}
            classNames={{
              root: 'border-r border-border bg-[color:var(--arkive-sidebar)] font-sans text-sm text-foreground',
              collapseButton: 'top-4 border border-l-0 border-border bg-card text-foreground shadow-sm dark:text-white',
              content: 'pb-2',
            }}
            headerSlot={
              <ShellGameHeader
                backgroundUrl={`${import.meta.env.BASE_URL}images/vrising-map-header.webp`}
                backgroundPosition="center 45%"
                shadeClassName="bg-[linear-gradient(180deg,rgba(5,22,28,0.08),rgba(5,22,28,0.92))]"
                logo={
                  <img
                    src={`${import.meta.env.BASE_URL}images/vrising-logo.webp`}
                    alt="V Rising"
                    className="max-h-12 w-auto max-w-52 object-contain object-left drop-shadow-md"
                  />
                }
                gameName={t('gameName')}
                subtitle={t('mapSubtitle')}
              />
            }
            mapSelectorSlot={mapSelect}
          >
            {filterPanel}
          </ShellSidebar>
        }
        rightSidebar={<InfoSidebar />}
      >
        <main className="relative flex min-w-0 flex-1 overflow-hidden">
          {mapView}
          {searchPanel('floating')}
        </main>
      </ShellLayout>
    </>
  )
}
