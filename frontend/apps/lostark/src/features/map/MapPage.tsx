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
import { initDataVersion, json } from '@/lib/data'
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

/**
 * Labels for the deploy-actor classes the pipeline keeps. Chinese, because the
 * app renders Chinese throughout and hard-wires `language="zh-CN"`; an English
 * map page inside it would just be bilingual.
 */
const SUBTYPE_LABELS: Record<string, string> = {
  npc: 'NPC',
  prop: '物件',
  spot: '地点',
  questzone: '任务区域',
  portal: '传送门',
  teleport: '传送点',
  trap: '陷阱',
  vehicle: '载具',
  transport: '运输',
  tower: '塔',
  monster: '怪物',
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
        // Must precede the first dataUrl call, or this route's requests -
        // including all 56 tiles - go out unstamped and survive a re-emit in
        // cache with no URL change to invalidate them.
        await initDataVersion()
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
        label: '布置点位',
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
   * Open on the whole zone rather than at the engine's minimum zoom, which
   * shows this 2048x1792 grid as a thumbnail.
   *
   * Derived during render, NOT in an effect. The engine reads `initialView`
   * exactly once, in a layout effect keyed on the map id, and child layout
   * effects run before parent passive effects — so a value set from
   * `useEffect` arrives after the engine has already been constructed with
   * null and is never read. Whether the camera came out right then depended on
   * whether the lazy engine chunk resolved before or after the data fetch.
   * `useMemo` also gives the freezing that matters for free: `map` is set once,
   * and the engine only reads the prop at construction.
   */
  const initialView = useMemo(() => {
    const bounds = map?.worldBounds
    if (!bounds) return null
    return {
      x: (bounds.min.x + bounds.max.x) / 2,
      y: (bounds.min.y + bounds.max.y) / 2,
      zoom: -1.25,
    }
  }, [map])

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
          <span className="text-sm font-medium">{map?.name ?? '地图加载中…'}</span>
          <span className="text-xs text-muted-foreground">{markers.length} 个点位</span>
          <Link to="/" className="ml-auto text-xs underline underline-offset-2">
            战斗力计算器
          </Link>
        </header>
      }
      sidebar={
        <ShellSidebar
          width={280}
          label="筛选"
          collapseLabel="收起筛选"
          expandLabel="展开筛选"
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
            categoryToggleLabels={{ show: '全部显示', hide: '全部隐藏' }}
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
            地图数据加载失败：{error}
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
