import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { ContentPage } from '../../components/ContentPage'
import {
  loadDungeonLayouts,
  layoutBounds,
  layoutFootprintUrl,
  layoutsByDungeon,
  type DungeonLayout,
  type LayoutPoint,
} from '../../lib/dungeonLayouts'
import { loadDungeons, type DungeonsBundle } from '../../lib/dungeons'
import {
  CatalogSection,
  CatalogPageLoading,
  CatalogNotFound,
} from '../catalog/components'

const NAV_LINK =
  'inline-flex items-center gap-1 rounded-md border border-border bg-secondary/40 px-2 py-1 text-sm transition hover:border-primary/60 hover:bg-accent'

type Shape = 'circle' | 'diamond' | 'square' | 'triangle' | 'ring' | 'bar'

/** One legend/display category: points are bucketed top-down by `match`,
 *  drawn bottom-up in array order (gatherables underneath, boss on top). */
interface Category {
  key: string
  /** i18n key under `dungeon.` (+ optional interpolation params). */
  label: string
  labelParams?: Record<string, number>
  match: (p: LayoutPoint) => boolean
  shape: Shape
  /** SVG fill/stroke utility classes. */
  cls: string
  /** Relative marker size (1 = standard dot). */
  size?: number
}

const CATEGORIES: Category[] = [
  { key: 'gather.stone', label: 'layout.stone', match: (p) => p.kind === 'gather' && p.sub === 'stone', shape: 'circle', cls: 'fill-stone-400', size: 0.7 },
  { key: 'gather.coal', label: 'layout.coal', match: (p) => p.kind === 'gather' && p.sub === 'coal', shape: 'circle', cls: 'fill-zinc-600 dark:fill-zinc-300', size: 0.7 },
  { key: 'gather.copper', label: 'layout.copper', match: (p) => p.kind === 'gather' && p.sub === 'copper', shape: 'circle', cls: 'fill-orange-400', size: 0.7 },
  { key: 'gather.sulfur', label: 'layout.sulfur', match: (p) => p.kind === 'gather' && p.sub === 'sulfur', shape: 'circle', cls: 'fill-yellow-400', size: 0.7 },
  { key: 'gather.quartz', label: 'layout.quartz', match: (p) => p.kind === 'gather' && p.sub === 'quartz', shape: 'circle', cls: 'fill-sky-300', size: 0.7 },
  { key: 'gather.crystal', label: 'layout.crystal', match: (p) => p.kind === 'gather' && p.sub === 'crystal', shape: 'circle', cls: 'fill-cyan-300', size: 0.7 },
  { key: 'gather.mushroom', label: 'kind.mushroom', match: (p) => p.kind === 'gather' && p.sub === 'mushroom', shape: 'circle', cls: 'fill-lime-500', size: 0.7 },
  { key: 'gather.lotus', label: 'kind.lotus', match: (p) => p.kind === 'gather' && p.sub === 'lotus', shape: 'circle', cls: 'fill-pink-400', size: 0.7 },
  { key: 'gather.junk', label: 'kind.junk', match: (p) => p.kind === 'gather' && p.sub === 'junk', shape: 'circle', cls: 'fill-neutral-500', size: 0.7 },
  { key: 'gather.fishing', label: 'fishing', match: (p) => p.kind === 'gather' && p.sub === 'fishing', shape: 'circle', cls: 'fill-blue-400', size: 0.7 },
  { key: 'enemy.normal', label: 'enemies', match: (p) => p.kind === 'enemy' && (p.sub === 'normal' || p.sub === 'monster' || p.sub === 'base'), shape: 'circle', cls: 'fill-slate-500 dark:fill-slate-400' },
  { key: 'enemy.floor2', label: 'floor', labelParams: { n: 2 }, match: (p) => p.kind === 'enemy' && p.sub === 'floor2', shape: 'circle', cls: 'fill-teal-400' },
  { key: 'enemy.floor3', label: 'floor', labelParams: { n: 3 }, match: (p) => p.kind === 'enemy' && p.sub === 'floor3', shape: 'circle', cls: 'fill-fuchsia-400' },
  { key: 'enemy.floor4', label: 'floor', labelParams: { n: 4 }, match: (p) => p.kind === 'enemy' && p.sub === 'floor4', shape: 'circle', cls: 'fill-indigo-400' },
  { key: 'enemy.human', label: 'layout.humans', match: (p) => p.kind === 'enemy' && p.sub === 'human', shape: 'circle', cls: 'fill-stone-500' },
  { key: 'enemy.fishing', label: 'fishing', match: (p) => p.kind === 'enemy' && p.sub === 'fishing', shape: 'circle', cls: 'fill-cyan-500' },
  { key: 'chest.normal', label: 'layout.chests', match: (p) => p.kind === 'chest' && p.sub === 'normal', shape: 'square', cls: 'fill-amber-500' },
  { key: 'chest.special', label: 'techChest', match: (p) => p.kind === 'chest' && p.sub === 'special', shape: 'square', cls: 'fill-violet-500' },
  { key: 'reward.easy', label: 'layout.rewardEasy', match: (p) => p.kind === 'reward' && p.sub === 'easy', shape: 'diamond', cls: 'fill-emerald-500', size: 1.2 },
  { key: 'reward.medium', label: 'layout.rewardMedium', match: (p) => p.kind === 'reward' && p.sub === 'medium', shape: 'diamond', cls: 'fill-amber-500', size: 1.2 },
  { key: 'reward.hard', label: 'layout.rewardHard', match: (p) => p.kind === 'reward' && p.sub === 'hard', shape: 'diamond', cls: 'fill-rose-500', size: 1.2 },
  { key: 'reward.bonus', label: 'layout.elixirChest', match: (p) => p.kind === 'reward' && p.sub === 'bonus', shape: 'diamond', cls: 'fill-violet-500', size: 1.2 },
  { key: 'exit', label: 'layout.exit', match: (p) => p.kind === 'exit', shape: 'triangle', cls: 'fill-green-500', size: 1.3 },
  { key: 'bossDoor', label: 'layout.bossDoor', match: (p) => p.kind === 'bossDoor', shape: 'bar', cls: 'fill-rose-600', size: 1.3 },
  { key: 'enemy.midBoss', label: 'midBoss', match: (p) => p.kind === 'enemy' && p.sub === 'midBoss', shape: 'ring', cls: 'stroke-orange-500 fill-orange-500', size: 1.3 },
  { key: 'enemy.boss', label: 'boss', match: (p) => p.kind === 'enemy' && p.sub === 'boss', shape: 'ring', cls: 'stroke-rose-500 fill-rose-500', size: 1.8 },
]

