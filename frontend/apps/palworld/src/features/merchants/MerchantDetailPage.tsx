import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from '@tanstack/react-router'
import { ContentPage } from '../../components/ContentPage'
import { loadItems, type ItemsBundle } from '../../lib/catalog'
import { loadMerchants, type MerchantsBundle } from '../../lib/merchants'
import {
  CatalogDataProvider,
  CatalogNotFound,
  CatalogPageLoading,
  CatalogSection,
  InfoRows,
  ItemGlyph,
  ItemLink,
  StatRow,
} from '../catalog/components'

export default function MerchantDetailPage() {
  const { id } = useParams({ from: '/merchants/$id' })
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'

  const [merchants, setMerchants] = useState<MerchantsBundle | null>(null)
  const [items, setItems] = useState<ItemsBundle | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoadError(null)
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

  const merchant = merchants?.byId.get(id) ?? null
  // Sort the inventory by the game's item order (stable across languages).
  const products = useMemo(() => {
    if (!merchant || !items) return []
    return [...merchant.products].sort(
      (a, b) =>
        (items.byId.get(a.item)?.sortId ?? 0) - (items.byId.get(b.item)?.sortId ?? 0) ||
        a.item.localeCompare(b.item),
    )
  }, [merchant, items])

  let body: React.ReactNode
  if (loadError) {
    body = <div className="text-center text-destructive">{loadError}</div>
  } else if (!merchants || !items) {
    body = <CatalogPageLoading />
  } else if (!merchant) {
    body = (
      <CatalogNotFound
        message={t('merchant.notFound', { id })}
        to="/merchants"
        backLabel={t('merchant.backToList')}
      />
    )
  } else {
    const name = t(`merchant.name.${merchant.nameKey}`, merchant.id)
    const curIcon = items.byId.get(merchant.currency)?.icon
    const curName = items.text[merchant.currency]?.name ?? merchant.currency
    body = (
      <div className="space-y-6">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold">{name}</h1>
          <div className="mt-0.5 font-mono text-xs text-muted-foreground">{merchant.id}</div>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-6 md:order-1">
            <CatalogSection title={t('merchant.forSale')} testId="merchant-products">
              <div className="flex flex-col gap-1.5">
                {products.map((p) => (
                  <div
                    key={p.item}
                    className="flex items-center justify-between gap-3 rounded-md border border-border bg-secondary/40 px-2 py-1"
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <ItemLink
                        id={p.item}
                        name={items.text[p.item]?.name ?? p.item}
                        icon={items.byId.get(p.item)?.icon}
                      />
                      {p.onceOnly ? (
                        <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                          {t('merchant.onceOnly')}
                        </span>
                      ) : p.stock ? (
                        <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground">
                          {t('merchant.stock', { count: p.stock })}
                        </span>
                      ) : null}
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground">
                      {p.num && p.num > 1 ? (
                        <span className="tabular-nums">×{p.num}</span>
                      ) : null}
                      <span className="inline-flex items-center gap-1 text-foreground" title={curName}>
                        {curIcon ? <ItemGlyph icon={curIcon} size={16} /> : null}
                        <span className="tabular-nums">{p.price}</span>
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </CatalogSection>
          </div>

          <div className="space-y-6 md:order-2">
            <CatalogSection title={t('item.section.properties')}>
              <InfoRows>
                <StatRow
                  label={t('merchant.currency')}
                  value={
                    <span className="inline-flex items-center gap-1">
                      {curIcon ? <ItemGlyph icon={curIcon} size={16} /> : null}
                      {curName}
                    </span>
                  }
                />
                <StatRow label={t('merchant.forSale')} value={products.length} />
                {merchant.rollPct ? (
                  <StatRow
                    label={t('merchant.rollPct', { defaultValue: 'Stock roll chance' })}
                    value={`${merchant.rollPct}%`}
                  />
                ) : null}
              </InfoRows>
            </CatalogSection>
          </div>
        </div>
      </div>
    )
  }

  return (
    <ContentPage active="/merchants" title={t('merchant.title')}>
      <CatalogDataProvider items={items ?? undefined}>{body}</CatalogDataProvider>
    </ContentPage>
  )
}
