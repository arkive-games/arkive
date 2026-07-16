import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { Input } from '@gamemap/ui'
import { ContentPage } from '../../components/ContentPage'
import { loadItems, type ItemsBundle } from '../../lib/catalog'
import { loadMerchants, type MerchantsBundle } from '../../lib/merchants'
import { CatalogPageLoading, ItemGlyph } from '../catalog/components'

export default function MerchantListPage() {
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'

  const [merchants, setMerchants] = useState<MerchantsBundle | null>(null)
  const [items, setItems] = useState<ItemsBundle | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

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
          !q ||
          merchantName(m.nameKey, m.id).toLowerCase().includes(q) ||
          m.id.toLowerCase().includes(q),
      )
    // Emit order from the tools is already grouped by vendor type.
  }, [merchants, query]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <ContentPage active="/merchants" title={t('merchant.title')} heading>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('merchant.searchPlaceholder')}
          className="max-w-sm"
        />
        {merchants ? (
          <span className="text-sm text-muted-foreground" data-testid="merchant-count">
            {t('merchant.count', { count: list.length })}
          </span>
        ) : null}
      </div>

      {loadError ? (
        <div className="mt-8 text-center text-destructive">{loadError}</div>
      ) : !merchants || !items ? (
        <CatalogPageLoading />
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((m) => {
            const curIcon = items.byId.get(m.currency)?.icon
            return (
              <Link
                key={m.id}
                to="/merchants/$id"
                params={{ id: m.id }}
                data-testid="merchant-card"
                className="flex flex-col gap-1 rounded-md border border-border bg-card p-3 shadow-sm transition hover:border-primary/60 hover:bg-accent"
              >
                <span className="truncate text-sm font-semibold">{merchantName(m.nameKey, m.id)}</span>
                <span className="truncate font-mono text-xs text-muted-foreground">{m.id}</span>
                <span className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="tabular-nums">{t('item.count', { count: m.products.length })}</span>
                  <span className="inline-flex items-center gap-1">
                    {curIcon ? <ItemGlyph icon={curIcon} size={16} /> : null}
                    {items.text[m.currency]?.name ?? m.currency}
                  </span>
                </span>
              </Link>
            )
          })}
        </div>
      )}
    </ContentPage>
  )
}