function Marker({ shape, cls, x, y, r, title }: { shape: Shape; cls: string; x: number; y: number; r: number; title: string }) {
  const t = <title>{title}</title>
  switch (shape) {
    case 'diamond':
      return (
        <path d={`M ${x} ${y - 1.4 * r} L ${x + 1.4 * r} ${y} L ${x} ${y + 1.4 * r} L ${x - 1.4 * r} ${y} Z`} className={cls}>
          {t}
        </path>
      )
    case 'square':
      return (
        <rect x={x - r} y={y - r} width={2 * r} height={2 * r} className={cls}>
          {t}
        </rect>
      )
    case 'triangle':
      return (
        <path d={`M ${x} ${y - 1.3 * r} L ${x + 1.2 * r} ${y + r} L ${x - 1.2 * r} ${y + r} Z`} className={cls}>
          {t}
        </path>
      )
    case 'ring':
      return (
        <circle cx={x} cy={y} r={r} className={cls} fillOpacity={0.25} strokeWidth={r * 0.35}>
          {t}
        </circle>
      )
    case 'bar':
      return (
        <rect x={x - 1.5 * r} y={y - 0.5 * r} width={3 * r} height={r} className={cls}>
          {t}
        </rect>
      )
    default:
      return (
        <circle cx={x} cy={y} r={r} className={cls}>
          {t}
        </circle>
      )
  }
}

/** Legend swatch reusing the marker shapes in a fixed 12×12 viewBox. */
function Swatch({ shape, cls }: { shape: Shape; cls: string }) {
  return (
    <svg viewBox="0 0 12 12" className="size-3 shrink-0" aria-hidden>
      <Marker shape={shape} cls={cls} x={6} y={6} r={shape === 'ring' ? 4.5 : 4} title="" />
    </svg>
  )
}

/** Nice round scale-bar length (m) ≈ one fifth of the plot width. */
function scaleLength(widthMeters: number): number {
  const target = widthMeters / 5
  for (const step of [500, 250, 100, 50, 25, 10, 5]) {
    if (target >= step) return step
  }
  return 5
}

function LayoutPlot({ layout, hidden }: { layout: DungeonLayout; hidden: Set<string> }) {
  const { t } = useTranslation()
  // World-cm frame shared with the footprint image (falls back to the
  // points' own bounding box for artifacts predating `bounds`).
  const fb = layout.bounds
  const pb = layoutBounds(layout.points)
  const b = fb
    ? { minX: fb.x, minY: fb.y, width: fb.w, height: fb.h }
    : { minX: pb.minX, minY: pb.minY, width: pb.width, height: pb.height }
  // Marker unit: keeps dots readable across dungeon footprints of any size.
  const u = Math.max(b.width, b.height) / 90
  const groups = CATEGORIES.map((c) => ({
    c,
    pts: hidden.has(c.key) ? [] : layout.points.filter(c.match),
  }))
  // The scale bar lives under the plot as plain HTML so it can't collide
  // with markers near the plot edge.
  const meters = scaleLength(b.width / 100)
  return (
    <div>
      <svg
        viewBox={`${b.minX} ${b.minY} ${b.width} ${b.height}`}
        className="mx-auto w-full rounded-lg border border-border bg-secondary/30"
        style={{ aspectRatio: `${b.width} / ${b.height}`, maxHeight: '75vh' }}
        data-testid="dungeon-layout-plot"
        role="img"
      >
        {layout.footprint ? (
          <image
            href={layoutFootprintUrl(layout)}
            x={b.minX}
            y={b.minY}
            width={b.width}
            height={b.height}
            preserveAspectRatio="none"
            className="opacity-70 dark:opacity-40 dark:invert"
          />
        ) : null}
        {groups.map(({ c, pts }) =>
          pts.map((p, i) => (
            <Marker
              key={`${c.key}-${i}`}
              shape={c.shape}
              cls={c.cls}
              x={p.x}
              y={p.y}
              r={u * (c.size ?? 1)}
              title={t(`dungeon.${c.label}`, c.labelParams)}
            />
          )),
        )}
      </svg>
      <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
        <span
          className="h-1.5 border-x border-b border-muted-foreground/60"
          style={{ width: `${((meters * 100) / b.width) * 100}%` }}
          aria-hidden
        />
        <span className="tabular-nums">{meters} m</span>
      </div>
    </div>
  )
}

