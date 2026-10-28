import { useEffect, useMemo, useRef, useState } from 'react'
import { ArkiveMapTopBar, FilterPanel, MarkerPopupCard, SearchPanel, ShellGameHeader, ShellLayout, ShellMapSelect, ShellSidebar, useTheme } from '@gamemap/map-shell'
import { GameMapView, type EngineMarker, type GlMapRef } from '@gamemap/map-engine-gl'
import type { GameMapMeta, RegionInstance } from '@gamemap/data-contract'
import text from './locales/zh-CN.json'

const DATA_BASE = import.meta.env.VITE_DATA_BASE_URL ?? '/data'
const RES_BASE = import.meta.env.VITE_RESOURCE_BASE_URL ?? '/ossres'

interface Collection { id: string; name: string; order: number }

interface Prop { id: string; kind: string; x: number; y: number; z: number; tags: string[] }

const propKinds: { id: string; color: string }[] = [
  { id: 'boulder', color: '#9A7B5B' }, { id: 'crystal', color: '#8E6CF0' }, { id: 'skipstone', color: '#4C8DAE' },
  { id: 'lily', color: '#3FA34D' }, { id: 'laser', color: '#E5484D' }, { id: 'mirror', color: '#30A6B5' },
  { id: 'gem', color: '#E93D82' }, { id: 'gemslot', color: '#B04577' }, { id: 'gate', color: '#D08B2C' },
  { id: 'button', color: '#C7A400' }, { id: 'pusher', color: '#6E56CF' }, { id: 'teleporter', color: '#0090FF' },
  { id: 'reset', color: '#12A594' }, { id: 'freezer', color: '#5EB1EF' }, { id: 'spawner', color: '#8D4E3B' },
  { id: 'camera', color: '#687076' }, { id: 'elevator', color: '#3E63DD' },
]
const gamePropIcons = new Set(['gem', 'gemslot', 'mirror', 'laser', 'elevator', 'reset', 'spawner'])
const propIcon = (kind: string) => gamePropIcons.has(kind) ? `/props-game/${kind}.png` : `/props/${kind}.svg`
const propText: Record<string, string> = text.props
const propSubtypes = propKinds.map(kind => `prop:${kind.id}`)
const allSubtypes = ['entrance', 'area', ...propSubtypes]
const defaultHiddenProps = new Set(['freezer', 'spawner', 'reset', 'teleporter', 'camera'].map(kind => `prop:${kind}`))
const defaultSubtypes = allSubtypes.filter(id => !defaultHiddenProps.has(id))

interface PreviewData {
  maps: GameMapMeta[]
  markers: Record<string, EngineMarker[]>
  regions: Record<string, RegionInstance[]>
}

