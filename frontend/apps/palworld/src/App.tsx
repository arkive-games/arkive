import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearch } from '@tanstack/react-router'
import { GameMapView, type EngineMarker, type MapRef } from '@gamemap/map-engine'
import { FilterPanel, MarkerPopupCard, SearchPanel, ShellLayout, ShellMapSelect, ShellSidebar, formatCoords, readMapView, useMapViewMemory, type FilterCategory, type MapViewStore, type SearchItem } from '@gamemap/map-shell'
import type { MarkerTypeSubtype } from '@gamemap/data-contract'
import {
  loadStatic, loadMarkers,
  type MapMeta, type Taxonomy, type TypesLocale, type MapsLocale, type MarkerRow, type MarkerLocale
} from './lib/data'
import { palworldAssets, workIconUrl, noteImageUrl } from './lib/assets'
import { loadPals, type PalsBundle } from './lib/pals'
import { ElementBadge } from './features/pals/components'
import { toGameCoords } from './lib/coords'
import { palworldTheme } from './theme'
import { formatPalId, palIdText } from './lib/palId'
import { TopNav } from './components/TopNav'
import { PalDropBadges, RewardBadges } from './components/RewardBadges'
import { Sheet, SheetContent, SheetHeader, SheetTitle, cn, useIsMobile } from '@gamemap/ui'
import { SlidersHorizontal, Search as SearchIcon, Check } from 'lucide-react'
import { useCompletedMarkers } from './lib/completedMarkers'

// A purely-numeric query is an exact Paldeck-id lookup: search only the idLabel
// field, no prefix/fuzzy, so "11"/"011" find only No.011 — not the 110-119
// prefix range, nor the levels embedded in alpha-pal names ("… Lv.11"). This is
// the game-specific rule the generic SearchPanel doesn't know about.
const palIdLookup = (q: string) =>
  /^\d+$/.test(q) ? { fields: ['idLabel'], prefix: false, fuzzy: false } : undefined

// Pal names tokenize per CJK character, and MiniSearch's default OR-combine then
// matches any pal sharing a SINGLE character — searching "云海鹿" surfaces every
// 海/鹿 pal. Require ALL query tokens (AND) and drop fuzzy so the map search is
// precise; prefix stays on so partial queries ("云海") still match, and numeric
// queries still go through palIdLookup above.
const PAL_SEARCH_OPTIONS = { combineWith: 'AND', fuzzy: false } as const

// Categories that start collapsed in the filter sidebar (stable identity so the
// FilterPanel sync effect doesn't re-run each render).
const PAL_COLLAPSED_CATEGORIES = ['pal']

// Persist the map's visible-subtype selection across reloads. The selection is
// global (subtypes are a shared taxonomy, not reset on map switch), so a single
// key suffices.
const MAP_VISIBLE_KEY = 'palworld.map.visibleSubtypes'

/** Read the persisted set of visible subtypes; null when nothing is saved yet. */
function readStoredSubtypes(): Set<string> | null {
  try {
    const raw = localStorage.getItem(MAP_VISIBLE_KEY)
    if (!raw) return null
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? new Set(arr as string[]) : null
  } catch {
    return null
  }
}

// Per-map view + selection persistence (center, zoom, selected marker), fed
// into useMapViewMemory. The storage-free shell hook gets storage through this
// adapter, same as the theme.
const MAP_VIEW_KEY = 'palworld.map.view'
const mapViewStore: MapViewStore = {
  get: () => {
    try {
      return localStorage.getItem(MAP_VIEW_KEY)
    } catch {
      return null
    }
  },
  set: (raw) => {
    try {
      localStorage.setItem(MAP_VIEW_KEY, raw)
    } catch { /* no storage — feature degrades to non-persistent */ }
  },
}

