import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { IconDatabase, IconInfoCircle, IconSearch } from '@tabler/icons-react'
import { Input } from '@gamemap/ui'
import { useTranslation } from 'react-i18next'

import { ContentPage } from '@/components/ContentPage'
import {
  affixCountsOf,
  comboKey,
  loadReforge,
  mergeGraces,
  type Grace,
  type GraceUnlock,
  type MergedGrace,
  type ReforgeSlot,
} from '@/features/reforge/data'

/**
 * The client's "not scheduled this season" marker on `SEASON_DAY(...)`. Kept
 * verbatim in the dataset; only the label it gets here is ours.
 */
const NEVER_DAY = 999

/** Colour by extraordinary-affix requirement — the page's primary axis. */
const COUNT_CLASS: Record<number, string> = {
  2: 'border-border bg-card',
  3: 'border-sky-400/60 bg-sky-50/40 dark:border-sky-700 dark:bg-sky-950/20',
  4: 'border-violet-400/70 bg-violet-50/40 dark:border-violet-700 dark:bg-violet-950/20',
  5: 'border-amber-400/70 bg-amber-50/45 dark:border-amber-700 dark:bg-amber-950/20',
}

const COUNT_BADGE_CLASS: Record<number, string> = {
  2: 'border-border text-muted-foreground',
  3: 'border-sky-400/70 text-sky-700 dark:border-sky-700 dark:text-sky-300',
  4: 'border-violet-400/70 text-violet-700 dark:border-violet-700 dark:text-violet-300',
  5: 'border-amber-400/80 text-amber-700 dark:border-amber-700 dark:text-amber-300',
}

