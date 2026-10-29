import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearch } from '@tanstack/react-router'
import type { EngineMarker, GameMapViewProps, GlMapRef } from '@gamemap/map-engine-gl'
import { DEFAULT_MAP_THEME } from '@gamemap/map-engine-gl/theme'
import {
  ArkiveMobileMapControls, FilterPanel, MarkerPopupCard, SearchPanel, ShellLayout, ShellMapSelect, ShellSidebar,
  formatCoords, readMapView, useMapViewMemory,
  type FilterCategory, type SearchItem,
} from '@gamemap/map-shell'
import type { MarkerTypeSubtype } from '@gamemap/data-contract'
import { useIsMobile } from '@gamemap/ui'
import { ArkiveAccountControl } from '@gamemap/auth'
import { defineMemoryRecord, isBoolean, memoryPolicy, useMemoryState } from '@gamemap/state-memory'
import {
  loadMarkers, loadStatic,
  type MapMeta, type MarkerLocale, type MarkerRow, type MapsLocale, type Taxonomy, type TypesLocale,
} from '../../lib/data'
import { pbzAssets } from '../../lib/assets'
import { ARKIVE_HOME_URL } from '../../lib/brand'
import { useSettingsConfig } from '../../lib/settings'
import { mapViewStore, readMapId, readVisibleSubtypes, writeMapId, writeVisibleSubtypes } from '../../lib/storage'
import { TopNav } from '../../components/TopNav'

const labelsRecord = defineMemoryRecord({
  id: 'show-labels', namespace: 'pbz', surface: 'map',
  ...memoryPolicy.userPreference('reset-map-labels'),
  schemaVersion: '1.0.0', defaultValue: () => false, validate: isBoolean,
})

// The map engine behind a lazy boundary — see features/map/GlMapView.
const GameMapView = lazy(() => import('./GlMapView'))

