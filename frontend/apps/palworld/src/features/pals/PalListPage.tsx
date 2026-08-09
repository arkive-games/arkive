import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Input } from '@gamemap/ui'
import { ContentPage, ContentPageFilters } from '../../components/ContentPage'
import { MobilePagination, useMobilePagination } from '../../components/MobilePagination'
import { loadPals, type PalsBundle } from '../../lib/pals'
import { CatalogDataProvider } from '../catalog/components'
import { PalCard, PalFilters, PalPageLoading, PalTable } from './components'
import { filterStrings } from './filterStrings'
import { EMPTY_FILTER, isFilterActive, useFilteredPals, type PalFilter } from './useFilteredPals'

// Persist the pal-list filter across reloads.
const PAL_FILTER_KEY = 'palworld.pals.filter'

/** Read the persisted filter, merged onto EMPTY_FILTER so a stored object with
 *  missing or since-added fields stays valid. */
function readStoredFilter(): PalFilter {
  try {
    const raw = localStorage.getItem(PAL_FILTER_KEY)
    if (!raw) return EMPTY_FILTER
    return { ...EMPTY_FILTER, ...(JSON.parse(raw) as Partial<PalFilter>) }
  } catch {
    return EMPTY_FILTER
  }
}

export default function PalListPage() {
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'
  const fs = filterStrings(lng)

  const [bundle, setBundle] = useState<PalsBundle | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [filter, setFilter] = useState<PalFilter>(readStoredFilter)
  const [view, setView] = useState<'grid' | 'list'>('grid')

  useEffect(() => {
    try {
      localStorage.setItem(PAL_FILTER_KEY, JSON.stringify(filter))
    } catch { /* no storage */ }
  }, [filter])

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

  const roster = useFilteredPals(bundle, filter)
  const mobilePaging = useMobilePagination(roster, {
    pageSize: 24,
    resetKey: JSON.stringify(filter),
  })

  return (
    <ContentPage
      active="/pals"
      title={t('pal.title')}
      heading
      // Inline on desktop, behind the mobile header's filter icon (see
      // ContentPage). The search box and the grid/list switch stay on the page.
      filters={bundle ? <PalFilters bundle={bundle} filter={filter} onChange={setFilter} /> : undefined}
      // The query lives in the on-page search box, so it must not dot the icon —
      // only the facets inside the sheet count as "filters active".
      filtersActive={isFilterActive({ ...filter, query: '' })}
    >
        <CatalogDataProvider pals={bundle ?? undefined}>
          <div className="mb-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 md:flex md:flex-wrap">
            <Input
              type="search"
              value={filter.query}
              onChange={(e) => setFilter({ ...filter, query: e.target.value })}
              placeholder={t('pal.searchPlaceholder')}
              className="order-1 max-w-none md:max-w-xs"
            />
            <div className="order-2 inline-flex overflow-hidden rounded-md border border-border md:order-3 md:ml-auto">
              <Button
                variant={view === 'grid' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-11 rounded-none md:h-8"
                onClick={() => setView('grid')}
              >
                {fs.gridView}
              </Button>
              <Button
                variant={view === 'list' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-11 rounded-none md:h-8"
                onClick={() => setView('list')}
              >
                {fs.listView}
              </Button>
            </div>
            {bundle ? (
              <span data-testid="pal-count" className="order-3 col-span-2 text-sm text-muted-foreground md:order-2">
                {t('pal.count', { count: roster.length })}
              </span>
            ) : null}
          </div>

          <ContentPageFilters className="mb-4" />

          {loadError ? (
            <div className="mt-8 text-center text-destructive">{loadError}</div>
          ) : !bundle ? (
            <PalPageLoading />
          ) : roster.length === 0 ? (
            <div className="mt-12 text-center text-sm text-muted-foreground">{fs.noResults}</div>
          ) : view === 'list' ? (
            <PalTable pals={mobilePaging.visibleItems} bundle={bundle} />
          ) : (
            <div className="grid grid-cols-3 gap-2 min-[480px]:grid-cols-4 sm:grid-cols-6 md:grid-cols-8">
              {mobilePaging.visibleItems.map((p) => (
                <PalCard key={p.id} pal={p} name={bundle.text[p.id]?.name ?? p.id} />
              ))}
            </div>
          )}
          <MobilePagination
            page={mobilePaging.page}
            pageCount={mobilePaging.pageCount}
            onPageChange={mobilePaging.goToPage}
          />
        </CatalogDataProvider>
    </ContentPage>
  )
}
