import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { Input } from '@gamemap/ui'
import { ContentPage } from '../../components/ContentPage'
import { FilterChip, toggleValue } from '../../components/FilterChip'
import { loadItems, type ItemsBundle } from '../../lib/catalog'
import { itemTypeLabel } from '../catalog/labels'
import { CatalogPageLoading, ItemGlyph, rarityBorderClass } from '../catalog/components'

export default function ItemListPage() {
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'

  const [bundle, setBundle] = useState<ItemsBundle | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [cats, setCats] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false
    setLoadError(null)
    loadItems(lng)
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

  // Distinct categories (TypeA) present, sorted by localized label.
  const categories = useMemo(() => {
    if (!bundle) return []
    const set = new Set(bundle.items.map((i) => i.typeA))
    return [...set].sort((a, b) =>
      itemTypeLabel(a, bundle.typeLabels).localeCompare(itemTypeLabel(b, bundle.typeLabels)),
    )
  }, [bundle])

  const list = useMemo(() => {
    if (!bundle) return []
    const q = query.trim().toLowerCase()
    return bundle.items
      .filter((i) => cats.length === 0 || cats.includes(i.typeA))
      .filter((i) => !q || (bundle.text[i.id]?.name ?? i.id).toLowerCase().includes(q))
      // Stable game order (SortId), identical across languages, rather than by
      // localized name which would reshuffle per locale.
      .sort((a, b) => a.sortId - b.sortId || a.id.localeCompare(b.id))
  }, [bundle, query, cats])

  return (
    <ContentPage active="/items" title={t('item.title')} maxWidth="max-w-5xl">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('item.searchPlaceholder')}
              className="max-w-sm"
            />
            {bundle ? (
              <span className="text-sm text-muted-foreground">
                {t('item.count', { count: list.length })}
              </span>
            ) : null}
          </div>
          {bundle ? (
            <div className="mb-4 flex flex-wrap gap-1.5" data-testid="item-category-filter">
              {categories.map((c) => (
                <FilterChip
                  key={c}
                  active={cats.includes(c)}
                  onClick={() => setCats((s) => toggleValue(s, c))}
                  testId={`item-cat-${c}`}
                >
                  {itemTypeLabel(c, bundle.typeLabels)}
                </FilterChip>
              ))}
            </div>
          ) : null}

          {loadError ? (
            <div className="mt-8 text-center text-destructive">{loadError}</div>
          ) : !bundle ? (
            <CatalogPageLoading />
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {list.map((i) => (
                <Link
                  key={i.id}
                  to="/items/$id"
                  params={{ id: i.id }}
                  data-testid="item-card"
                  className={`group relative flex aspect-square flex-col items-center gap-1 rounded-lg border bg-card p-3 text-center shadow-sm transition hover:border-primary/60 hover:bg-accent ${rarityBorderClass(i.rarity)}`}
                >
                  <span className="absolute right-1.5 top-1.5 text-xs tabular-nums text-muted-foreground/70">
                    #{i.sortId}
                  </span>
                  <span className="w-full truncate px-4 text-xs uppercase tracking-wide text-muted-foreground">
                    {itemTypeLabel(i.typeA, bundle.typeLabels)}
                  </span>
                  <div className="flex min-h-0 flex-1 items-center justify-center">
                    {i.icon ? (
                      <ItemGlyph icon={i.icon} size={72} />
                    ) : (
                      <div className="size-[72px]" aria-hidden />
                    )}
                  </div>
                  <span className="line-clamp-2 w-full text-sm font-medium leading-tight">
                    {bundle.text[i.id]?.name ?? i.id}
                  </span>
                </Link>
              ))}
            </div>
          )}
    </ContentPage>
  )
}