export default function DungeonLayoutPage() {
  const { id, variant } = useParams({ from: '/dungeons/$id/layouts/$variant' })
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'

  const [dungeons, setDungeons] = useState<DungeonsBundle | null>(null)
  const [layouts, setLayouts] = useState<DungeonLayout[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [hidden, setHidden] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    setLoadError(null)
    Promise.all([loadDungeons(lng), loadDungeonLayouts()])
      .then(([d, file]) => {
        if (cancelled) return
        setDungeons(d)
        setLayouts(layoutsByDungeon(file).get(id) ?? [])
      })
      .catch((err) => {
        console.error(err)
        if (!cancelled) setLoadError(t('loadError'))
      })
    return () => {
      cancelled = true
    }
  }, [lng, id, t])

  const layout = useMemo(() => layouts?.find((l) => l.variant === variant), [layouts, variant])

  let body: React.ReactNode
  if (loadError) {
    body = <div className="text-center text-destructive">{loadError}</div>
  } else if (!dungeons || !layouts) {
    body = <CatalogPageLoading />
  } else if (!layout) {
    body = (
      <CatalogNotFound
        message={t('dungeon.layout.notFound', { id: `${id}/${variant}` })}
        to="/dungeons"
        backLabel={t('dungeon.backToList')}
      />
    )
  } else {
    const name = dungeons.text[id]?.name ?? id
    const idx = layouts.indexOf(layout)
    const prev = idx > 0 ? layouts[idx - 1] : null
    const next = idx < layouts.length - 1 ? layouts[idx + 1] : null
    const legend = CATEGORIES.map((c) => ({ c, n: layout.points.filter(c.match).length })).filter(
      (e) => e.n > 0,
    )
    body = (
      <div className="space-y-6">
        <div data-testid="dungeon-layout-header" className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-3xl font-bold">
              {name} · {t('dungeon.layout.name', { variant: layout.variant })}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">
                {layout.dungeon} · {layout.points.length} pts
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {prev ? (
              <Link
                to="/dungeons/$id/layouts/$variant"
                params={{ id, variant: prev.variant }}
                data-testid="layout-prev"
                className={NAV_LINK}
              >
                <ChevronLeft className="size-4" aria-hidden />
                {t('dungeon.layout.name', { variant: prev.variant })}
              </Link>
            ) : null}
            {next ? (
              <Link
                to="/dungeons/$id/layouts/$variant"
                params={{ id, variant: next.variant }}
                data-testid="layout-next"
                className={NAV_LINK}
              >
                {t('dungeon.layout.name', { variant: next.variant })}
                <ChevronRight className="size-4" aria-hidden />
              </Link>
            ) : null}
          </div>
        </div>

        <CatalogSection title={t('dungeon.layout.title')} testId="dungeon-layout-map">
          <div className="mb-3 flex flex-wrap gap-1.5" data-testid="dungeon-layout-legend">
            {legend.map(({ c, n }) => (
              <button
                key={c.key}
                type="button"
                aria-pressed={!hidden.has(c.key)}
                onClick={() =>
                  setHidden((h) => {
                    const nh = new Set(h)
                    if (nh.has(c.key)) nh.delete(c.key)
                    else nh.add(c.key)
                    return nh
                  })
                }
                className={
                  'inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs transition hover:bg-accent ' +
                  (hidden.has(c.key) ? 'opacity-40' : 'bg-secondary/40')
                }
              >
                <Swatch shape={c.shape} cls={c.cls} />
                {t(`dungeon.${c.label}`, c.labelParams)}
                <span className="tabular-nums text-muted-foreground">{n}</span>
              </button>
            ))}
          </div>
          <LayoutPlot layout={layout} hidden={hidden} />
          <p className="mt-2 text-xs text-muted-foreground">
            {t('dungeon.layout.note', { count: layouts.length })}
          </p>
        </CatalogSection>

        <Link
          to="/dungeons/$id"
          params={{ id }}
          className="inline-block text-sm text-primary hover:underline"
        >
          {t('dungeon.layout.backToDungeon', { name })}
        </Link>
      </div>
    )
  }

  return (
    <ContentPage active="/dungeons" title={t('dungeon.title')}>
      {body}
    </ContentPage>
  )
}
