import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { cn, FilterChip, FilterRow, Input, NotFoundMessage, toggleValue } from '@gamemap/ui'
import { loadDataset, loadLabels, wikiImage, type Dataset, type DatasetName, type Labels, type Materials } from '../../lib/wiki'
import { RichText } from '../../lib/richText'

/** One dataset plus the labels, reloaded on language change. */
export function useWiki<N extends DatasetName>(name: N) {
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'
  const [state, setState] = useState<{ data: Dataset<N>; labels: Labels } | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    setError(null)
    Promise.all([loadDataset(name, lng), loadLabels(lng)])
      .then(([data, labels]) => { if (!cancelled) setState({ data, labels }) })
      .catch((err) => { console.error(err); if (!cancelled) setError(t('loadError')) })
    return () => { cancelled = true }
  }, [name, lng, t])
  return { ...state, error }
}

/** Item names, for material lists on the other pages. */
export function useItemNames(): Record<string, string> {
  const { data } = useWiki('items')
  return useMemo(() => Object.fromEntries(Object.entries(data?.text ?? {}).map(([id, v]) => [id, v.name])), [data])
}

export function PageState({ error, loading, missing }: { error?: string | null; loading: boolean; missing?: boolean }) {
  const { t } = useTranslation()
  if (error) return <div className="mt-8 text-center text-destructive">{error}</div>
  if (loading) return <div className="mt-12 text-center text-sm text-muted-foreground">{t('loading')}</div>
  if (missing) return <NotFoundMessage className="mt-12 text-center text-sm" message={t('wiki.notFound')} />
  return null
}

const RARITY_COLOR: Record<string, string> = {
  Common: 'text-muted-foreground border-border',
  Rare: 'text-sky-600 border-sky-500/50 dark:text-sky-400',
  Epic: 'text-violet-600 border-violet-500/50 dark:text-violet-400',
  Legendary: 'text-amber-600 border-amber-500/50 dark:text-amber-400',
}

export function Tag({ children, rarity, className }: { children: ReactNode; rarity?: string; className?: string }) {
  if (!children) return null
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-xs', rarity ? RARITY_COLOR[rarity] : 'border-border text-muted-foreground', className)}>
      {children}
    </span>
  )
}

export function WikiImage({ name, className, contain = true }: { name?: string; className?: string; contain?: boolean }) {
  const [failed, setFailed] = useState(false)
  if (!name || failed) return <div className={cn('rounded-md bg-muted/60', className)} />
  return (
    <img
      src={wikiImage(name)}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn(contain ? 'object-contain' : 'object-cover', className)}
    />
  )
}

export function Tile({ to, params, icon, name, sub, rarity }: {
  to: string
  params: Record<string, string>
  icon?: string
  name: string
  sub?: ReactNode
  rarity?: string
}) {
  return (
    <Link
      to={to}
      params={params}
      data-testid="wiki-tile"
      className={cn(
        'group flex flex-col items-center gap-2 rounded-lg border bg-card p-2 text-center shadow-sm transition hover:border-primary/60 hover:bg-accent/10',
        rarity && rarity !== 'Common' ? RARITY_COLOR[rarity]?.split(' ').find((c) => c.startsWith('border-')) : 'border-border',
      )}
    >
      <WikiImage name={icon} className="size-20" />
      <span className="line-clamp-2 text-xs font-medium leading-tight text-foreground">{name}</span>
      {sub ? <span className="text-xs text-muted-foreground">{sub}</span> : null}
    </Link>
  )
}

export function TileGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-3 gap-2 min-[480px]:grid-cols-4 sm:grid-cols-6 lg:grid-cols-8">{children}</div>
}

export interface ChipGroup {
  label: string
  options: { value: string; label: string }[]
  selected: string[]
  onChange: (next: string[]) => void
  /** Show even with a single option (a toggle rather than a choice). */
  toggle?: boolean
}

/** Search box plus chip filters; every page's list header. */
export function ListControls({ query, onQuery, groups, count }: {
  query: string
  onQuery: (q: string) => void
  groups: ChipGroup[]
  count: number
}) {
  const { t } = useTranslation()
  return (
    <div className="mb-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Input value={query} onChange={(e) => onQuery(e.target.value)} placeholder={t('wiki.search')} className="max-w-xs" data-testid="wiki-search" />
        <span className="text-sm text-muted-foreground" data-testid="wiki-count">{t('wiki.count', { count })}</span>
      </div>
      {groups.some((g) => g.options.length > (g.toggle ? 0 : 1)) ? (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
          {groups.filter((g) => g.options.length > (g.toggle ? 0 : 1)).map((g) => (
            <FilterRow key={g.label} layout="column" label={g.label}>
              {g.options.map((o) => (
                <FilterChip variant="solid" key={o.value} active={g.selected.includes(o.value)} onClick={() => g.onChange(toggleValue(g.selected, o.value))}>
                  {o.label}
                </FilterChip>
              ))}
            </FilterRow>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** Case-insensitive match on any of the given strings. */
export function matches(query: string, ...fields: (string | undefined)[]): boolean {
  const q = query.trim().toLowerCase()
  return !q || fields.some((f) => f?.toLowerCase().includes(q))
}

/** Options for a chip group, in first-seen order, labelled from the game's own words. */
export function optionsOf(values: string[], labels: Record<string, string> | undefined): { value: string; label: string }[] {
  return [...new Set(values)].filter(Boolean).map((v) => ({ value: v, label: labels?.[v] ?? v }))
}

export function Section({ title, children, className }: { title: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-lg border border-border bg-card p-4', className)}>
      <h2 className="mb-3 text-base font-semibold text-muted-foreground">{title}</h2>
      {children}
    </section>
  )
}

export function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border py-1.5 last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium">{children}</span>
    </div>
  )
}

/** Dust and materials for one upgrade step, each material linking to its item. */
export function Cost({ dust, materials, names }: { dust: number; materials: Materials; names: Record<string, string> }) {
  const { t } = useTranslation()
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
      {materials.map(([id, n]) => (
        <span key={id} className="whitespace-nowrap">
          {names[id] ? (
            <Link to="/items/$id" params={{ id }} className="hover:underline">{names[id]}</Link>
          ) : <span className="text-muted-foreground">{id}</span>}
          <span className="text-muted-foreground"> ×{n}</span>
        </span>
      ))}
      {dust ? <span className="whitespace-nowrap tabular-nums">{t('wiki.dust', { count: dust })}</span> : null}
    </span>
  )
}

/** Detail header: image, name and tags beside each other. */
export function DetailHeader({ image, name, tags, children }: { image?: string; name: string; tags: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      <WikiImage name={image} className="size-40 shrink-0 self-center rounded-lg border border-border bg-muted/40 p-2 sm:self-start" />
      <div className="flex min-w-0 flex-col gap-2">
        <h1 className="text-2xl font-bold">{name}</h1>
        <div className="flex flex-wrap gap-1.5">{tags}</div>
        {children}
      </div>
    </div>
  )
}

export function Prose({ text, prompts, muted }: { text?: string; prompts?: Record<string, string>; muted?: boolean }) {
  return <RichText text={text} prompts={prompts} className={cn('whitespace-pre-line text-sm leading-relaxed', muted && 'text-muted-foreground')} />
}
