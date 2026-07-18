import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { Input, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@gamemap/ui'
import { ContentPage } from '../../components/ContentPage'
import { FilterChip, FilterRow, toggleValue } from '../../components/FilterChip'
import {
  loadPals,
  passiveCategories,
  passiveDescription,
  stripPassiveTags,
  PASSIVE_CATEGORIES,
  type PalsBundle,
  type PassiveCategory,
} from '../../lib/pals'
import { palIconUrl } from '../../lib/assets'
import { CatalogDataProvider, PalHover } from '../catalog/components'
import { PalPageLoading, PassiveRarity, PassiveText, PassiveTitleBar } from './components'

/** Pals that innately carry a given passive, keyed by passive id. */
type PalRef = { id: string; name: string; icon: string }

/** A passive's rarity bucket key — its signed rank, e.g. "+4" / "+1" / "-3".
 *  Arrows show abs(rank) chevrons, so each rank is its own bucket and the
 *  filter lines up with what cards show. */
function rarityKey(rank: number): string {
  if (!rank) return '0'
  return rank > 0 ? `+${rank}` : `${rank}`
}
/** The rank a bucket key stands for, for rendering its arrows in the filter. */
function repRank(key: string): number {
  return Number(key)
}
/** Signed rank score for sorting buckets best → worst (+5 … -3). */
function rarityScore(key: string): number {
  return Number(key)
}

export default function PassivesPage() {
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'

  const [bundle, setBundle] = useState<PalsBundle | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [raritySel, setRaritySel] = useState<string[]>([])
  const [categorySel, setCategorySel] = useState<string[]>([])
  const [mutationOnly, setMutationOnly] = useState(false)
  const [innateOnly, setInnateOnly] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoadError(null)
    loadPals(lng)
      .then((b) => {
        if (!cancelled) setBundle(b)
      })
      .catch((err) => {
        console.error(err)
        if (!cancelled) setLoadError(t('loadError'))
      })
    return () => {
      cancelled = true
    }
  }, [lng, t])

  // All passives (union of ids with metadata and/or localized text), each with a
  // display description (real or synthesized), its rank, categories, and the
  // pals that innately carry it (reverse of each pal's `passives` list).
  const all = useMemo(() => {
    if (!bundle) return []
    const palsByPassive = new Map<string, PalRef[]>()
    for (const p of bundle.pals) {
      for (const pid of p.passives) {
        const list = palsByPassive.get(pid) ?? []
        list.push({ id: p.id, name: bundle.text[p.id]?.name ?? p.id, icon: p.icon })
        palsByPassive.set(pid, list)
      }
    }
    const ids = new Set<string>()
    for (const p of bundle.passives) ids.add(p.id)
    for (const id of Object.keys(bundle.passiveText)) ids.add(id)
    return [...ids].map((id) => {
      const description = passiveDescription(id, bundle)
      return {
        id,
        name: bundle.passiveText[id]?.name ?? id,
        description,
        // Plain text (tags stripped) for case-insensitive search matching.
        search: stripPassiveTags(description).toLowerCase(),
        rank: bundle.passivesById.get(id)?.rank ?? 0,
        mutation: bundle.passivesById.get(id)?.mutation ?? false,
        invoke: bundle.passivesById.get(id)?.invoke ?? [],
        categories: passiveCategories(id, bundle),
        pals: palsByPassive.get(id) ?? [],
      }
    })
  }, [bundle])

  // Rarity buckets present, best → worst, for the filter dropdown.
  const rarities = useMemo(() => {
    const keys = new Set<string>()
    for (const p of all) keys.add(rarityKey(p.rank))
    return [...keys].sort((a, b) => rarityScore(b) - rarityScore(a))
  }, [all])

  // Categories present, in fixed order, for the category filter.
  const categories = useMemo(() => {
    const present = new Set<PassiveCategory>()
    for (const p of all) for (const c of p.categories) present.add(c)
    return PASSIVE_CATEGORIES.filter((c) => present.has(c))
  }, [all])

  // Whether any passive is uncategorized (debuffs / text-only) — drives the
  // "None" filter option.
  const hasNone = useMemo(() => all.some((p) => p.categories.length === 0), [all])

  // Whether any mutation-pool passive is present — drives the "Mutation" chip.
  const hasMutation = useMemo(() => all.some((p) => p.mutation), [all])

  // Whether any passive is innately carried by a pal — drives the "Innate" chip.
  const hasInnate = useMemo(() => all.some((p) => p.pals.length > 0), [all])

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (
      all
        .filter((r) => raritySel.length === 0 || raritySel.includes(rarityKey(r.rank)))
        .filter(
          (r) =>
            categorySel.length === 0 ||
            categorySel.some((c) =>
              c === 'none' ? r.categories.length === 0 : r.categories.includes(c as PassiveCategory),
            ),
        )
        .filter((r) => !mutationOnly || r.mutation)
        .filter((r) => !innateOnly || r.pals.length > 0)
        .filter(
          (r) => !q || r.name.toLowerCase().includes(q) || r.search.includes(q) || r.id.toLowerCase().includes(q),
        )
        // Best rarity first, then by id so the order is identical in every
        // language (localized names would reshuffle per locale).
        .sort((a, b) => b.rank - a.rank || a.id.localeCompare(b.id))
    )
  }, [all, query, raritySel, categorySel, mutationOnly, innateOnly])

  return (
    <TooltipProvider delayDuration={200}>
    <CatalogDataProvider pals={bundle ?? undefined}>
    <ContentPage active="/passives" title={t('pal.section.passives')} heading>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('search')}
          className="max-w-sm"
          data-testid="passive-search"
        />
        {bundle ? (
          <span className="text-sm text-muted-foreground">
            {t('resultsCount', { count: list.length })}
          </span>
        ) : null}
      </div>
      {bundle ? (
        <div className="mb-4 space-y-1.5">
          <FilterRow label={t('filters.rarity')} testId="passive-rarity-filter">
            {rarities.map((key) => (
              <FilterChip
                key={key}
                active={raritySel.includes(key)}
                onClick={() => setRaritySel((s) => toggleValue(s, key))}
                testId={`rarity-${key}`}
              >
                <PassiveRarity rank={repRank(key)} />
              </FilterChip>
            ))}
          </FilterRow>
          <FilterRow label={t('filters.category')} testId="passive-category-filter">
            {categories.map((c) => (
              <FilterChip
                key={c}
                active={categorySel.includes(c)}
                onClick={() => setCategorySel((s) => toggleValue(s, c))}
                testId={`category-${c}`}
              >
                {t(`passive.category.${c}`)}
              </FilterChip>
            ))}
            {hasNone ? (
              <FilterChip
                active={categorySel.includes('none')}
                onClick={() => setCategorySel((s) => toggleValue(s, 'none'))}
                testId="category-none"
              >
                {t('passive.category.none')}
              </FilterChip>
            ) : null}
            {hasInnate ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex">
                    <FilterChip
                      active={innateOnly}
                      onClick={() => setInnateOnly((v) => !v)}
                      testId="category-innate"
                    >
                      <span className="inline-block size-1.5 rounded-full bg-emerald-500" />
                      {t('passive.innate')}
                    </FilterChip>
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">{t('passive.innateTip')}</TooltipContent>
              </Tooltip>
            ) : null}
            {hasMutation ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex">
                    <FilterChip
                      active={mutationOnly}
                      onClick={() => setMutationOnly((v) => !v)}
                      testId="category-mutation"
                    >
                      <span className="inline-block size-1.5 rounded-full bg-violet-500" />
                      {t('passive.mutation')}
                    </FilterChip>
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">{t('passive.mutationTip')}</TooltipContent>
              </Tooltip>
            ) : null}
          </FilterRow>
        </div>
      ) : null}

      {loadError ? (
        <div className="mt-8 text-center text-destructive">{loadError}</div>
      ) : !bundle ? (
        <PalPageLoading />
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((r) => (
            <div
              key={r.id}
              data-testid="passive-row"
              className="flex flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm"
            >
              <PassiveTitleBar name={r.name} rank={r.rank} />
              <div className="flex flex-1 flex-col p-3">
              {r.description ? (
                <p className="text-xs leading-snug whitespace-pre-line text-muted-foreground">
                  <PassiveText text={r.description} />
                </p>
              ) : null}
              {r.pals.length || r.categories.length || r.mutation || r.invoke.length ? (
                <div className="mt-auto space-y-2 pt-2">
                  {r.pals.length ? (
                    <div className="flex flex-wrap items-center gap-1">
                      {r.pals.map((p) => (
                        <PalHover key={p.id} id={p.id}>
                          <Link
                            to="/pals/$id"
                            params={{ id: p.id }}
                            title={p.name}
                            data-testid="passive-pal"
                            className="shrink-0 rounded-full border border-border bg-secondary/40 transition hover:border-primary/60"
                          >
                            <img
                              src={palIconUrl(p.icon)}
                              alt={p.name}
                              width={24}
                              height={24}
                              loading="lazy"
                              className="size-6 rounded-full object-contain"
                            />
                          </Link>
                        </PalHover>
                      ))}
                    </div>
                  ) : null}
                  {r.categories.length || r.mutation ? (
                    <div className="flex flex-wrap gap-1">
                      {r.mutation ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span
                              data-testid="passive-mutation-badge"
                              className="inline-flex cursor-help items-center gap-1 rounded bg-violet-500/15 px-1.5 py-0.5 text-xs font-medium text-violet-600 ring-1 ring-inset ring-violet-500/30 dark:text-violet-300"
                            >
                              <span className="inline-block size-1.5 rounded-full bg-violet-500" />
                              {t('passive.mutation')}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">{t('passive.mutationTip')}</TooltipContent>
                        </Tooltip>
                      ) : null}
                      {r.categories.map((c) => (
                        <span
                          key={c}
                          className="rounded bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground"
                        >
                          {t(`passive.category.${c}`)}
                        </span>
                      ))}
                      {r.invoke.map((scope) => (
                        <span
                          key={scope}
                          title={t('passive.invokeTip', {
                            defaultValue: 'When this passive is active',
                          })}
                          className="rounded bg-amber-500/15 px-1.5 py-0.5 text-xs font-medium text-amber-600 ring-1 ring-inset ring-amber-500/30 dark:text-amber-300"
                        >
                          {t(`passive.invoke.${scope}`, { defaultValue: scope })}
                        </span>
                      ))}
                    </div>
                  ) : r.invoke.length ? (
                    <div className="flex flex-wrap gap-1">
                      {r.invoke.map((scope) => (
                        <span
                          key={scope}
                          className="rounded bg-amber-500/15 px-1.5 py-0.5 text-xs font-medium text-amber-600 ring-1 ring-inset ring-amber-500/30 dark:text-amber-300"
                        >
                          {t(`passive.invoke.${scope}`, { defaultValue: scope })}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </ContentPage>
    </CatalogDataProvider>
    </TooltipProvider>
  )
}