export default function MapPage() {
  const { t, i18n } = useTranslation()
  const settings = useSettingsConfig()
  const lng = i18n.resolvedLanguage ?? 'en-US'
  const glMapRef = useRef<GlMapRef | null>(null)
  const isMobile = useIsMobile()
  const [filterSheetOpen, setFilterSheetOpen] = useState(false)
  const [searchSheetOpen, setSearchSheetOpen] = useState(false)

  const [restoredVisible] = useState<Set<string> | null>(readVisibleSubtypes)
  const visibleInitialized = useRef(restoredVisible != null)
  const { q: initialQuery } = useSearch({ from: '/' })

  const [staticData, setStaticData] = useState<{
    maps: MapMeta[]; types: Taxonomy; mapsL10n: MapsLocale; typesL10n: TypesLocale
  } | null>(null)
  const [mapId, setMapId] = useState<string>(readMapId)
  const [markerData, setMarkerData] = useState<{ mapId: string; markers: MarkerRow[]; l10n: MarkerLocale } | null>(null)
  const [visible, setVisible] = useState<Set<string>>(() => restoredVisible ?? new Set())
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null)
  const [selectedPosition, setSelectedPosition] = useState<{ x: number; y: number } | null>(null)
  const [restoredMarkerId, setRestoredMarkerId] = useState<string | null>(null)
  const [searchResultIds, setSearchResultIds] = useState<string[]>([])
  const [showLabels, setShowLabels] = useMemoryState(labelsRecord)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoadError(null)
    loadStatic(lng)
      .then((d) => {
        if (cancelled) return
        setStaticData(d)
        setMapId((cur) => (d.maps.some((m) => m.id === cur) ? cur : d.maps[0]?.id ?? ''))
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
  useEffect(() => { if (mapId) writeMapId(mapId) }, [mapId])

  const map = staticData?.maps.find((m) => m.id === mapId)
  const { initialView, saveView, saveMarker } = useMapViewMemory(mapViewStore, mapId)

  useEffect(() => {
    if (!map) return
    let cancelled = false
    setSelectedMarkerId(null)
    setSelectedPosition(null)
    setRestoredMarkerId(null)
    loadMarkers(map.id, lng)
      .then((d) => {
        if (cancelled) return
        setMarkerData({ mapId: map.id, ...d })
        const stored = readMapView(mapViewStore, map.id).marker
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
  }, [map, lng, t])

  const currentMarkers = markerData?.mapId === mapId ? markerData : null

  useEffect(() => {
    if (currentMarkers) saveMarker(selectedMarkerId)
  }, [currentMarkers, selectedMarkerId, saveMarker])

  const subtypeMetaMap = useMemo(
    () => new Map<string, MarkerTypeSubtype>((staticData?.types.subtypes ?? []).map((s) => [s.id, s])),
    [staticData],
  )

  // Localize + resolve subtype metadata here: the engine reads no i18n and knows
  // nothing about the taxonomy.
  const engineMarkers: EngineMarker[] = useMemo(() => {
    if (!staticData || !currentMarkers) return []
    return currentMarkers.markers.map((m) => {
      const subLabel = staticData.typesL10n.subtypes[m.subtype]?.name ?? m.subtype
      return {
        id: m.id,
        subtype: m.subtype,
        category: m.category,
        x: m.x,
        y: m.y,
        z: m.z,
        tier: m.tier,
        indexInSubtype: m.indexInSubtype,
        icon: m.icon,
        images: [],
        contributors: [] as string[],
        localizedName: currentMarkers.l10n[m.id]?.name ?? `${subLabel} ${m.indexInSubtype}`,
        localizedDescription: currentMarkers.l10n[m.id]?.description,
        subtypeLabel: subLabel,
        subtypeMeta: subtypeMetaMap.get(m.subtype),
      }
    })
  }, [staticData, currentMarkers, subtypeMetaMap])

  const forceShowIds = useMemo(() => new Set(searchResultIds), [searchResultIds])
  const selectedMarker = useMemo(
    () => engineMarkers.find((marker) => marker.id === selectedMarkerId),
    [engineMarkers, selectedMarkerId],
  )

  const categoryName = useCallback(
    (id?: string) => (id && staticData?.typesL10n.categories[id]?.name) || id || '',
    [staticData],
  )

  const searchItems: SearchItem[] = useMemo(() => {
    if (!map) return []
    return engineMarkers.map((m) => {
      const icon = m.icon || m.subtypeMeta?.icon
      return {
        id: m.id,
        name: m.localizedName || '',
        description: m.localizedDescription,
        subtypeLabel: m.subtypeLabel ?? m.subtype,
        categoryLabel: categoryName(m.subtypeMeta?.category ?? m.category),
        iconUrl: icon ? pbzAssets.markerIconUrl(icon, map) : undefined,
        x: m.x,
        y: m.y,
      }
    })
  }, [engineMarkers, map, categoryName])

  const countBySubtype = useMemo(() => {
    const counts = new Map<string, number>()
    for (const m of currentMarkers?.markers ?? []) counts.set(m.subtype, (counts.get(m.subtype) ?? 0) + 1)
    return counts
  }, [currentMarkers])

  const filterCategories: FilterCategory[] = useMemo(() => {
    if (!staticData) return []
    return staticData.types.categories
      .map((cat) => ({
        id: cat.id,
        label: categoryName(cat.id),
        subtypes: staticData.types.subtypes
          .filter((s) => s.category === cat.id && (countBySubtype.get(s.id) ?? 0) > 0)
          .map((s) => ({
            id: s.id,
            label: staticData.typesL10n.subtypes[s.id]?.name ?? s.id,
            active: visible.has(s.id),
            count: countBySubtype.get(s.id) ?? 0,
          })),
      }))
      .filter((cat) => cat.subtypes.length > 0)
  }, [staticData, visible, countBySubtype, categoryName])

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
  const onSelectSearchMarker = useCallback((id: string) => {
    setSelectedMarkerId(id)
    if (isMobile) {
      setSearchSheetOpen(false)
      setSearchResultIds([])
    }
  }, [isMobile])

  const labels = useMemo(() => ({
    copyPosition: t('map.copyPosition'),
    noMapSelected: t('map.noMapSelected'),
    zoomIn: t('map.zoomIn'),
    zoomOut: t('map.zoomOut'),
  }), [t])

  const searchLabels = useMemo(() => ({
    search: t('map.search'),
    resultsCount: (n: number) => t('map.resultsCount', { count: n }),
    unnamed: t('map.unnamed'),
    noDescription: t('map.noDescription'),
  }), [t])

  const markerCard = useCallback((marker: EngineMarker) => {
    if (!map) return null
    const icon = marker.icon || marker.subtypeMeta?.icon
    const { text: coordText } = formatCoords(marker.x, marker.y)
    return (
      <MarkerPopupCard
        name={marker.localizedName || t('map.unnamed')}
        icon={icon ? <img src={pbzAssets.markerIconUrl(icon, map)} alt="" className="size-8 rounded-full bg-neutral-900/80 object-cover" /> : undefined}
        metaLine={[categoryName(marker.subtypeMeta?.category ?? marker.category), marker.subtypeLabel].filter(Boolean).join(' / ')}
        positionLabel={t('map.position')}
        positionValue={coordText}
        positionCopy={{ value: coordText, copyLabel: t('map.copyPosition'), copiedLabel: t('map.copied'), failedLabel: t('map.copyFailed') }}
        description={marker.localizedDescription}
      />
    )
  }, [map, t, categoryName])

  const renderPopupContent = useCallback(
    (marker: EngineMarker) => (isMobile || searchResultIds.length > 0 ? null : markerCard(marker)),
    [isMobile, markerCard, searchResultIds.length],
  )

  if (loadError) {
    return <div className="flex h-dvh items-center justify-center bg-background text-destructive">{loadError}</div>
  }
  if (!staticData || !map) {
    return <div className="flex h-dvh items-center justify-center bg-background text-muted-foreground">{t('loading')}</div>
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
          label: staticData.mapsL10n[item.id]?.shortName ?? staticData.mapsL10n[item.id]?.name ?? item.id,
        }))}
        activeMapId={map.id}
        onSelectMap={setMapId}
      />
    </div>
  )

  const filterPanel = (
    <FilterPanel
      categories={filterCategories}
      onToggleSubtype={onToggleSubtype}
      onSetCategory={onSetCategory}
      categoryToggleLabels={{ show: t('map.showAll'), hide: t('map.hideAll') }}
      controls={[
        { id: 'show-all', label: t('map.showAll'), onClick: () => setVisible(new Set(staticData.types.subtypes.map((s) => s.id))) },
        { id: 'hide-all', label: t('map.hideAll'), onClick: () => setVisible(new Set()) },
        { id: 'show-tooltip', label: t('map.showLabels'), onClick: () => setShowLabels((v) => !v), active: showLabels },
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
      key={map.id}
      items={searchItems}
      onSelect={onSelectSearchMarker}
      onFlyTo={setSelectedPosition}
      onResultsChange={setSearchResultIds}
      initialQuery={initialQuery}
      labels={searchLabels}
      searchFields={['name', 'description']}
      variant={variant}
      floatingPlacement="center"
      classNames={{ icon: 'size-5 rounded-full bg-neutral-900/80 object-cover' }}
    />
  )

  const mapProps: Omit<GameMapViewProps, 'mapRef'> = {
    map,
    markers: engineMarkers,
    regions: [],
    visibleSubtypes: visible,
    showLabels,
    showBorders: false,
    lodEnabled: false,
    selectedMarkerId,
    forceShowIds,
    selectedPosition,
    initialView,
    onViewChange: saveView,
    suppressInitialFlyForId: restoredMarkerId,
    onToggleMarker,
    subzoneAt: () => '',
    flyToDuration: 0.5,
    assets: pbzAssets,
    theme: DEFAULT_MAP_THEME,
    exposeTestHandle: import.meta.env.DEV,
    renderPopupContent,
    labels,
  }

  const mapView = (
    <Suspense fallback={<div className="gmgl-map-root flex-1" role="status" aria-label={t('loading')} />}>
      <GameMapView key={map.id} {...mapProps} mapRef={glMapRef} />
    </Suspense>
  )

  if (isMobile) {
    return (
      <div className="arkive-mobile-map relative flex h-dvh w-screen flex-col overflow-hidden bg-background text-foreground">
        <h1 className="sr-only">{t('map.title')}</h1>
        <main className="relative flex min-w-0 flex-1 overflow-hidden">
          {mapView}
          {searchResultIds.length === 0 && selectedMarker ? (
            <div className="absolute inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+5rem)] z-10 flex justify-center">
              {markerCard(selectedMarker)}
            </div>
          ) : null}
        </main>
        <ArkiveMobileMapControls
          account={<ArkiveAccountControl language={lng} variant="mobileHeader" homeUrl={ARKIVE_HOME_URL} settings={settings} />}
          search={{
            label: t('map.search'),
            open: searchSheetOpen,
            onOpenChange: (open) => {
              setSearchSheetOpen(open)
              if (!open) setSearchResultIds([])
            },
            content: searchPanel('inline'),
          }}
          filter={{
            label: t('map.filter'),
            open: filterSheetOpen,
            onOpenChange: setFilterSheetOpen,
            active: visible.size !== staticData.types.subtypes.length,
            header: mapSelect,
            content: filterPanel,
          }}
        />
      </div>
    )
  }

  return (
    <>
      <h1 className="sr-only">{t('map.title')}</h1>
      <ShellLayout
        className="arkive-map-page bg-background text-foreground"
        topBar={<TopNav active="/" />}
        sidebar={
          <ShellSidebar
            width={320}
            collapseLabel={t('map.collapse')}
            expandLabel={t('map.expand')}
            label={t('map.filter')}
            classNames={{
              root: 'border-r border-border bg-[color:var(--arkive-sidebar)] font-sans text-sm text-foreground',
              collapseButton: 'top-4 border border-l-0 border-border bg-card text-foreground shadow-sm dark:text-white',
              content: 'pb-2',
            }}
            mapSelectorSlot={mapSelect}
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
