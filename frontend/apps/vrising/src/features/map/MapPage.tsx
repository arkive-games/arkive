import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearch } from '@tanstack/react-router'
import {
  GameMapView, worldToPixel,
  type EngineMarker, type MapRef,
} from '@gamemap/map-engine'
import {
  FilterPanel, SearchPanel, ShellLayout, ShellSidebar,
  readMapView, useMapViewMemory,
  type FilterCategory, type MapViewState, type SearchItem,
} from '@gamemap/map-shell'
import type { MarkerTypeSubtype, RegionInstance } from '@gamemap/data-contract'
import { Sheet, SheetContent, SheetHeader, SheetTitle, useIsMobile } from '@gamemap/ui'
import { SlidersHorizontal, Search as SearchIcon } from 'lucide-react'
import {
  loadStatic, loadMarkers, loadRegions,
  type MapMeta, type MarkerLocale, type MarkerRow, type MapsLocale,
  type RegionLocale, type Taxonomy, type TypesLocale,
} from '../../lib/data'
import { vrisingAssets } from '../../lib/assets'
import { mapViewStore, readVisibleSubtypes, writeVisibleSubtypes } from '../../lib/storage'
import { vrisingTheme } from '../../theme'
import { TopNav } from '../../components/TopNav'
import { regionAt, sortRegionsByArea } from './subzone'
import { renderMarkerPopup } from './popup'

const MAP_ID = 'Vardoran'