export default function ReforgePage() {
  const { t } = useTranslation()
  const [graces, setGraces] = useState<Grace[]>([])
  const [slots, setSlots] = useState<ReforgeSlot[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [slot, setSlot] = useState(0)
  const [affixCount, setAffixCount] = useState(0)
  const [query, setQuery] = useState('')

  useEffect(() => {
    let live = true
    loadReforge()
      .then((data) => {
        if (!live) return
        setGraces(data.graces)
        setSlots(data.slots)
      })
      .catch((cause) => {
        console.error(cause)
        if (live) setError(true)
      })
      .finally(() => {
        if (live) setLoading(false)
      })
    return () => {
      live = false
    }
  }, [])

  useEffect(() => {
    document.title = `${t('reforge.title')} - ${t('siteTitle')}`
  }, [t])

  const merged = useMemo(() => mergeGraces(graces), [graces])
  const counts = useMemo(() => affixCountsOf(graces), [graces])
  const slotName = useMemo(
    () => new Map(slots.map((entry) => [entry.id, entry.name])),
    [slots],
  )

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    return merged.filter((grace) => {
      if (slot !== 0 && grace.slot !== slot) return false
      if (affixCount !== 0 && grace.extraordinaryCount !== affixCount) return false
      if (!needle) return true
      const haystack = [
        grace.name,
        grace.brief1,
        grace.brief2,
        slotName.get(grace.slot) ?? '',
        ...grace.tags,
        ...grace.combos.flat().map((condition) => condition.stat),
      ].join(' ')
      return haystack.toLocaleLowerCase().includes(needle)
    })
  }, [merged, slot, affixCount, query, slotName])

  const slotCounts = useMemo(() => {
    const result = new Map<number, number>()
    for (const grace of merged) result.set(grace.slot, (result.get(grace.slot) ?? 0) + 1)
    return result
  }, [merged])

  const affixCounts = useMemo(() => {
    const result = new Map<number, number>()
    for (const grace of merged) {
      result.set(grace.extraordinaryCount, (result.get(grace.extraordinaryCount) ?? 0) + 1)
    }
    return result
  }, [merged])

  // Sections follow the reforge screen's own slot order, and within a slot the
  // richest graces come first: that is the order a player reads them in.
  const sections = useMemo(() => {
    return slots
      .map((entry) => ({
        slot: entry,
        groups: [...counts]
          .sort((a, b) => b - a)
          .map((count) => ({
            count,
            graces: filtered
              .filter((grace) => grace.slot === entry.id && grace.extraordinaryCount === count)
              .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)),
          }))
          .filter((group) => group.graces.length > 0),
      }))
      .filter((section) => section.groups.length > 0)
  }, [slots, counts, filtered])

  if (loading) {
    return (
      <ContentPage active="/reforge" title={t('reforge.title')} wide>
        <div className="space-y-5" role="status" aria-label={t('common.loading')} data-testid="reforge-loading">
          <div className="h-28 animate-pulse rounded-md bg-muted" />
          <div className="h-11 animate-pulse rounded-md bg-muted" />
          <div className="h-96 animate-pulse rounded-md bg-muted" />
        </div>
      </ContentPage>
    )
  }

  if (error) {
    return (
      <ContentPage active="/reforge" title={t('reforge.title')} wide>
        <p className="text-sm text-muted-foreground">{t('reforge.loadError')}</p>
      </ContentPage>
    )
  }

  return (
    <ContentPage active="/reforge" title={t('reforge.title')} wide>
      <div data-testid="reforge-page" className="space-y-3">
        <header className="grid gap-4 border-b border-border pb-4 md:grid-cols-[minmax(0,1fr)_minmax(18rem,26rem)] md:items-end">
          <div className="min-w-0">
            <h1 className="text-3xl font-bold text-foreground">{t('reforge.title')}</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
              {t('reforge.description', { count: merged.length, slots: slots.length })}
            </p>
            <p className="mt-0.5 max-w-3xl text-xs leading-5 text-muted-foreground">
              {t('reforge.mechanicNote')}
            </p>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-muted-foreground">{t('reforge.searchLabel')}</span>
            <span className="relative block">
              <IconSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" stroke={1.8} aria-hidden />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setQuery('')
                }}
                placeholder={t('reforge.searchPlaceholder')}
                className="h-10 border-border bg-background pl-9 text-sm shadow-none focus-visible:ring-[color:var(--arkive-nav-accent)]"
                data-testid="reforge-search"
              />
            </span>
          </label>
        </header>

        <section aria-label={t('reforge.filters')} className="grid gap-3 border-b border-border pb-3 lg:grid-cols-2 lg:gap-6">
          <FilterGroup label={t('reforge.slotLabel')} hint={t('reforge.slotHint')}>
            <FilterChip active={slot === 0} onClick={() => setSlot(0)} testId="reforge-slot-all">
              {t('reforge.all')}
              <span className="tabular-nums text-muted-foreground">{merged.length}</span>
            </FilterChip>
            {slots.map((entry) => (
              <FilterChip
                key={entry.id}
                active={slot === entry.id}
                onClick={() => setSlot(entry.id)}
                testId={`reforge-slot-${entry.id}`}
              >
                {entry.name}
                <span className="tabular-nums text-muted-foreground">{slotCounts.get(entry.id) ?? 0}</span>
              </FilterChip>
            ))}
          </FilterGroup>
          <FilterGroup label={t('reforge.affixCountLabel')} hint={t('reforge.affixCountHint')}>
            <FilterChip active={affixCount === 0} onClick={() => setAffixCount(0)} testId="reforge-count-all">
              {t('reforge.all')}
              <span className="tabular-nums text-muted-foreground">{merged.length}</span>
            </FilterChip>
            {counts.map((count) => (
              <FilterChip
                key={count}
                active={affixCount === count}
                onClick={() => setAffixCount(count)}
                testId={`reforge-count-${count}`}
              >
                {t('reforge.affixCountValue', { count })}
                <span className="tabular-nums text-muted-foreground">{affixCounts.get(count) ?? 0}</span>
              </FilterChip>
            ))}
          </FilterGroup>
        </section>

        <section className="flex min-h-9 items-center justify-between gap-3 border-b border-border pb-2">
          <span className="text-sm tabular-nums text-muted-foreground">
            {t('reforge.resultCount', { count: filtered.length })}
          </span>
        </section>

        {sections.length === 0 ? (
          <p className="border-y border-border py-12 text-center text-sm text-muted-foreground">{t('reforge.empty')}</p>
        ) : (
          <div className="space-y-6" data-testid="reforge-sections">
            {sections.map((section) => (
              <section key={section.slot.id} aria-label={section.slot.name} data-testid={`reforge-slot-section-${section.slot.id}`}>
                <h2 className="flex flex-wrap items-baseline gap-x-2 border-b border-border pb-1.5 text-xl font-bold text-foreground">
                  {section.slot.name}
                  <span className="text-xs font-normal text-muted-foreground">
                    {t('reforge.slotGraceCount', {
                      count: section.groups.reduce((total, group) => total + group.graces.length, 0),
                    })}
                  </span>
                </h2>
                <div className="mt-2 space-y-4">
                  {section.groups.map((group) => (
                    <div key={group.count}>
                      <h3 className="mb-1.5 flex flex-wrap items-baseline gap-x-2 text-sm font-bold text-foreground">
                        <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${COUNT_BADGE_CLASS[group.count] ?? COUNT_BADGE_CLASS[2]}`}>
                          {t('reforge.affixCountValue', { count: group.count })}
                        </span>
                        <span className="text-xs font-normal text-muted-foreground">
                          {t('reforge.groupGraceCount', { count: group.graces.length })}
                        </span>
                      </h3>
                      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2 2xl:grid-cols-3">
                        {group.graces.map((grace) => (
                          <GraceCard key={grace.key} grace={grace} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
          <p className="flex items-center gap-2">
            <IconDatabase className="size-4" stroke={1.8} aria-hidden />
            {t('reforge.sourceNote')}
          </p>
          <p className="flex items-center gap-2">
            <IconInfoCircle className="size-4" stroke={1.8} aria-hidden />
            {t('reforge.dataNote')}
          </p>
        </div>
      </div>
    </ContentPage>
  )
}

function GraceCard({ grace }: { grace: MergedGrace }) {
  const { t } = useTranslation()
  const surface = COUNT_CLASS[grace.extraordinaryCount] ?? COUNT_CLASS[2]

  return (
    <article
      className={`flex min-w-0 flex-col gap-2 rounded-md border p-3 transition-colors hover:border-[color:var(--arkive-nav-accent)] ${surface}`}
      data-testid={`reforge-grace-${grace.ids[0]}`}
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <h4 className="min-w-0 text-base font-bold leading-6 text-foreground" title={grace.name}>
          {grace.name}
        </h4>
        <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-xs font-semibold tabular-nums ${COUNT_BADGE_CLASS[grace.extraordinaryCount] ?? COUNT_BADGE_CLASS[2]}`}>
          {t('reforge.affixCountValue', { count: grace.extraordinaryCount })}
        </span>
      </div>

      {/* Every split that yields this grace. More than one means the same name
          is reachable from different affix distributions. */}
      <ul className="flex flex-col gap-1">
        {grace.combos.map((combo, comboIndex) => (
          <li key={comboKey(combo)} className="flex flex-wrap items-center gap-1">
            {/* Splits are alternatives, not a set to collect — without the
                marker two stacked rows read as one longer requirement. */}
            {comboIndex > 0 ? (
              <span className="text-xs text-muted-foreground">{t('reforge.comboOr')}</span>
            ) : null}
            {combo.map((condition, index) => (
              <span key={condition.stat} className="flex items-center gap-1">
                {index > 0 ? <span className="text-xs text-muted-foreground">+</span> : null}
                <span className="inline-flex items-center gap-1 rounded border border-border bg-background/70 px-1.5 py-0.5 text-xs font-medium text-foreground">
                  {condition.stat}
                  <span className="tabular-nums text-muted-foreground">x{condition.count}</span>
                </span>
              </span>
            ))}
          </li>
        ))}
      </ul>

      <p className="text-sm leading-6 text-foreground/90 whitespace-pre-line">{grace.brief1}</p>
      {grace.brief2 && grace.brief2 !== grace.brief1 ? (
        <p className="text-xs leading-5 text-muted-foreground whitespace-pre-line">
          <span className="font-semibold">{t('reforge.healingForm')}</span>
          {t('reforge.labelSeparator')}
          {grace.brief2}
        </p>
      ) : null}

      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/70 pt-2 text-xs text-muted-foreground">
        <span className="tabular-nums">{t('reforge.score', { score: grace.score })}</span>
        {grace.tags.map((tag) => (
          <span key={tag} className="font-medium text-foreground/75">{tag}</span>
        ))}
        <UnlockNote unlock={grace.unlock} />
      </div>
    </article>
  )
}

function UnlockNote({ unlock }: { unlock: GraceUnlock | null }) {
  const { t } = useTranslation()
  if (!unlock) return null
  if (unlock.kind === 'equipment') {
    return <span title={unlock.raw}>{t('reforge.unlockMythEquipment')}</span>
  }
  if (unlock.day >= NEVER_DAY) {
    return <span title={unlock.raw}>{t('reforge.unlockUnscheduled')}</span>
  }
  return <span title={unlock.raw}>{t('reforge.unlockSeasonDay', { day: unlock.day })}</span>
}

function FilterGroup({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h2 className="text-sm font-bold text-foreground">{label}</h2>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">{children}</div>
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  testId,
  children,
}: {
  active: boolean
  onClick: () => void
  testId: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-testid={testId}
      className={`inline-flex min-h-8 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--arkive-nav-accent)] ${
        active
          ? 'border-[color:var(--arkive-nav-accent)] bg-[color:var(--arkive-filter-active)] text-foreground'
          : 'border-border bg-background text-muted-foreground hover:border-[color:var(--arkive-nav-accent)]/60 hover:text-foreground'
      }`}
    >
      {children}
    </button>
  )
}
