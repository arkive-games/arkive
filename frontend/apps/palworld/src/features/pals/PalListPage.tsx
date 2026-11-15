import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { browserMemory, defineMemoryRecord, memoryPolicy, parseJson, useMemoryState } from '@gamemap/state-memory'
import { ContentPage, ContentPageFilters } from '../../components/ContentPage'
import { MobilePagination, useMobilePagination } from '../../components/MobilePagination'
import { loadPals, type PalsBundle } from '../../lib/pals'
import { CatalogDataProvider } from '../catalog/components'
import { PalCard, PalFilters, PalPageLoading } from './components'
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
  ...memoryPolicy.userPreference('clear-pal-filters'),
  schemaVersion: '1.0.0',
  defaultValue: () => ({ ...EMPTY_FILTER }),
  validate: isPalFilter,
  legacyKeys: [PAL_FILTER_KEY],
  migrateLegacy: (raw: string) => ({ ...EMPTY_FILTER, ...(parseJson(raw) as Partial<PalFilter>), query: '' }),
})

// Keep the old device preference as a migration seed, never rewrite it.
const facetsRecord = defineMemoryRecord({
  id: 'pal-facets', namespace: 'palworld', surface: 'catalog-context',
  ...memoryPolicy.sessionContext('clear-catalog-context'),
  schemaVersion: '1.0.0',
  defaultValue: () => ({ ...browserMemory.read(filterRecord), query: '' }),
  validate: isPalFilter,
})

/** Read the persisted filter, merged onto EMPTY_FILTER so a stored object with
 *  missing or since-added fields stays valid. */
export default function PalListPage() {
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'
  const fs = filterStrings(lng)

  const [bundle, setBundle] = useState<PalsBundle | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [durableFilter, setDurableFilter] = useMemoryState(facetsRecord)
  const filter = { ...durableFilter, query: '' }
  const setFilter = (next: PalFilter) => setDurableFilter({ ...next, query: '' })

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
    <ContentPage browsing={{ section: 'pals', ready: !!bundle, resultsKey: JSON.stringify(filter) }}
      active="/pals"
      title={t('pal.title')}
      heading
      filters={bundle ? <PalFilters bundle={bundle} filter={filter} onChange={setFilter} /> : undefined}
      filtersActive={isFilterActive({ ...filter, query: '' })}
    >
        <CatalogDataProvider pals={bundle ?? undefined}>
          <ContentPageFilters className="mb-4" />

          {loadError ? (
            <div className="mt-8 text-center text-destructive">{loadError}</div>
          ) : !bundle ? (
            <PalPageLoading />
          ) : roster.length === 0 ? (
            <div className="mt-12 text-center text-sm text-muted-foreground">{fs.noResults}</div>
          ) : (
            <div className="grid grid-cols-3 gap-2 min-[480px]:grid-cols-4 sm:grid-cols-6 md:grid-cols-8">
              {mobilePaging.visibleItems.map((p) => (
                <PalCard
                  key={p.id}
                  pal={p}
                  name={bundle.text[p.id]?.name ?? p.id}
                  breedingPower={bundle.breedingPower.get(p.id)}
                  breedingPowerLabel={t('breeding.breedingPower')}
                />
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