export default function MapPage() {
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'
  const mapRef = useRef<MapRef>(null)
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
  const [markerData, setMarkerData] = useState<{ markers: MarkerRow[]; l10n: MarkerLocale } | null>(null)
  const [regionData, setRegionData] = useState<{ regions: RegionInstance[]; l10n: RegionLocale } | null>(null)
  const [visible, setVisible] = useState<Set<string>>(() => restoredVisible ?? new Set())
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null)
  const [selectedPosition, setSelectedPosition] = useState<{ x: number; y: number } | null>(null)
  const [restoredMarkerId, setRestoredMarkerId] = useState<string | null>(null)
  const [searchResultIds, setSearchResultIds] = useState<string[]>([])
  const [showLabels, setShowLabels] = useState(false)
  const [showRegions, setShowRegions] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Camera + selection persistence. `useMapViewMemory` is storage-free; the
  // adapter comes from lib/storage.
  const { initialView, saveView, saveMarker } = useMapViewMemory(mapViewStore, MAP_ID)
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
        region: m.region,
        indexInSubtype: m.indexInSubtype,
        images: [] as string[],
        contributors: [] as string[],
        localizedName: loc?.name ?? subLabel,
        localizedDescription: loc?.description ?? subtypeL10n?.description,
        subtypeLabel: subLabel,
        subtypeMeta: subtypeMetaMap.get(m.subtype),
      }
    })
  }, [staticData, markerData, subtypeMetaMap])

  const forceShowIds = useMemo(() => new Set(searchResultIds), [searchResultIds])

  const searchItems: SearchItem[] = useMemo(() => {
    if (!staticData || !map) return []
    return engineMarkers.map((m) => {
      const iconName = m.icon || m.subtypeMeta?.icon || ''
      const catId = m.subtypeMeta?.category ?? m.category
      return {
        id: m.id,
        name: m.localizedName || '',
        description: m.localizedDescription,
        subtypeLabel: m.subtypeLabel ?? m.subtype,
        categoryLabel: catId ? (staticData.typesL10n.categories[catId]?.name ?? catId) : '',
        iconUrl: iconName ? vrisingAssets.markerIconUrl(iconName, map) : undefined,
        x: m.x,
        y: m.y,
      }
    })
  }, [engineMarkers, staticData, map])

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
      return hit ? (regionName(hit.id) || hit.name) : ''
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
    scopeName: t('scopeName'),
    scopeAll: t('scopeAll'),
  }), [t])

  const renderPopupContent = useCallback(
    (marker: EngineMarker) => renderMarkerPopup(marker, { t, regionName, categoryName }),
    [t, regionName, categoryName],
  )

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
          onClick: () => setShowRegions((v) => !v),
          active: showRegions,
        },
      ]}
      classNames={{
        controlButton: 'bg-secondary text-secondary-foreground',
        controlButtonActive: 'bg-primary text-primary-foreground',
        subtypeButton: 'bg-secondary text-secondary-foreground',
        subtypeButtonActive: 'bg-primary text-primary-foreground',
      }}
    />
  )

  const searchPanel = (variant: 'floating' | 'inline') => (
    <SearchPanel
      items={searchItems}
      onSelect={setSelectedMarkerId}
      onFlyTo={setSelectedPosition}
      onResultsChange={setSearchResultIds}
      initialQuery={initialQuery}
      labels={searchLabels}
      // Every marker of a subtype shares one description sentence, so indexing
      // `description` would make any word in it match all 226 POIs at once.
      // Only the generated region label is searchable.
      searchFields={['name']}
      variant={variant}
    />
  )

  const mapView = (
    <GameMapView
      map={map}
      markers={engineMarkers}
      regions={showRegions ? (regionData?.regions ?? []) : []}
      visibleSubtypes={visible}
      showLabels={showLabels}
      showBorders={showRegions}
      lodEnabled={false}
      selectedMarkerId={selectedMarkerId}
      forceShowIds={forceShowIds}
      selectedPosition={selectedPosition}
      initialView={mountView}
      onViewChange={saveView}
      suppressInitialFlyForId={restoredMarkerId}
      onToggleMarker={onToggleMarker}
      subzoneAt={subzoneAt}
      flyToDuration={0.5}
      mapRef={mapRef}
      assets={vrisingAssets}
      theme={vrisingTheme}
      exposeTestHandle={import.meta.env.DEV}
      renderPopupContent={renderPopupContent}
      labels={labels}
    />
  )

  if (isMobile) {
    return (
      <div className="relative flex h-dvh w-screen flex-col overflow-hidden bg-background text-foreground">
        <h1 className="sr-only">{t('title')}</h1>
        {/* Same flex chain as the desktop ShellLayout so the map root (flex:1)
            gets a definite height and Leaflet sizes correctly on mount. */}
        <main className="relative flex min-w-0 flex-1 overflow-hidden">{mapView}</main>

        <div
          className="absolute right-3 z-[700] flex flex-col gap-2"
          style={{ bottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
        >
          <button
            type="button"
            data-testid="map-fab-search"
            aria-label={t('search')}
            onClick={() => setSearchSheetOpen(true)}
            className="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg"
          >
            <SearchIcon className="size-5" />
          </button>
          <button
            type="button"
            data-testid="map-fab-filter"
            aria-label={t('filter')}
            onClick={() => setFilterSheetOpen(true)}
            className="flex size-12 items-center justify-center rounded-full bg-secondary text-secondary-foreground shadow-lg"
          >
            <SlidersHorizontal className="size-5" />
          </button>
        </div>

        <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
          <SheetContent side="bottom" data-testid="filter-sheet" className="max-h-[85dvh]">
            <SheetHeader>
              <SheetTitle>{t('filter')}</SheetTitle>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto">{filterPanel}</div>
          </SheetContent>
        </Sheet>

        <Sheet open={searchSheetOpen} onOpenChange={setSearchSheetOpen}>
          <SheetContent side="bottom" data-testid="search-sheet" className="h-[70dvh]">
            <SheetTitle className="sr-only">{t('search')}</SheetTitle>
            {searchPanel('inline')}
          </SheetContent>
        </Sheet>
      </div>
    )
  }

  return (
    <>
      <h1 className="sr-only">{t('title')}</h1>
      <ShellLayout
        className="bg-background text-foreground"
        topBar={<TopNav active="/" />}
        sidebar={
          <ShellSidebar
            collapseLabel={t('collapse')}
            expandLabel={t('expand')}
            classNames={{
              root: 'border-r border-border bg-gradient-to-b from-card to-background text-sm text-card-foreground',
              collapseButton: 'bg-secondary text-secondary-foreground',
              content: 'px-3 pt-3',
            }}
          >
            {filterPanel}
          </ShellSidebar>
        }
      >
        <main className="relative flex min-w-0 flex-1 overflow-hidden">
          {mapView}
          {searchPanel('floating')}
        </main>
      </ShellLayout>
    </>
  )
}
