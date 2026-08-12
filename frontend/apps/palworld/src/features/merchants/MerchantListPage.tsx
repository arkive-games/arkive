import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { Input } from '@gamemap/ui'
import { MapPin } from 'lucide-react'
import { ContentPage } from '../../components/ContentPage'
import { FilterChip, FilterRow } from '../../components/FilterChip'
import { MobilePagination, useMobilePagination } from '../../components/MobilePagination'
import { loadItems, type ItemsBundle } from '../../lib/catalog'
import { loadMerchants, type MerchantsBundle } from '../../lib/merchants'
import { palIconUrl } from '../../lib/assets'
import { toGameCoords } from '../../lib/coords'
import { CatalogPageLoading, ItemGlyph } from '../catalog/components'

export default function MerchantListPage() {
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'

  const [merchants, setMerchants] = useState<MerchantsBundle | null>(null)
  const [items, setItems] = useState<ItemsBundle | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')

  useEffect(() => {
    let cancelled = false
    setLoadError(null)
    // Items feed the currency glyph/name; merchant names are app-side i18n.
    Promise.all([loadMerchants(), loadItems(lng)])
      .then(([m, it]) => {
        if (!cancelled) {
          setMerchants(m)
          setItems(it)
        }
      })
      .catch((err) => {
        console.error(err)
        if (!cancelled) setLoadError(t('loadError'))
      })
    return () => {
      cancelled = true
    }
  }, [lng, t])

  const merchantName = (nameKey: string, id: string) => t(`merchant.name.${nameKey}`, id)

  const list = useMemo(() => {
    if (!merchants) return []
    const q = query.trim().toLowerCase()
    return merchants.merchants
      .filter(
        (m) =>
          (category === 'all' || m.nameKey === category) &&
          (!q ||
            merchantName(m.nameKey, m.id).toLowerCase().includes(q) ||
            m.id.toLowerCase().includes(q)),
      )
    // Emit order from the tools is already grouped by vendor type.
  }, [merchants, query, category]) // eslint-disable-line react-hooks/exhaustive-deps
  const categories = useMemo(
    () => [...new Set((merchants?.merchants ?? []).map((merchant) => merchant.nameKey))],
    [merchants],
  )
  const mobilePaging = useMobilePagination(list, { pageSize: 18, resetKey: `${query}:${category}` })

  return (
    <ContentPage active="/merchants" title={t('merchant.title')} heading>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('merchant.searchPlaceholder')}
          className="max-w-sm"
        />
        {merchants ? (
          <span className="text-sm text-muted-foreground" data-pagination-anchor data-testid="merchant-count">
            {t('merchant.count', { count: list.length })}
          </span>
        ) : null}
      </div>
      {merchants ? (
        <FilterRow label={t('filters.category')} testId="merchant-category-filter">
          {['all', ...categories].map((key) => (
            <FilterChip
              key={key}
              active={category === key}
              onClick={() => setCategory(key)}
              testId={`merchant-category-${key}`}
            >
              {key === 'all' ? t('raids.all') : merchantName(key, key)}
            </FilterChip>
          ))}
        </FilterRow>
      ) : null}

      {loadError ? (
        <div className="mt-8 text-center text-destructive">{loadError}</div>
      ) : !merchants || !items ? (
        <CatalogPageLoading />
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {mobilePaging.visibleItems.map((m) => {
            const curIcon = items.byId.get(m.currency)?.icon
            return (
              <Link
                key={m.id}
                to="/merchants/$id"
                params={{ id: m.id }}
                data-testid="merchant-card"
                className="flex min-w-0 items-center gap-3 rounded-md border border-border bg-card p-3 shadow-sm transition hover:border-primary/60 hover:bg-accent"
              >
                {m.icon ? (
                  <img
                    src={palIconUrl(m.icon)}
                    alt=""
                    width={56}
                    height={56}
                    loading="lazy"
                    className="size-14 shrink-0 rounded-md bg-secondary object-contain"
                  />
                ) : null}
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="truncate text-sm font-semibold">{merchantName(m.nameKey, m.id)}</span>
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span className="tabular-nums">{t('item.count', { count: m.products.length })}</span>
                    <span className="inline-flex items-center gap-1">
                      {curIcon ? <ItemGlyph icon={curIcon} size={16} /> : null}
                      {items.text[m.currency]?.name ?? m.currency}
                    </span>
                </span>
                  {m.locations?.length ? (
                    <span className="inline-flex items-center gap-1 text-xs text-primary">
                      <MapPin className="size-3.5" />
                      {(() => {
                        const first = m.locations[0]
                        const coords = toGameCoords(first.map, first.x, first.y)
                        return `(${Math.round(coords.x)}, ${Math.round(coords.y)})${m.locations.length > 1 ? ` +${m.locations.length - 1}` : ''}`
                      })()}
                    </span>
                  ) : null}
                  </span>
              </Link>
            )
          })}
        </div>
      )}
      <MobilePagination
        page={mobilePaging.page}
        pageCount={mobilePaging.pageCount}
        onPageChange={mobilePaging.goToPage}
      />
    </ContentPage>
  )
}
