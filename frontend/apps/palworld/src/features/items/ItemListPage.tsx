import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { HoverCard, HoverCardTrigger, Input } from '@gamemap/ui'
import { ContentPage } from '../../components/ContentPage'
import { FilterChip, FilterRow, toggleValue } from '../../components/FilterChip'
import { loadItems, type ItemsBundle } from '../../lib/catalog'
import { itemTypeLabel } from '../catalog/labels'
import {
  CatalogDataProvider,
  CatalogPageLoading,
  HoverCardBody,
  ItemGlyph,
  ItemSummary,
  rarityBorderClass,
} from '../catalog/components'

export default function ItemListPage() {
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'

  const [bundle, setBundle] = useState<ItemsBundle | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [cats, setCats] = useState<string[]>([])
  // bLegalInGame=false items (effigies, quest Key Spheres, deprecated/debug
  // rows) are hidden until this toggle is on.
  const [showHidden, setShowHidden] = useState(false)

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

  // Whether any hidden (illegal) item exists — drives the "Hidden items" chip.
  const hasHidden = useMemo(() => !!bundle?.items.some((i) => i.illegal), [bundle])

  // Distinct categories (TypeA) present, sorted by localized label. Derived from
  // the currently-visible set so categories that only hold hidden items don't
  // appear while the toggle is off.
  const categories = useMemo(() => {
    if (!bundle) return []
    const set = new Set(
      bundle.items.filter((i) => showHidden || !i.illegal).map((i) => i.typeA),
    )
    return [...set].sort((a, b) =>
      itemTypeLabel(a, bundle.typeLabels).localeCompare(itemTypeLabel(b, bundle.typeLabels)),
    )
  }, [bundle, showHidden])

  const list = useMemo(() => {
    if (!bundle) return []
    const q = query.trim().toLowerCase()
    return bundle.items
      .filter((i) => showHidden || !i.illegal)
      .filter((i) => cats.length === 0 || cats.includes(i.typeA))
      .filter((i) => !q || (bundle.text[i.id]?.name ?? i.id).toLowerCase().includes(q))
      // Stable game order (SortId), identical across languages, rather than by
      // localized name which would reshuffle per locale.
      .sort((a, b) => a.sortId - b.sortId || a.id.localeCompare(b.id))
  }, [bundle, query, cats, showHidden])

  return (
    <ContentPage active="/items" title={t('item.title')} heading>
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
            <div className="mb-4">
              <FilterRow label={t('filters.category')} testId="item-category-filter">
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
                {hasHidden ? (
                  <FilterChip
                    active={showHidden}
                    onClick={() => setShowHidden((v) => !v)}
                    testId="item-show-hidden"
                  >
                    {t('filters.hidden')}
                  </FilterChip>
                ) : null}
              </FilterRow>
            </div>
          ) : null}

          {loadError ? (
            <div className="mt-8 text-center text-destructive">{loadError}</div>
          ) : !bundle ? (
            <CatalogPageLoading />
          ) : (
            <CatalogDataProvider items={bundle}>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
                {list.map((i) => (
                  <HoverCard key={i.id} openDelay={120} closeDelay={120}>
                    <HoverCardTrigger asChild>
                      <Link
                        to="/items/$id"
                        params={{ id: i.id }}
                        data-testid="item-card"
                        title={bundle.text[i.id]?.name ?? i.id}
                        className={`group flex aspect-square w-full flex-col overflow-hidden rounded-md border bg-card shadow-sm transition hover:border-primary/60 hover:bg-accent ${rarityBorderClass(i.rarity)}`}
                      >
                        <span className="relative flex items-center justify-center bg-muted px-6 py-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          <span className="min-w-0 max-w-full truncate">
                            {itemTypeLabel(i.typeA, bundle.typeLabels)}
                          </span>
                          <span className="absolute right-2 normal-case tabular-nums text-muted-foreground/70">
                            #{i.sortId}
                          </span>
                        </span>
                        <span className="flex min-h-0 flex-1 items-center justify-center p-2">
                          {i.icon ? (
                            <ItemGlyph icon={i.icon} size={72} />
                          ) : (
                            <span className="size-16 rounded bg-secondary" aria-hidden />
                          )}
                        </span>
                        <span className="block truncate px-2 pb-1.5 text-center text-xs font-medium leading-tight">
                          {bundle.text[i.id]?.name ?? i.id}
                        </span>
                      </Link>
                    </HoverCardTrigger>
                    <HoverCardBody className="w-72">
                      <ItemSummary item={i} />
                    </HoverCardBody>
                  </HoverCard>
                ))}
              </div>
            </CatalogDataProvider>
          )}
    </ContentPage>
  )
}
