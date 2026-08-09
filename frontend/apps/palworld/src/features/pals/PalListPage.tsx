import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Input } from '@gamemap/ui'
import { defineMemoryRecord, isString, parseJson, useMemoryState } from '@gamemap/state-memory'
import { ContentPage, ContentPageFilters } from '../../components/ContentPage'
import { MobilePagination, useMobilePagination } from '../../components/MobilePagination'
import { loadPals, type PalsBundle } from '../../lib/pals'
import { CatalogDataProvider } from '../catalog/components'
import { PalCard, PalFilters, PalPageLoading, PalTable } from './components'
import { filterStrings } from './filterStrings'
import { EMPTY_FILTER, isFilterActive, useFilteredPals, type PalFilter } from './useFilteredPals'

// Persist the pal-list filter across reloads.
const PAL_FILTER_KEY = 'palworld.pals.filter'

function isPalFilter(value: unknown): value is PalFilter {
  if (!value || typeof value !== 'object') return false
  const filter = value as Partial<PalFilter>
  return typeof filter.query === 'string' &&
    Array.isArray(filter.elements) && filter.elements.every((item) => typeof item === 'string') &&
    Array.isArray(filter.works) && filter.works.every((item) => typeof item === 'string') &&
    Array.isArray(filter.reactions) && filter.reactions.every((item) => typeof item === 'string') &&
    Array.isArray(filter.sizes) && filter.sizes.every((item) => typeof item === 'string') &&
    typeof filter.nocturnal === 'boolean' &&
    (filter.loot === null || typeof filter.loot === 'string')
}

const filterRecord = defineMemoryRecord({
  id: 'filters',
  namespace: 'palworld',
  surface: 'pals-catalog',
  stateClass: 'device_preference',
  schemaVersion: '1.0.0',
  defaultValue: () => ({ ...EMPTY_FILTER }),
  validate: isPalFilter,
  legacyKeys: [PAL_FILTER_KEY],
  migrateLegacy: (raw: string) => ({ ...EMPTY_FILTER, ...(parseJson(raw) as Partial<PalFilter>), query: '' }),
})

const queryRecord = defineMemoryRecord({
  id: 'query',
  namespace: 'palworld',
  surface: 'pals-catalog',
  stateClass: 'session_context',
  schemaVersion: '1.0.0',
  defaultValue: () => '',
  validate: isString,
  retentionMs: 24 * 60 * 60 * 1_000,
})

const viewRecord = defineMemoryRecord({
  id: 'view-mode',
  namespace: 'palworld',
  surface: 'catalog',
  stateClass: 'device_preference',
  schemaVersion: '1.0.0',
  defaultValue: () => 'grid' as 'grid' | 'list',
  validate: (value: unknown): value is 'grid' | 'list' => value === 'grid' || value === 'list',
})

/** Read the persisted filter, merged onto EMPTY_FILTER so a stored object with
 *  missing or since-added fields stays valid. */
export default function PalListPage() {
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'
  const fs = filterStrings(lng)

  const [bundle, setBundle] = useState<PalsBundle | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [durableFilter, setDurableFilter] = useMemoryState(filterRecord)
  const [query, setQuery] = useMemoryState(queryRecord, { partition: 'pals' })
  const [view, setView] = useMemoryState(viewRecord)
  const filter = { ...durableFilter, query }
  const setFilter = (next: PalFilter) => {
    setDurableFilter({ ...next, query: '' })
    setQuery(next.query)
  }

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
