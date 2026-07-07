import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Input } from '@gamemap/ui'
import { TopNav } from '../../components/TopNav'
import { loadPals, type PalsBundle } from '../../lib/pals'
import { PalCard, PalFilters, PalPageLoading, PalTable } from './components'
import { filterStrings } from './filterStrings'
import { EMPTY_FILTER, useFilteredPals, type PalFilter } from './useFilteredPals'

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

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <TopNav active="/pals" />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-6xl px-4 py-6">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <Input
              value={filter.query}
              onChange={(e) => setFilter({ ...filter, query: e.target.value })}
              placeholder={t('pal.searchPlaceholder')}
              className="max-w-xs"
            />
            {bundle ? (
              <span className="text-sm text-muted-foreground">
                {t('pal.count', { count: roster.length })}
              </span>
            ) : null}
            <div className="ml-auto inline-flex overflow-hidden rounded-md border border-border">
              <Button
                variant={view === 'grid' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-8 rounded-none"
                onClick={() => setView('grid')}
              >
                {fs.gridView}
              </Button>
              <Button
                variant={view === 'list' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-8 rounded-none"
                onClick={() => setView('list')}
              >
                {fs.listView}
              </Button>
            </div>
          </div>

          {bundle ? (
            <div className="mb-4">
              <PalFilters bundle={bundle} filter={filter} onChange={setFilter} />
            </div>
          ) : null}

          {loadError ? (
            <div className="mt-8 text-center text-destructive">{loadError}</div>
          ) : !bundle ? (
            <PalPageLoading />
          ) : roster.length === 0 ? (
            <div className="mt-12 text-center text-sm text-muted-foreground">{fs.noResults}</div>
          ) : view === 'list' ? (
            <PalTable pals={roster} bundle={bundle} />
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
              {roster.map((p) => (
                <PalCard key={p.id} pal={p} name={bundle.text[p.id]?.name ?? p.id} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
