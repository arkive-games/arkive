import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import type { EngineMarker, GlMapRef } from '@gamemap/map-engine-gl'
import { DEFAULT_MAP_THEME } from '@gamemap/map-engine-gl/theme'
import type { GameMapMeta } from '@gamemap/data-contract'
import {
  FilterPanel,
  ShellLayout,
  ShellSidebar,
  type FilterCategory,
} from '@gamemap/map-shell'
import { dataUrl } from '@/lib/data'
import { lostarkMapAssets } from './assets'

// three.js and the engine CSS stay out of the calculator's entry chunk.
const GameMapView = lazy(() => import('./GlMapView'))

interface MarkerRow {
  id: string
  subtype: string
  x: number
  y: number
  images: string[]
  contributors: string[]
  indexInSubtype: number
}

interface SubtypeMeta {
  id: string
  color?: string
  pinVariant?: 'image' | 'circular' | 'pin'
  defaultActive?: boolean
}

interface TypesFile {
  categories: { id: string; pinVariant?: string; subtypes: SubtypeMeta[] }[]
}

/** Human labels for the deploy-actor classes the pipeline keeps. */
const SUBTYPE_LABELS: Record<string, string> = {
  npc: 'NPC',
  prop: 'Prop',
  spot: 'Spot',
  questzone: 'Quest zone',
  portal: 'Portal',
  teleport: 'Teleport',
  trap: 'Trap',
  vehicle: 'Vehicle',
  transport: 'Transport',
  tower: 'Tower',
  monster: 'Monster',
}

