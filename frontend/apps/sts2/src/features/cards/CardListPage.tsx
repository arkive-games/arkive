import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from '@gamemap/ui'
import { ContentPage } from '../../components/ContentPage'
import { loadBundle, type Bundle } from '../../lib/data'
import { CardFilters, CardTile, ClearFiltersButton, PageLoading, usePoolColors } from './components'
import { EMPTY_FILTER, isFilterActive, useFilteredCards, type CardFilter } from './useFilteredCards'

const FILTER_KEY = 'sts2.cards.filter'

/** Merged onto EMPTY_FILTER so a stored object from an older build stays valid. */
function readStoredFilter(): CardFilter {
  try {
    const raw = localStorage.getItem(FILTER_KEY)
    if (!raw) return EMPTY_FILTER
    return { ...EMPTY_FILTER, ...(JSON.parse(raw) as Partial<CardFilter>) }
  } catch {
    return EMPTY_FILTER
  }
}

export default function CardListPage() {
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'

  const [bundle, setBundle] = useState<Bundle | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [filter, setFilter] = useState<CardFilter>(readStoredFilter)

  useEffect(() => {
    try { localStorage.setItem(FILTER_KEY, JSON.stringify(filter)) } catch { /* no storage */ }
  }, [filter])

  useEffect(() => {
    let cancelled = false
    setLoadError(null)
    loadBundle(lng)
      .then((b) => { if (!cancelled) setBundle(b) })
      .catch((err) => { console.error(err); if (!cancelled) setLoadError(t('loadError')) })
    return () => { cancelled = true }
  }, [lng, t])

  const cards = useFilteredCards(bundle, filter)
  const colors = usePoolColors(bundle)

  return (
    <ContentPage active="/cards" title={t('card.title')} heading wide>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Input
          value={filter.query}
          onChange={(e) => setFilter({ ...filter, query: e.target.value })}
          placeholder={t('card.searchPlaceholder')}
          className="max-w-xs"
          data-testid="card-search"
        />
        {bundle ? (
          <span className="text-sm text-muted-foreground" data-testid="card-count">
            {t('card.count', { count: cards.length })}
          </span>
        ) : null}
        {isFilterActive(filter) ? (
          <ClearFiltersButton onClick={() => setFilter(EMPTY_FILTER)} />
        ) : null}
      </div>

      {bundle ? (
        <div className="mb-4">
          <CardFilters bundle={bundle} filter={filter} onChange={setFilter} />
        </div>
      ) : null}

      {loadError ? (
        <div className="mt-8 text-center text-destructive">{loadError}</div>
      ) : !bundle ? (
        <PageLoading />
      ) : cards.length === 0 ? (
        <div className="mt-12 text-center text-sm text-muted-foreground">{t('card.noResults')}</div>
      ) : (
        <div className="grid grid-cols-3 gap-2 min-[480px]:grid-cols-4 sm:grid-cols-6 lg:grid-cols-8">
          {cards.map((c) => (
            <CardTile
              key={c.id}
              card={c}
              name={bundle.cardText[c.id]?.name ?? c.id}
              poolColor={c.pool ? colors[c.pool] : undefined}
            />
          ))}
        </div>
      )}
    </ContentPage>
  )
}