export default function App() {
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'
  const mapRef = useRef<MapRef>(null)
  const isMobile = useIsMobile()
  const [filterSheetOpen, setFilterSheetOpen] = useState(false)
  const [searchSheetOpen, setSearchSheetOpen] = useState(false)
  // Restore the persisted selection once at mount (null = nothing saved, so the
  // default selection below applies). Held in state so it seeds both the initial
  // `visible` set and the init guard without reading a ref during render.
  const [restoredVisible] = useState<Set<string> | null>(readStoredSubtypes)
  // Skip the default-selection init below when a saved set was restored — even
  // an empty one, since the user may have deliberately hidden everything.
  const visibleInitialized = useRef(restoredVisible != null)

  // Deep-link params (?map=… & ?q=…): open a given map with the search box
  // prefilled — used by the Paldeck "view on full map" link.
  const { q: initialQuery, map: mapParam } = useSearch({ from: '/' })

  const [staticData, setStaticData] = useState<{
    maps: MapMeta[]; types: Taxonomy; mapsL10n: MapsLocale; typesL10n: TypesLocale
  } | null>(null)
  const [mapId, setMapId] = useState(mapParam ?? 'MainWorld')
  // ?map= is read once as the initial state above; a later in-app navigation
  // (e.g. picking a marker in the global search while already on the map)
  // changes only the URL, so sync it back into state here.
  useEffect(() => {
    if (mapParam && mapParam !== mapId) setMapId(mapParam)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapParam])
  // Per-map completed-marker ids (effigies/bosses), persisted in localStorage.
  const { completed, toggleCompleted } = useCompletedMarkers(mapId)
  // Per-map view (center/zoom) + selected marker, persisted across reloads.
  const { initialView, saveView, saveMarker } = useMapViewMemory(mapViewStore, mapId)
  // Marker id restored from storage for the current markers load — passed to
  // the engine so the restore does NOT fly (the restored center wins). Cleared
  // when a reload starts and set again by each restore, which re-arms the
  // engine's one-shot suppression (e.g. across a locale switch).
  const [restoredMarkerId, setRestoredMarkerId] = useState<string | null>(null)
  // Ids of the markers currently in the search results — forced onto the map so
  // a hit shows even when its subtype filter is off (see SearchPanel).
  const [searchResultIds, setSearchResultIds] = useState<string[]>([])
  const [palsBundle, setPalsBundle] = useState<PalsBundle | null>(null)
  // `mapId` records which map the loaded markers belong to — the selection
  // persistence below must not write while markers and mapId disagree (the
  // one-commit window right after a map switch).
  const [markerData, setMarkerData] = useState<{ mapId: string; markers: MarkerRow[]; l10n: MarkerLocale } | null>(null)
  const [visible, setVisible] = useState<Set<string>>(() => restoredVisible ?? new Set())
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null)
  const [selectedPosition, setSelectedPosition] = useState<{ x: number; y: number } | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  // When on, marker names show as permanent labels; when off, they appear on
  // hover (handled by the engine). Off by default to keep the map uncluttered.
  const [showLabels, setShowLabels] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoadError(null)
    loadStatic(lng)
      .then((d) => {
        if (cancelled) return
        setStaticData(d)
        // Only initialize visible set once; preserve user-set empty (Hide all).
        // Default selection = the subtypes the taxonomy flags `defaultActive`
        // (a small curated set); every other subtype starts hidden so the map
        // opens uncluttered.
        if (!visibleInitialized.current) {
          visibleInitialized.current = true
          setVisible(new Set(
            d.types.subtypes.filter((s) => s.defaultActive).map((s) => s.id),
          ))
        }
      })
      .catch((err) => {
        if (cancelled) return
        console.error(err)
        setLoadError(t('loadError'))
      })
    return () => { cancelled = true }
  }, [lng, t])

  // Persist the visible-subtype selection so it survives reloads.
  useEffect(() => {
    try {
      localStorage.setItem(MAP_VISIBLE_KEY, JSON.stringify([...visible]))
    } catch { /* no storage */ }
  }, [visible])

  // Encyclopedia data (elements/best-work) for enriching pal marker popups.
  useEffect(() => {
    let cancelled = false
    loadPals(lng)
      .then((b) => { if (!cancelled) setPalsBundle(b) })
      .catch((err) => console.error(err))
    return () => { cancelled = true }
  }, [lng])

  // A marker to select once the NEXT map's markers finish loading — set when
  // following a cross-map warp-altar link (the map switch below clears the
  // current selection first).
  const pendingSelectRef = useRef<string | null>(null)

  // Clear selection on map switch (and on locale reload — the popup teardown
  // fires a deselect anyway), then restore once the markers arrive: a pending
  // cross-map warp-link target wins; otherwise the stored selection reopens,
  // with the fly suppressed so the restored center stays put. Storage is
  // re-read here (not the mount snapshot) so a deselect saved since then isn't
  // resurrected by a locale switch.
  useEffect(() => {
    setMarkerData(null)
    setSelectedMarkerId(null)
    setSelectedPosition(null)
    setRestoredMarkerId(null)
    let cancelled = false
    loadMarkers(mapId, lng)
      .then((d) => {
        if (cancelled) return
        setMarkerData({ mapId, ...d })
        const pending = pendingSelectRef.current
        if (pending) {
          pendingSelectRef.current = null
          const target = d.markers.find((m) => m.id === pending)
          if (target) {
            setSelectedMarkerId(target.id)
            setSelectedPosition({ x: target.x, y: target.y })
          }
        } else {
          const stored = readMapView(mapViewStore, mapId).marker
          if (stored && d.markers.some((m) => m.id === stored)) {
            setRestoredMarkerId(stored)
            setSelectedMarkerId(stored)
          }
        }
      })
      .catch((err) => {
        if (cancelled) return
        console.error(err)
        setLoadError(t('loadError'))
      })
    return () => { cancelled = true }
  }, [mapId, lng, t])

  // Persist the selection per map. Guarded on the loaded markers belonging to
  // the CURRENT map: right after a map switch the old selection coexists with
  // the new mapId for one commit, and writing then would corrupt the new
  // map's stored entry before its own restore ran.
  useEffect(() => {
    if (!markerData || markerData.mapId !== mapId) return
    saveMarker(selectedMarkerId)
  }, [markerData, mapId, selectedMarkerId, saveMarker])

  // A bad `?map=` deep link would otherwise leave the engine in its empty
  // state; fall back to the default once the map list is known.
  useEffect(() => {
    if (staticData && !staticData.maps.some((m) => m.id === mapId)) {
      setMapId('MainWorld')
    }
  }, [staticData, mapId])

  const map = staticData?.maps.find((m) => m.id === mapId) ?? undefined

  const subtypeMetaMap = useMemo(() => {
    if (!staticData) return new Map<string, MarkerTypeSubtype>()
    return new Map(staticData.types.subtypes.map((s) => [s.id, s]))
  }, [staticData])

  // Raw marker rows by id, for resolving a warp altar's partner (popup line +
  // on-map link line).
  const markerRowById = useMemo(() => {
    const map = new Map<string, MarkerRow>()
    for (const m of markerData?.markers ?? []) map.set(m.id, m)
    return map
  }, [markerData])

  const engineMarkers: EngineMarker[] = useMemo(() => {
    if (!staticData || !markerData) return []
    return markerData.markers.map((m) => {
      const loc = markerData.l10n[m.id]
      const subtypeL10n = staticData.typesL10n.subtypes[m.subtype]
      const subLabel = subtypeL10n?.name ?? m.subtype
      const subtypeMeta = subtypeMetaMap.get(m.subtype)
      return {
        id: m.id,
        subtype: m.subtype,
        category: m.category,
        x: m.x,
        y: m.y,
        z: m.z,
        icon: m.icon,
        image: m.image,
        indexInSubtype: m.indexInSubtype,
        images: [] as string[],
        contributors: [] as string[],
        // Warp altars carry no per-marker names; number the fallback
        // ("Altar #3") to match the partner-link labels.
        localizedName: loc?.name ?? (m.warpTo ? `${subLabel} #${m.indexInSubtype}` : subLabel),
        // Fall back to the subtype's shared description (e.g. an effigy's buff)
        // when a marker has no description of its own.
        localizedDescription: loc?.description ?? subtypeL10n?.description,
        subtypeLabel: subLabel,
        subtypeMeta,
        completed: completed.has(m.id),
        zukanIndex: m.zukanIndex,
        zukanIndexSuffix: m.zukanIndexSuffix,
        count: m.count,
        reward: m.reward,
        pal: m.pal,
        drops: m.drops,
        warpTo: m.warpTo,
      }
    })
  }, [staticData, markerData, subtypeMetaMap, completed])

  const forceShowIds = useMemo(() => new Set(searchResultIds), [searchResultIds])

  const searchItems: SearchItem[] = useMemo(() => {
    if (!staticData) return []
    return engineMarkers.map((m) => {
      const catId = m.subtypeMeta?.category ?? m.category
      const iconName = m.icon || m.subtypeMeta?.icon || ''
      return {
        id: m.id,
        name: m.localizedName || '',
        idLabel: palIdText(formatPalId(m.zukanIndex ?? m.subtypeMeta?.zukanIndex, m.zukanIndexSuffix ?? m.subtypeMeta?.zukanIndexSuffix)),
        description: m.localizedDescription,
        subtypeLabel: m.subtypeLabel ?? m.subtype,
        categoryLabel: catId ? (staticData.typesL10n.categories[catId]?.name ?? catId) : '',
        iconUrl: iconName && map ? palworldAssets.markerIconUrl(iconName, map) : undefined,
        x: m.x,
        y: m.y,
        z: m.z,
      }
    })
  }, [engineMarkers, staticData, map])

  const searchLabels = useMemo(() => ({
    search: t('search'),
    resultsCount: (n: number) => t('resultsCount', { count: n }),
    unnamed: t('unnamed'),
    noDescription: t('noDescription'),
    scopeName: t('scopeName'),
    scopeAll: t('scopeAll'),
  }), [t])

  const onToggle = useCallback((id: string) => {
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

  // Marker count per subtype on the current map (drives the button count +
  // hides subtypes absent from this map).
  const countBySubtype = useMemo(() => {
    const counts = new Map<string, number>()
    if (!markerData) return counts
    for (const m of markerData.markers) counts.set(m.subtype, (counts.get(m.subtype) ?? 0) + 1)
    return counts
  }, [markerData])

  // Completed count per subtype on the current map (X in the X/N filter badge).
  const completedBySubtype = useMemo(() => {
    const counts = new Map<string, number>()
    if (!markerData) return counts
    for (const m of markerData.markers) {
      if (completed.has(m.id)) counts.set(m.subtype, (counts.get(m.subtype) ?? 0) + 1)
    }
    return counts
  }, [markerData, completed])

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
            // Pal buttons show the Paldeck id chip; everything else shows a count.
            idLabel: formatPalId(s.zukanIndex, s.zukanIndexSuffix),
            // Completable subtypes show progress (X/N) instead of a plain count.
            badge: s.canComplete
              ? `${completedBySubtype.get(s.id) ?? 0}/${countBySubtype.get(s.id) ?? 0}`
              : undefined,
            count: cat.id === 'pal' || s.canComplete ? undefined : (countBySubtype.get(s.id) ?? 0),
          })),
      }))
      .filter((cat) => cat.subtypes.length > 0)
  }, [staticData, visible, countBySubtype, completedBySubtype])

  const onToggleMarker = useCallback((id: string | null) => {
    setSelectedMarkerId((cur) => (cur === id ? null : id))
  }, [])

  // Follow a warp altar's link to its partner: same map → select + fly to it;
  // other map (World Tree entrance/exit) → switch maps, then select once the
  // new map's markers arrive (pendingSelectRef).
  const followWarpLink = useCallback((warpTo: { map: string; id: string }) => {
    if (warpTo.map === mapId) {
      const target = markerRowById.get(warpTo.id)
      setSelectedMarkerId(warpTo.id)
      if (target) setSelectedPosition({ x: target.x, y: target.y })
    } else {
      pendingSelectRef.current = warpTo.id
      setMapId(warpTo.map)
    }
  }, [mapId, markerRowById])

  // Dashed link line between a selected warp altar and its same-map partner.
  // Cross-map pairs draw nothing (the popup's "connects to" handles those).
  const overlayLines = useMemo(() => {
    if (!selectedMarkerId) return undefined
    const sel = markerRowById.get(selectedMarkerId)
    if (!sel?.warpTo || sel.warpTo.map !== mapId) return undefined
    const target = markerRowById.get(sel.warpTo.id)
    if (!target) return undefined
    return [{
      id: `warp-${sel.id}`,
      from: { x: sel.x, y: sel.y },
      to: { x: target.x, y: target.y },
      color: '#35D0E8',
    }]
  }, [selectedMarkerId, markerRowById, mapId])

  // Show the game's in-game map coordinates in the readout (cursor + copy +
  // search). The cursor has no height, so `z` is only supplied for markers.
  const displayCoords = useCallback(
    (x: number, y: number, z?: number) => toGameCoords(mapId, x, y, z),
    [mapId],
  )

  const subzoneAt = useCallback(() => '', [])

  const labels = useMemo(() => ({
    copyPosition: t('copyPosition'),
    noMapSelected: t('noMapSelected'),
    zoomIn: t('zoomIn'),
    zoomOut: t('zoomOut'),
  }), [t])

  const renderPopupContent = useCallback((marker: EngineMarker) => {
    const idLabel = formatPalId(marker.zukanIndex ?? marker.subtypeMeta?.zukanIndex, marker.zukanIndexSuffix ?? marker.subtypeMeta?.zukanIndexSuffix)
    const catId = marker.subtypeMeta?.category ?? marker.category
    const catLabel = catId ? (staticData?.typesL10n.categories[catId]?.name ?? catId) : ''
    const subLabel = marker.subtypeLabel ?? marker.subtype
    const g = toGameCoords(mapId, marker.x, marker.y, marker.z)
    const { text: coordText, aria: coordAria } = formatCoords(g.x, g.y, g.z)
    const catText = [catLabel, subLabel].filter(Boolean).join(' / ')
    // The coords get their own element so the axis-labeled aria/title (which
    // number is X/Y/Z) rides only on the coordinate, not the whole meta line.
    const metaLine = (
      <>
        {catText ? `${catText} ` : ''}
        <span aria-label={coordAria} title={coordAria}>
          {coordText}
        </span>
      </>
    )
    const count = marker.count
    const isPal = catId === 'pal'
    const pal = isPal && palsBundle ? palsBundle.byId.get(marker.subtype) : undefined
    // Kill drops: wild spawns key the pal by subtype; field bosses and
    // predators link their catchable pal via `pal`; wanted criminals (human
    // bosses, no pal to look up) carry their drops on the marker itself.
    const dropsPal = pal ?? (marker.pal && palsBundle ? palsBundle.byId.get(marker.pal) : undefined)
    const drops = dropsPal?.drops ?? marker.drops
    return (
      <MarkerPopupCard
        idLabel={idLabel}
        name={marker.localizedName || t('unnamed')}
        metaLine={metaLine}
        description={marker.localizedDescription}
        noDescriptionLabel={t('noDescription')}
      >
        {marker.image ? (
          <img
            src={noteImageUrl(marker.image)}
            alt=""
            loading="lazy"
            className="mt-3 w-full rounded-md border border-border object-contain"
          />
        ) : null}
        {pal ? (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {pal.elements.map((e) => (
              <ElementBadge key={e} element={e} label={palsBundle!.enums.elements[e] ?? e} size={16} />
            ))}
            {pal.bestWork ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                <img src={workIconUrl(pal.bestWork)} alt="" width={16} height={16} className="object-contain" />
                {palsBundle!.enums.work[pal.bestWork] ?? pal.bestWork}
              </span>
            ) : null}
          </div>
        ) : null}
        {count && count > 1 ? (
          <div className="mt-2 text-sm text-muted-foreground">
            {t('spawnCount', { count })}
          </div>
        ) : null}
        {drops && drops.length > 0 && palsBundle ? (
          <PalDropBadges drops={drops} bundle={palsBundle} />
        ) : null}
        {marker.reward ? (
          // Ancient Shrine: the unlocked item, the schematic itself, and Dog Coins.
          <RewardBadges reward={marker.reward} />
        ) : null}
        {marker.warpTo ? (() => {
          // Warp altar: name the partner altar and jump to it on click. Same
          // map → "<subtype> #<n> (coords)"; other map → the map's name.
          const warpTo = marker.warpTo
          const target = warpTo.map === mapId ? markerRowById.get(warpTo.id) : undefined
          let targetLabel: string
          if (warpTo.map !== mapId) {
            targetLabel = staticData?.mapsL10n[warpTo.map]?.name ?? warpTo.map
          } else if (target) {
            const tg = toGameCoords(mapId, target.x, target.y)
            // formatCoords().text already wraps the numbers in parentheses.
            targetLabel = `${subLabel} #${target.indexInSubtype} ${formatCoords(tg.x, tg.y).text}`
          } else {
            targetLabel = warpTo.id
          }
          return (
            <button
              type="button"
              data-testid="marker-warp-link"
              onClick={() => followWarpLink(warpTo)}
              className="mt-2 inline-flex items-center gap-1 self-start text-sm text-primary hover:underline"
            >
              {t('markerActions.connectsTo')}: {targetLabel}
            </button>
          )
        })() : null}
        {isPal ? (
          <Link
            to="/pals/$id"
            params={{ id: marker.subtype }}
            className="mt-2 inline-block text-sm text-primary hover:underline"
          >
            {t('pal.viewInEncyclopedia')}
          </Link>
        ) : null}
        {marker.subtypeMeta?.canComplete ? (
          <div className="mt-4 flex items-center justify-end">
            <button
              type="button"
              data-testid="marker-complete-toggle"
              onClick={() => toggleCompleted(marker.id)}
              aria-pressed={!!marker.completed}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium transition-colors',
                marker.completed
                  ? 'bg-[rgba(85,179,76,0.12)] text-[#55B34C]'
                  : 'border border-[#55B34C] text-[#55B34C] hover:bg-[rgba(85,179,76,0.08)]',
              )}
            >
              <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
              {marker.completed ? t('markerActions.completed') : t('markerActions.markCompleted')}
            </button>
          </div>
        ) : null}
      </MarkerPopupCard>
    )
  }, [staticData, t, mapId, palsBundle, toggleCompleted, markerRowById, followWarpLink])

  if (loadError) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-destructive">
        {loadError}
      </div>
    )
  }

  if (!staticData) return <div className="flex h-screen items-center justify-center bg-background text-muted-foreground">Loading…</div>

  const mapSelect = (
    <ShellMapSelect
      classNames={{ wrapper: 'mb-3' }}
      maps={staticData.maps.map((m) => ({
        id: m.id,
        label: staticData.mapsL10n[m.id]?.shortName ?? staticData.mapsL10n[m.id]?.name ?? m.id,
      }))}
      activeMapId={mapId}
      onSelectMap={setMapId}
      barStyle={{
        background:
          'linear-gradient(90deg, rgba(53,208,232,0) 0%, rgba(53,208,232,0.35) 54%, rgba(53,208,232,0) 100%)',
        borderImage:
          'linear-gradient(90deg, rgba(53,208,232,0), rgba(53,208,232,0.9), rgba(53,208,232,0)) 1',
      }}
    />
  )

  const filterPanel = (
    <FilterPanel
      categories={filterCategories}
      onToggleSubtype={onToggle}
      onSetCategory={onSetCategory}
      // The pal list is huge; keep it collapsed by default so the smaller
      // location/other categories stay readable. Users can still open it.
      defaultCollapsedCategoryIds={PAL_COLLAPSED_CATEGORIES}
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
      displayCoords={displayCoords}
      // Palworld's `description` is a spawn level range ("Lv.10–14"), not
      // real text — searching it makes a numeric query match every marker
      // of that level. Search name + Paldeck id only.
      searchFields={['name', 'idLabel']}
      resolveSearchOptions={palIdLookup}
      searchOptions={PAL_SEARCH_OPTIONS}
      variant={variant}
    />
  )

  const mapView = (
    <GameMapView
      mapRef={mapRef}
      map={map}
      markers={engineMarkers}
      regions={[]}
      visibleSubtypes={visible}
      showLabels={showLabels}
      showBorders={false}
      lodEnabled={false}
      selectedMarkerId={selectedMarkerId}
      forceShowIds={forceShowIds}
      selectedPosition={selectedPosition}
      initialView={initialView}
      onViewChange={saveView}
      suppressInitialFlyForId={restoredMarkerId}
      overlayLines={overlayLines}
      onToggleMarker={onToggleMarker}
      subzoneAt={subzoneAt}
      displayCoords={displayCoords}
      flyToDuration={0.5}
      assets={palworldAssets}
      theme={palworldTheme}
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

        {/* Floating actions; sit above the bottom tab bar (h-14) + safe area. */}
        <div
          className="absolute right-3 z-[700] flex flex-col gap-2"
          style={{ bottom: 'calc(env(safe-area-inset-bottom) + 4.5rem)' }}
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
            <SheetHeader>{mapSelect}</SheetHeader>
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
          headerSlot={
            <div className="mb-3 px-1">
              {/* Monochrome white logo: invert to black on the light sidebar,
                  keep white on the dark sidebar. */}
              <img
                src={`${import.meta.env.BASE_URL}images/palworld-logo.webp`}
                alt="Palworld"
                className="h-auto w-full object-contain invert dark:invert-0"
              />
            </div>
          }
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
