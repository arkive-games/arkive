import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from '@gamemap/ui'
import { ContentPage } from '../../components/ContentPage'
import { FilterChip, FilterRow, toggleValue } from '../../components/FilterChip'
import {
  loadItems,
  loadBuildings,
  loadTech,
  type ItemsBundle,
  type BuildingsBundle,
  type TechBundle,
} from '../../lib/catalog'
import { loadPals, type PalsBundle } from '../../lib/pals'
import { buildingTypeLabel, typeOrder } from '../catalog/labels'
import { CatalogDataProvider, CatalogPageLoading } from '../catalog/components'
import { RevealFooter } from '../catalog/RevealFooter'
import { useIncrementalList } from '../catalog/useIncrementalList'
import { makeTechResolvers } from '../technology/techModel'
import { BuildingTile } from './components/BuildingTile'

export default function BuildingListPage() {
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'

  const [bundle, setBundle] = useState<BuildingsBundle | null>(null)
  const [items, setItems] = useState<ItemsBundle | null>(null)
  const [tech, setTech] = useState<TechBundle | null>(null)
  const [pals, setPals] = useState<PalsBundle | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [cats, setCats] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false
    setLoadError(null)
    Promise.all([loadItems(lng), loadBuildings(lng), loadTech(lng), loadPals(lng)])
      .then(([i, b, tc, p]) => {
        if (cancelled) return
        setItems(i)
        setBundle(b)
        setTech(tc)
        setPals(p)
      })
      .catch((err) => {
        console.error(err)
        if (!cancelled) setLoadError(t('loadError'))
      })
    return () => {
      cancelled = true
    }
  }, [lng, t])

  // Categories in the game's build-menu order (labels.json key order —
  // identical across languages).
  const categories = useMemo(() => {
    if (!bundle) return []
    const set = new Set(bundle.buildings.map((b) => b.typeA))
    return [...set].sort(
      (a, b) => typeOrder(a, bundle.typeLabels) - typeOrder(b, bundle.typeLabels) || a.localeCompare(b),
    )
  }, [bundle])

  const list = useMemo(() => {
    if (!bundle) return []
    const q = query.trim().toLowerCase()
    return bundle.buildings
      .filter((b) => cats.length === 0 || cats.includes(b.typeA))
      .filter(
        (b) =>
          !q ||
          b.id.toLowerCase().includes(q) ||
          (bundle.text[b.id]?.name ?? b.id).toLowerCase().includes(q),
      )
      // Stable game order: build-menu category order, then SortId within the
      // category (SortId is only unique per typeA), identical across languages.
      .sort(
        (a, b) =>
          typeOrder(a.typeA, bundle.typeLabels) - typeOrder(b.typeA, bundle.typeLabels) ||
          a.sortId - b.sortId ||
          a.id.localeCompare(b.id),
      )
  }, [bundle, query, cats])

  // Same auto-scroll reveal as the items page; 494 tiles is mild, but the
  // shared behavior also speeds first paint.
  const { shown, remaining, showMore, sentinelRef } = useIncrementalList(list, 'buildings')

  const iname = (id: string) => items?.text[id]?.name ?? id
  const techResolvers = useMemo(
    () => (items && bundle && tech && pals ? makeTechResolvers(items, bundle, tech, pals) : null),
    [items, bundle, tech, pals],
  )

  return (
    <ContentPage active="/buildings" title={t('building.title')} heading>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('building.searchPlaceholder')}
              className="max-w-sm"
            />
            {bundle ? (
              <span className="text-sm text-muted-foreground" data-testid="building-count">
                {t('building.count', { count: list.length })}
              </span>
            ) : null}
          </div>
          {bundle ? (
            <div className="mb-4">
              <FilterRow label={t('filters.category')} testId="building-category-filter">
                {categories.map((c) => (
                  <FilterChip
                    key={c}
                    active={cats.includes(c)}
                    onClick={() => setCats((s) => toggleValue(s, c))}
                    testId={`building-cat-${c}`}
                  >
                    {buildingTypeLabel(c, bundle.typeLabels)}
                  </FilterChip>
                ))}
              </FilterRow>
            </div>
          ) : null}

          {loadError ? (
            <div className="mt-8 text-center text-destructive">{loadError}</div>
          ) : !bundle || !tech || !techResolvers ? (
            <CatalogPageLoading />
          ) : (
            <CatalogDataProvider items={items ?? undefined} buildings={bundle} tech={tech}>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
                {shown.map((b) => (
                  <BuildingTile
                    key={b.id}
                    building={b}
                    name={bundle.text[b.id]?.name ?? b.id}
                    typeLabels={bundle.typeLabels}
                    iname={iname}
                    tech={tech}
                    techResolvers={techResolvers}
                  />
                ))}
              </div>
              <RevealFooter
                shownCount={shown.length}
                remaining={remaining}
                showMore={showMore}
                sentinelRef={sentinelRef}
                testId="building-show-more"
              />
            </CatalogDataProvider>
          )}
    </ContentPage>
  )
}
