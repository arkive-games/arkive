import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@gamemap/ui'
import { ContentPage } from '../../components/ContentPage'
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
import { PalPageLoading, PassiveRarity, PassiveText, PassiveTitleBar, passiveRarityTier } from './components'

/** Pals that innately carry a given passive, keyed by passive id. */
type PalRef = { id: string; name: string; icon: string }

/** A passive's rarity bucket key, e.g. "+3" / "+1" / "-2". Matches the arrow
 *  display (sign + 1–3 tier), so the filter lines up with what cards show. */
function rarityKey(rank: number): string {
  if (!rank) return '0'
  return `${rank > 0 ? '+' : '-'}${passiveRarityTier(rank)}`
}
/** A representative rank for rendering a bucket's arrows in the filter. */
function repRank(key: string): number {
  const tier = Number(key[1])
  const mag = tier >= 3 ? 4 : tier
  return key[0] === '-' ? -mag : mag
}
/** Signed tier score for sorting buckets best → worst (+3 … -2). */
function rarityScore(key: string): number {
  return (key[0] === '-' ? -1 : 1) * Number(key[1])
}

export default function PassivesPage() {
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'

  const [bundle, setBundle] = useState<PalsBundle | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [rarity, setRarity] = useState('all')
  const [category, setCategory] = useState('all')

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

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (
      all
        .filter((r) => rarity === 'all' || rarityKey(r.rank) === rarity)
        .filter((r) =>
          category === 'all'
            ? true
            : category === 'none'
              ? r.categories.length === 0
              : r.categories.includes(category as PassiveCategory),
        )
        .filter(
          (r) => !q || r.name.toLowerCase().includes(q) || r.search.includes(q) || r.id.toLowerCase().includes(q),
        )
        // Best rarity first, then by id so the order is identical in every
        // language (localized names would reshuffle per locale).
        .sort((a, b) => b.rank - a.rank || a.id.localeCompare(b.id))
    )
  }, [all, query, rarity, category])

  return (
    <ContentPage active="/passives" title={t('pal.section.passives')} maxWidth="max-w-4xl">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('search')}
          className="max-w-sm"
          data-testid="passive-search"
        />
        <Select value={rarity} onValueChange={setRarity}>
          <SelectTrigger className="w-40" data-testid="passive-rarity-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('passive.allRarities')}</SelectItem>
            {rarities.map((key) => (
              <SelectItem key={key} value={key} data-testid={`rarity-${key}`}>
                <PassiveRarity rank={repRank(key)} />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-40" data-testid="passive-category-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('passive.allTypes')}</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c} data-testid={`category-${c}`}>
                {t(`passive.category.${c}`)}
              </SelectItem>
            ))}
            {hasNone ? (
              <SelectItem value="none" data-testid="category-none">
                {t('passive.category.none')}
              </SelectItem>
            ) : null}
          </SelectContent>
        </Select>
        {bundle ? (
          <span className="text-sm text-muted-foreground">
            {t('resultsCount', { count: list.length })}
          </span>
        ) : null}
      </div>

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
              {r.pals.length || r.categories.length ? (
                <div className="mt-auto space-y-2 pt-2">
                  {r.pals.length ? (
                    <div className="flex flex-wrap items-center gap-1">
                      {r.pals.map((p) => (
                        <Link
                          key={p.id}
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
                      ))}
                    </div>
                  ) : null}
                  {r.categories.length ? (
                    <div className="flex flex-wrap gap-1">
                      {r.categories.map((c) => (
                        <span
                          key={c}
                          className="rounded bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground"
                        >
                          {t(`passive.category.${c}`)}
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
  )
}
