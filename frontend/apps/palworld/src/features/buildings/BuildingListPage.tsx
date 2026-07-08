import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
  loadItems,
  loadBuildings,
  loadTech,
  type ItemsBundle,
  type BuildingsBundle,
  type TechBundle,
} from '../../lib/catalog'
import { buildingTypeLabel } from '../catalog/labels'
import { CatalogPageLoading } from '../catalog/components'
import { BuildingTile } from './components/BuildingTile'

export default function BuildingListPage() {
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'

  const [bundle, setBundle] = useState<BuildingsBundle | null>(null)
  const [items, setItems] = useState<ItemsBundle | null>(null)
  const [tech, setTech] = useState<TechBundle | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [cat, setCat] = useState('all')

  useEffect(() => {
    let cancelled = false
    setLoadError(null)
    Promise.all([loadItems(lng), loadBuildings(lng), loadTech(lng)])
      .then(([i, b, tc]) => {
        if (cancelled) return
        setItems(i)
        setBundle(b)
        setTech(tc)
      })
      .catch((err) => {
        console.error(err)
        if (!cancelled) setLoadError(t('loadError'))
      })
    return () => {
      cancelled = true
    }
  }, [lng, t])

  const categories = useMemo(() => {
    if (!bundle) return []
    const set = new Set(bundle.buildings.map((b) => b.typeA))
    return [...set].sort((a, b) =>
      buildingTypeLabel(a, bundle.typeLabels).localeCompare(buildingTypeLabel(b, bundle.typeLabels)),
    )
  }, [bundle])

  const list = useMemo(() => {
    if (!bundle) return []
    const q = query.trim().toLowerCase()
    return bundle.buildings
      .filter((b) => cat === 'all' || b.typeA === cat)
      .filter(
        (b) =>
          !q ||
          b.id.toLowerCase().includes(q) ||
          (bundle.text[b.id]?.name ?? b.id).toLowerCase().includes(q),
      )
      .sort((a, b) => a.id.localeCompare(b.id))
  }, [bundle, query, cat])

  const iname = (id: string) => items?.text[id]?.name ?? id
  const techName = (id: string) => tech?.text[id]?.name ?? id

  return (
    <ContentPage active="/buildings" title={t('building.title')} maxWidth="max-w-5xl">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('building.searchPlaceholder')}
              className="max-w-sm"
            />
            <Select value={cat} onValueChange={setCat}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('building.all')}</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {buildingTypeLabel(c, bundle?.typeLabels)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {bundle ? (
              <span className="text-sm text-muted-foreground">
                {t('building.count', { count: list.length })}
              </span>
            ) : null}
          </div>

          {loadError ? (
            <div className="mt-8 text-center text-destructive">{loadError}</div>
          ) : !bundle ? (
            <CatalogPageLoading />
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
              {list.map((b) => (
                <BuildingTile
                  key={b.id}
                  building={b}
                  name={bundle.text[b.id]?.name ?? b.id}
                  typeLabels={bundle.typeLabels}
                  iname={iname}
                  techName={techName}
                />
              ))}
            </div>
          )}
    </ContentPage>
  )
}