export function App() {
  const { theme, setTheme } = useTheme()
  const [data, setData] = useState<PreviewData | null>(null)
  const [failed, setFailed] = useState(false)
  const [collections, setCollections] = useState<Record<string, Collection[]>>({})
  const [hiddenCollections, setHiddenCollections] = useState<Set<string>>(() => new Set())
  const [mapId, setMapId] = useState('ground')
  const [selected, setSelected] = useState<string | null>(null)
  const [showBorders, setShowBorders] = useState(true)
  const [showLabels, setShowLabels] = useState(false)
  const [props, setProps] = useState<Prop[]>([])
  const [tileOverrides, setTileOverrides] = useState<Record<string, string> | null>(null)
  const [visible, setVisible] = useState(() => new Set(defaultSubtypes))
  const [resultIds, setResultIds] = useState<string[]>([])
  const mapRef = useRef<GlMapRef | null>(null)
  const home = import.meta.env.VITE_ARKIVE_HOME_URL ?? (import.meta.env.DEV ? 'http://localhost:15172' : 'https://www.arkive.games')

  useEffect(() => {
    const controller = new AbortController()
    fetch(`${DATA_BASE}/map-display.json`, { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error('Map data unavailable'); return response.json() as Promise<PreviewData> })
      .then(setData)
      .catch(error => { if (error.name !== 'AbortError') setFailed(true) })
    fetch(`${DATA_BASE}/tile-overrides.json`, { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error('Tile overrides unavailable'); return response.json() as Promise<Record<string, string>> })
      .then(setTileOverrides)
      .catch(error => { if (error.name !== 'AbortError') setFailed(true) })
    fetch(`${DATA_BASE}/collections.json`, { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error('Collections unavailable'); return response.json() as Promise<Record<string, Collection[]>> })
      .then(setCollections)
      .catch(error => { if (error.name !== 'AbortError') setFailed(true) })
    fetch(`${DATA_BASE}/props-ground-26006400.json`, { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error('Props unavailable'); return response.json() as Promise<{ props: Prop[] }> })
      .then(value => setProps(value.props))
      .catch(error => { if (error.name !== 'AbortError') setFailed(true) })
    return () => controller.abort()
  }, [])

  const markers = useMemo(() => [...(data?.markers[mapId] ?? []).map(marker => ({
    ...marker,
    localizedDescription: collections[marker.id]?.map(group => `${group.name} · ${group.order}`).join(' / ') || marker.localizedDescription,
    icon: marker.subtype === 'entrance' ? '/entrance-game.png' : '/area.svg',
    subtypeMeta: marker.subtypeMeta ? { ...marker.subtypeMeta, pinVariant: 'image' as const, icon: marker.subtype === 'entrance' ? '/entrance-game.png' : '/area.svg', iconScale: marker.subtype === 'entrance' ? 0.3 : 0.4 } : undefined,
  })), ...(mapId === 'ground' ? props : []).map((prop, index): EngineMarker => {
    const kind = propKinds.find(item => item.id === prop.kind)
    const name = propText[prop.kind] ?? prop.kind
    return {
      id: prop.id, subtype: `prop:${prop.kind}`, x: prop.x, y: prop.y, z: prop.z, images: [], contributors: [], indexInSubtype: index + 1,
      localizedName: prop.tags.length ? `${name}（${prop.tags.join('·')}）` : name,
      localizedDescription: `${propText.category}${prop.tags.length ? ` · ${prop.tags.join(' · ')}` : ''} · ${propText.initial}`,
      subtypeLabel: name, icon: propIcon(prop.kind),
      subtypeMeta: { id: `prop:${prop.kind}`, name, pinVariant: 'image', color: kind?.color, icon: propIcon(prop.kind), iconScale: 0.28 },
    }
  })], [data, mapId, collections, props])
  const collectionRows = useMemo(() => {
    const groups = new Map<string, { id: string; name: string; count: number }>()
    for (const marker of markers) for (const group of collections[marker.id] ?? []) {
      const row = groups.get(group.id) ?? { ...group, count: 0 }
      row.count += 1
      groups.set(group.id, row)
    }
    return [...groups.values()]
  }, [markers, collections])
  const filteredMarkers = markers.filter(marker => marker.subtype !== 'entrance' || !(collections[marker.id]?.length) || collections[marker.id].some(group => !hiddenCollections.has(group.id)) || marker.id === selected || resultIds.includes(marker.id))
  const searchItems = useMemo(() => markers.map(marker => ({ id: marker.id, name: marker.localizedName, description: marker.localizedDescription, x: marker.x, y: marker.y, z: marker.z })), [markers])
  const categories = [{ id: 'locations', label: text.locations, subtypes: [
    { id: 'entrance', label: text.entrance, active: visible.has('entrance'), count: markers.filter(marker => marker.subtype === 'entrance').length },
    { id: 'area', label: text.region, active: visible.has('area'), count: markers.filter(marker => marker.subtype === 'area').length },
  ] }, ...(mapId === 'ground' ? [{ id: 'props', label: propText.category, subtypes: propKinds.map(kind => ({
    id: `prop:${kind.id}`, label: propText[kind.id] ?? kind.id, active: visible.has(`prop:${kind.id}`), count: markers.filter(marker => marker.subtype === `prop:${kind.id}`).length,
  })) }] : []), { id: 'collections', label: text.collections, subtypes: collectionRows.map(group => ({ id: `collection:${group.id}`, label: group.name, active: !hiddenCollections.has(group.id), count: group.count })) }]
  const toggleSubtype = (id: string) => setVisible(previous => {
    const next = new Set(previous)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  return <ShellLayout
    topBar={<ArkiveMapTopBar
      homeUrl={home} homeLabel={text.home} brandName={text.brand} brandSlogan={text.slogan}
      nav={{ items: [{ key: '/', label: text.map, active: true }], renderItem: (item, className, labelClassName) => <a href="/" className={className}><span data-slot="nav-item-label" className={labelClassName}>{item.label}</span></a> }}
      languageSwitcher={{ languages: [{ code: 'zh-CN', label: '简体中文' }], current: 'zh-CN', onChange: () => {}, menuLabel: text.language }}
      themeSwitcher={{ current: theme, onChange: setTheme, labels: { auto: text.auto, light: text.light, dark: text.dark }, menuLabel: text.theme }}
      loginLabel={text.account} accountSlot={<a href={`${home}/#account`} className="text-sm">{text.account}</a>}
    />}
    sidebar={<ShellSidebar width="20rem" label={text.map} collapseLabel={text.collapse} expandLabel={text.expand}
      classNames={{ collapseButton: 'top-4 border border-l-0 border-border bg-card text-foreground shadow-sm' }}
      headerSlot={<ShellGameHeader backgroundUrl={import.meta.env.VITE_OSS_HEADER_URL ?? '/images/game-header.webp'} backgroundPosition="center" logo={null} gameName={text.game} subtitle={text.map} />}
      mapSelectorSlot={data ? <div className="px-3 py-3 max-md:pr-8"><ShellMapSelect
        classNames={{ trigger: 'min-h-11 rounded-xl border-[color:var(--arkive-divider)] bg-card px-3 text-base font-semibold shadow-none hover:border-primary/50 hover:bg-[color:var(--arkive-filter-active)]', content: 'border-[color:var(--arkive-divider)]', item: 'data-[state=checked]:bg-[color:var(--arkive-filter-active)] data-[state=checked]:text-primary' }}
        maps={data.maps.map(map => ({ id: map.id, label: map.name }))} activeMapId={mapId} onSelectMap={id => { setMapId(id); setSelected(null); setResultIds([]) }} /></div> : undefined}>
      <FilterPanel categories={categories} onToggleSubtype={id => {
        if (!id.startsWith('collection:')) { toggleSubtype(id); return }
        const key = id.slice('collection:'.length)
        setHiddenCollections(previous => { const next = new Set(previous); if (next.has(key)) next.delete(key); else next.add(key); return next })
      }}
        onSetCategory={(category, enabled) => {
          if (category === 'collections') { setHiddenCollections(enabled ? new Set() : new Set(collectionRows.map(group => group.id))); return }
          const ids = category === 'props' ? propSubtypes : ['entrance', 'area']
          setVisible(previous => { const next = new Set(previous); for (const id of ids) { if (enabled) next.add(id); else next.delete(id) } return next })
        }}
        categoryToggleLabels={{ show: text.showAll, hide: text.hideAll }}
        controls={[
          { id: 'all', label: text.showAll, onClick: () => { setVisible(new Set(allSubtypes)); setHiddenCollections(new Set()) } },
          { id: 'none', label: text.hideAll, onClick: () => setVisible(new Set()) },
          { id: 'labels', label: text.labels, active: showLabels, onClick: () => setShowLabels(value => !value) },
          { id: 'ranges', label: text.ranges, active: showBorders, onClick: () => setShowBorders(value => !value) },
        ]}
        classNames={{ root: 'px-3 pb-4', controls: 'mb-2 grid-cols-2 gap-2',
          controlButton: 'min-h-9 justify-center rounded-lg border border-[color:var(--arkive-divider)] bg-card text-xs font-semibold text-muted-foreground hover:bg-[color:var(--arkive-filter-hover)]',
          controlButtonActive: 'border-primary/40 bg-[color:var(--arkive-filter-active)] text-primary',
          category: 'border-b border-[color:var(--arkive-divider)] py-1.5 last:border-b-0',
          categoryHeader: 'min-h-10 pt-0 pb-0 text-foreground [&>svg]:size-5 [&>svg]:text-foreground/55',
          categoryEyeToggle: 'text-foreground/55 hover:bg-[color:var(--arkive-filter-hover)] hover:text-primary',
          subtypeGrid: 'gap-x-2 gap-y-1.5 pb-2',
          subtypeButton: 'h-auto min-h-9 rounded-md border border-transparent bg-transparent px-2 text-xs font-medium text-muted-foreground opacity-65 hover:border-[color:var(--arkive-divider)] hover:bg-card hover:text-foreground hover:opacity-100',
          subtypeButtonActive: 'border-primary/20 bg-[color:var(--arkive-filter-active)] font-semibold text-foreground opacity-100 shadow-[inset_0.18rem_0_0_var(--arkive-orange)]',
        }}
      />
    </ShellSidebar>}>
    <div className="oss-map-workspace relative flex min-h-0 flex-1 flex-col">
    {data && <SearchPanel key={`search:${mapId}`} items={searchItems}
      onSelect={setSelected} onFlyTo={position => mapRef.current?.flyTo(position.x, position.y)}
      searchFields={['name', 'description']} onResultsChange={setResultIds}
      labels={{ search: text.searchButton, placeholder: text.search, resultsCount: count => `${count} ${text.results}`, unnamed: text.entrance, noDescription: text.noDescription }} />}
    {!data || !tileOverrides ? <div role="status" className="p-4 text-sm">{failed ? text.failure : text.loading}</div> : <GameMapView
      key={`map:${mapId}`} map={data.maps.find(map => map.id === mapId)} markers={filteredMarkers} regions={data.regions[mapId] ?? []}
      visibleSubtypes={visible} forceShowIds={new Set(resultIds)}
      showLabels={showLabels} showBorders={showBorders} lodEnabled={false}
      selectedMarkerId={selected} selectedPosition={null} onToggleMarker={setSelected}
      subzoneAt={() => ''} flyToDuration={0.4} mapRef={mapRef}
      assets={{ tileUrl: (map, x, y, level = 0) => `${RES_BASE}/${tileOverrides[`${map.id}:${level}:${x}:${y}`] ?? `tiles/${map.id}-base-expanded/${level}/${x}_${y}.png`}`, markerIconUrl: icon => icon ?? '' }}
      labels={{ copyPosition: text.copyPosition, noMapSelected: text.noMap, zoomIn: text.zoomIn, zoomOut: text.zoomOut }}
      renderPopupContent={marker => <MarkerPopupCard name={marker.localizedName} description={marker.localizedDescription || text.unknown} positionValue={`${marker.x}, ${marker.y}`}><p className="mt-2 text-xs text-muted-foreground">{text.preview}</p></MarkerPopupCard>}
      exposeTestHandle={import.meta.env.DEV}
    />}
    </div>
  </ShellLayout>
}