async function json<T>(path: string): Promise<T> {
  const r = await fetch(dataUrl(path))
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`)
  return (await r.json()) as T
}

export default function MapPage() {
  const [map, setMap] = useState<GameMapMeta | undefined>()
  const [markers, setMarkers] = useState<MarkerRow[]>([])
  const [subtypes, setSubtypes] = useState<SubtypeMeta[]>([])
  const [visible, setVisible] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const mapRef = useRef<GlMapRef | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [maps, types] = await Promise.all([
          json<{ maps: GameMapMeta[] }>('maps.json'),
          json<TypesFile>('types.json'),
        ])
        const first = maps.maps[0]
        if (!first) throw new Error('maps.json contains no maps')
        const rows = await json<{ markers: MarkerRow[] }>(`markers/${first.id}.json`)
        if (cancelled) return
        const subs = types.categories.flatMap((c) => c.subtypes)
        setMap(first)
        setSubtypes(subs)
        setMarkers(rows.markers)
        // An undefined or empty visibleSubtypes means "filter not initialised"
        // to the engine and hides every marker, so seed it from the taxonomy.
        setVisible(new Set(subs.filter((s) => s.defaultActive !== false).map((s) => s.id)))
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const subtypeMeta = useMemo(() => new Map(subtypes.map((s) => [s.id, s])), [subtypes])

  const engineMarkers = useMemo<EngineMarker[]>(
    () =>
      markers.map((m) => {
        const meta = subtypeMeta.get(m.subtype)
        const label = SUBTYPE_LABELS[m.subtype] ?? m.subtype
        return {
          ...m,
          localizedName: '',
          subtypeLabel: label,
          subtypeMeta: meta ? { ...meta, name: label } : undefined,
        }
      }),
    [markers, subtypeMeta],
  )

  const counts = useMemo(() => {
    const out = new Map<string, number>()
    for (const m of markers) out.set(m.subtype, (out.get(m.subtype) ?? 0) + 1)
    return out
  }, [markers])

  const categories = useMemo<FilterCategory[]>(
    () => [
      {
        id: 'deploy',
        label: 'Placed objects',
        subtypes: subtypes.map((s) => ({
          id: s.id,
          label: SUBTYPE_LABELS[s.id] ?? s.id,
          active: visible.has(s.id),
          count: counts.get(s.id) ?? 0,
          icon: (
            <span
              aria-hidden
              className="size-2.5 rounded-full"
              style={{ background: s.color ?? '#d8d8d8' }}
            />
          ),
        })),
      },
    ],
    [subtypes, visible, counts],
  )

  /**
   * Open on the whole zone rather than the engine's default centre-at-1:1,
   * which lands mid-map at a zoom where this 2048x1792 grid overflows the
   * viewport. Frozen after the first computation so a later re-render cannot
   * yank the camera back while the user is panning.
   */
  const [initialView, setInitialView] = useState<{ x: number; y: number; zoom: number } | null>(
    null,
  )
  useEffect(() => {
    const bounds = map?.worldBounds
    if (!bounds || initialView) return
    setInitialView({
      x: (bounds.min.x + bounds.max.x) / 2,
      y: (bounds.min.y + bounds.max.y) / 2,
      zoom: -1.25,
    })
  }, [map, initialView])

  const toggleSubtype = (id: string) =>
    setVisible((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const setCategory = (_categoryId: string, show: boolean) =>
    setVisible(show ? new Set(subtypes.map((s) => s.id)) : new Set())

  return (
    <ShellLayout
      className="arkive-map-page bg-background text-foreground"
      topBar={
        <header className="flex items-center gap-3 border-b border-border px-4 py-2">
          <span className="text-sm font-medium">{map?.name ?? 'Loading map...'}</span>
          <span className="text-xs text-muted-foreground">{markers.length} points</span>
          <Link to="/" className="ml-auto text-xs underline underline-offset-2">
            Combat power calculator
          </Link>
        </header>
      }
      sidebar={
        <ShellSidebar
          width={280}
          label="Filters"
          collapseLabel="Collapse filters"
          expandLabel="Expand filters"
          classNames={{
            root: 'border-r border-border bg-[color:var(--arkive-sidebar)] text-sm',
            // The toggle overhangs into the map column by design; without the
            // card background its label renders straight onto the tiles.
            collapseButton:
              'top-4 border border-l-0 border-border bg-card text-foreground shadow-sm dark:text-white',
          }}
        >
          <FilterPanel
            categories={categories}
            onToggleSubtype={toggleSubtype}
            onSetCategory={setCategory}
            categoryToggleLabels={{ show: 'Show all', hide: 'Hide all' }}
            // Same token set the other games pass; without it the chips fall
            // back to the raw accent colour instead of the map theme.
            classNames={{
              root: 'px-3 pb-4',
              category: 'border-b border-[color:var(--arkive-divider)] py-1.5 last:border-b-0',
              categoryHeader: 'min-h-10 pt-0 pb-0 text-foreground [&>svg]:size-5 [&>svg]:text-foreground/55',
              categoryEyeToggle: 'text-foreground/55 hover:bg-[color:var(--arkive-filter-hover)] hover:text-primary',
              subtypeGrid: 'gap-x-2 gap-y-1.5 pb-2',
              subtypeButton:
                'h-auto min-h-9 rounded-md border border-transparent bg-transparent px-2 text-xs font-medium text-muted-foreground opacity-65 hover:border-[color:var(--arkive-divider)] hover:bg-card hover:text-foreground hover:opacity-100',
              subtypeButtonActive:
                'border-primary/20 bg-[color:var(--arkive-filter-active)] font-semibold text-foreground opacity-100 shadow-[inset_0.18rem_0_0_var(--arkive-orange)]',
            }}
          />
        </ShellSidebar>
      }
    >
      <main className="relative flex min-w-0 flex-1 overflow-hidden">
        {error ? (
          <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-destructive">
            Could not load the map data: {error}
          </div>
        ) : (
          <Suspense fallback={<div className="gmgl-map-root flex-1" />}>
            <GameMapView
              map={map}
              markers={engineMarkers}
              regions={[]}
              visibleSubtypes={visible}
              showLabels={false}
              showBorders={false}
              lodEnabled={false}
              selectedMarkerId={selected}
              selectedPosition={null}
              initialView={initialView}
              onToggleMarker={setSelected}
              subzoneAt={() => ''}
              flyToDuration={0.5}
              mapRef={mapRef}
              assets={lostarkMapAssets}
              theme={DEFAULT_MAP_THEME}
              renderPopupContent={(marker) => (
                <div className="text-xs">
                  <div className="font-medium">{marker.subtypeLabel}</div>
                  <div className="text-muted-foreground">
                    {Math.round(marker.x)}, {Math.round(marker.y)}
                  </div>
                </div>
              )}
            />
          </Suspense>
        )}
      </main>
    </ShellLayout>
  )
}
