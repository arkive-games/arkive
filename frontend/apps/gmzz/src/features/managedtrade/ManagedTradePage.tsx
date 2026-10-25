import { useMemo, useState, type ReactNode } from 'react'
import { Link, useSearch } from '@tanstack/react-router'
import { IconInfoCircle } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'
import { cn, FilterChip, FilterGroup, Input, PageSkeleton, SearchInput, useDocumentTitle } from '@gamemap/ui'

import { ContentPage } from '@/components/ContentPage'
import CatalogPagination from '@/features/traintrade/CatalogPagination'
import { useRemoteData } from '@/lib/useRemoteData'
import { TYPE } from '@/lib/typography'
import {
  adjacency,
  breakEvenSellPrice,
  caravanStats,
  effectiveTax,
  goodsIconUrl,
  loadManagedTrade,
  MANAGED_TRADE_TABS,
  partsUpgradeCost,
  priceLevel,
  shortestPath,
  taxedBuyPrice,
  taxedSellPrice,
  unitMargin,
  type Commission,
  type ManagedTradeData,
  type ManagedTradeTab,
  type PriceLevel,
  type PriceRange,
  type TradeGoods,
  type TradeSite,
} from './data'

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--arkive-nav-accent)]'
const SELECT_CLASS = `h-9 w-full min-w-0 rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none ${FOCUS}`
const SECTION_TITLE = `mb-3 ${TYPE.sectionTitle}`

const RARITY_FRAME: Record<number, string> = {
  1: 'border-border bg-muted/35',
  2: 'border-emerald-500/70 bg-emerald-50 dark:border-emerald-600 dark:bg-emerald-950/30',
  3: 'border-sky-500/70 bg-sky-50 dark:border-sky-600 dark:bg-sky-950/30',
  4: 'border-violet-500/70 bg-violet-50 dark:border-violet-600 dark:bg-violet-950/30',
}

const LEVEL_CLASS: Record<PriceLevel, string> = {
  low: 'text-emerald-700 dark:text-emerald-300',
  belowAvg: 'text-teal-700 dark:text-teal-300',
  medium: 'text-muted-foreground',
  aboveAvg: 'text-amber-700 dark:text-amber-300',
  high: 'text-rose-700 dark:text-rose-300',
}

const fmt = (value: number) => value.toLocaleString()

type T = (key: string, options?: Record<string, unknown>) => string

export default function ManagedTradePage() {
  const { t } = useTranslation()
  const tab = useSearch({ from: '/managedtrade' }).tab ?? 'overview'
  const { data, error } = useRemoteData(loadManagedTrade)

  useDocumentTitle(`${t('managedtrade.title')} - ${t('utopianTheater.siteTitle')}`)

  const title = t('managedtrade.title')
  if (error || !data) {
    return (
      <ContentPage active="/managedtrade" title={title} heading wide>
        {error ? <p className="text-sm text-muted-foreground">{t('managedtrade.loadError')}</p> : <PageSkeleton label={t('common.loading')} />}
      </ContentPage>
    )
  }

  return (
    <ContentPage
      active="/managedtrade"
      title={title}
      heading
      wide
      resultsKey={tab}
      toolbarLead={
        <header className="mb-3 space-y-3 border-b border-border pb-3">
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            {t('managedtrade.description', { goods: data.goods.length, sites: data.sites.length, routes: data.routes.length })}
          </p>
          <Tabs current={tab} t={t} />
        </header>
      }
    >
      <div data-testid="managed-trade-page">
        {tab === 'overview' && <Overview data={data} t={t} />}
        {tab === 'goods' && <GoodsSection data={data} t={t} />}
        {tab === 'stations' && <StationsSection data={data} t={t} />}
        {tab === 'caravan' && <CaravanSection data={data} t={t} />}
        {tab === 'calculator' && <Calculator data={data} t={t} />}
        {tab === 'commissions' && <CommissionsSection data={data} t={t} />}
        <p className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
          <IconInfoCircle className="size-4 shrink-0" stroke={1.8} aria-hidden />
          {t('managedtrade.source')}
        </p>
      </div>
    </ContentPage>
  )
}

function Tabs({ current, t }: { current: ManagedTradeTab; t: T }) {
  return (
    <nav aria-label={t('managedtrade.tabs.label')} className="flex flex-wrap gap-1">
      {MANAGED_TRADE_TABS.map((tab) => (
        <Link
          key={tab}
          to="/managedtrade"
          search={tab === 'overview' ? {} : { tab }}
          aria-current={tab === current ? 'page' : undefined}
          data-testid={`managed-trade-tab-${tab}`}
          className={cn(
            'rounded-md border px-3 py-1.5 text-sm font-medium transition-colors',
            FOCUS,
            tab === current
              ? 'border-transparent bg-primary text-primary-foreground'
              : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground',
          )}
        >
          {t(`managedtrade.tabs.${tab}`)}
        </Link>
      ))}
    </nav>
  )
}

function siteName(data: ManagedTradeData, id: number) {
  return data.sites.find((site) => site.id === id)?.name ?? String(id)
}

function Overview({ data, t }: { data: ManagedTradeData; t: T }) {
  const c = data.constants
  const items = [
    t('managedtrade.rules.specialty'),
    t('managedtrade.rules.tax'),
    t('managedtrade.rules.refresh', { minutes: c.priceRefreshMinutes }),
    t('managedtrade.rules.levels'),
    // `IsInManagedTradeNight` is `start <= hour < end`, so start >= end is no
    // rest at all — which is what build 2228458 ships (8 to 8).
    ...(c.nightStart < c.nightEnd ? [t('managedtrade.rules.night', { start: c.nightStart, end: c.nightEnd })] : []),
    t('managedtrade.rules.start', { money: fmt(c.initialMoney), sites: c.defaultSitePool.map((id) => siteName(data, id)).join(' / ') }),
    t('managedtrade.rules.dump', { percent: Math.round(c.lowPriceSellMultiplier * 100) }),
    t('managedtrade.rules.commissions', { max: c.maxActiveCommissions, double: c.doubleCommissionCount }),
  ]
  return (
    <section className="max-w-3xl space-y-4">
      <h2 className={SECTION_TITLE}>{t('managedtrade.rules.heading')}</h2>
      <ol className="list-decimal space-y-2 pl-5 text-sm leading-6 text-foreground/90">
        {items.map((item) => <li key={item}>{item}</li>)}
      </ol>
      <div className="rounded-md border border-border bg-muted/30 p-3">
        <p className={TYPE.label}>{t('managedtrade.rules.taxFormula')}</p>
        <code className="mt-1 block text-xs leading-6 text-foreground">TradeWar_BuyPrice: {data.formulas.buy}</code>
        <code className="block text-xs leading-6 text-foreground">TradeWar_SellPrice: {data.formulas.sell}</code>
      </div>
      <p className="text-sm leading-6 text-muted-foreground">{t('managedtrade.rules.liveNote')}</p>
    </section>
  )
}

function GoodsIcon({ goods, size = 'size-12' }: { goods: TradeGoods; size?: string }) {
  return (
    <span className={cn('flex shrink-0 items-center justify-center rounded-md border p-1', size, RARITY_FRAME[goods.rarity] ?? RARITY_FRAME[1])}>
      <img src={goodsIconUrl(goods)} alt="" className="size-full object-contain" loading="lazy" />
    </span>
  )
}

function Range({ range }: { range: PriceRange }) {
  return (
    <span className="tabular-nums">
      <span className="text-muted-foreground">{fmt(range.min)}</span>
      {' / '}
      <strong className="font-semibold text-foreground">{fmt(range.mid)}</strong>
      {' / '}
      <span className="text-muted-foreground">{fmt(range.max)}</span>
    </span>
  )
}

const GOODS_SORTS = ['order', 'marginPerLoad', 'margin'] as const
type GoodsSort = (typeof GOODS_SORTS)[number]

function GoodsSection({ data, t }: { data: ManagedTradeData; t: T }) {
  const [sort, setSort] = useState<GoodsSort>('marginPerLoad')
  const rows = useMemo(() => {
    const list = [...data.goods]
    if (sort === 'margin') list.sort((a, b) => unitMargin(b) - unitMargin(a))
    if (sort === 'marginPerLoad') list.sort((a, b) => unitMargin(b) / b.weight - unitMargin(a) / a.weight)
    return list
  }, [data.goods, sort])

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className={SECTION_TITLE}>{t('managedtrade.goods.heading')}</h2>
          <p className={TYPE.body}>{t('managedtrade.goods.marginHint')}</p>
        </div>
        <FilterGroup label={t('managedtrade.goods.sort')}>
          {GOODS_SORTS.map((option) => (
            <FilterChip key={option} variant="accent" active={sort === option} onClick={() => setSort(option)} testId={`managed-trade-sort-${option}`}>
              {t(`managedtrade.goods.sort${option[0].toUpperCase()}${option.slice(1)}`)}
            </FilterChip>
          ))}
        </FilterGroup>
      </div>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[46rem] text-sm" data-testid="managed-trade-goods">
          <thead className="bg-muted/40 text-left">
            <tr className={TYPE.label}>
              <th className="px-3 py-2">{t('managedtrade.goods.name')}</th>
              <th className="px-3 py-2 text-right">{t('managedtrade.goods.weight')}</th>
              <th className="px-3 py-2">{t('managedtrade.goods.youBuy')}</th>
              <th className="px-3 py-2">{t('managedtrade.goods.youSell')}</th>
              <th className="px-3 py-2 text-right">{t('managedtrade.goods.margin')}</th>
              <th className="px-3 py-2 text-right">{t('managedtrade.goods.marginPerLoad')}</th>
              <th className="px-3 py-2">{t('managedtrade.goods.producers')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((goods) => {
              const margin = unitMargin(goods)
              return (
                <tr key={goods.id} className="align-middle">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <GoodsIcon goods={goods} size="size-10" />
                      <div className="min-w-0">
                        <div className="whitespace-nowrap font-semibold text-foreground">{goods.name}</div>
                        <div className={TYPE.valueMuted}>{t('managedtrade.goods.rarity', { value: goods.rarity })}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{goods.weight}</td>
                  <td className="px-3 py-2 text-xs"><Range range={goods.stationSells} /></td>
                  <td className="px-3 py-2 text-xs"><Range range={goods.stationBuys} /></td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{fmt(margin)}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums text-[color:var(--arkive-nav-active)]">{(margin / goods.weight).toFixed(1)}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{goods.producers.map((id) => siteName(data, id)).join('、')}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className={cn(TYPE.body, 'mt-2')}>{t('managedtrade.goods.rangeHint')}</p>
    </section>
  )
}

function StationsSection({ data, t }: { data: ManagedTradeData; t: T }) {
  const graph = useMemo(() => adjacency(data.routes), [data.routes])
  const regions = useMemo(() => {
    const out = new Map<string, TradeSite[]>()
    for (const site of data.sites) out.set(site.region, [...(out.get(site.region) ?? []), site])
    return [...out.entries()]
  }, [data.sites])
  const goodsById = useMemo(() => new Map(data.goods.map((goods) => [goods.id, goods])), [data.goods])
  const c = data.constants

  return (
    <section className="space-y-6">
      <h2 className={SECTION_TITLE}>{t('managedtrade.stations.heading')}</h2>
      {regions.map(([region, sites]) => (
        <div key={region}>
          <h3 className="mb-2 text-base font-semibold text-[color:var(--arkive-nav-active)]">{region}</h3>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {sites.map((site) => (
              <article key={site.id} className="rounded-md border border-border bg-card p-3" data-testid={`managed-trade-site-${site.id}`}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h4 className={TYPE.name}>{site.name}</h4>
                  <span className={TYPE.valueMuted}>
                    {t('managedtrade.stations.level', { value: site.level })}
                    {c.defaultSitePool.includes(site.id) && <> · {t('managedtrade.stations.startPool')}</>}
                  </span>
                </div>
                {site.unlockOffset > 0 && (
                  <p className="mt-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
                    {t('managedtrade.stations.unlocks', { days: Math.round(site.unlockOffset / 86400) })}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  {site.specialties.map((id) => {
                    const goods = goodsById.get(id)
                    return goods ? (
                      <span key={id} className="flex items-center gap-1.5 text-xs" title={goods.name}>
                        <GoodsIcon goods={goods} size="size-8" />
                        {goods.name}
                      </span>
                    ) : null
                  })}
                </div>
                <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
                  <dt className="text-muted-foreground">{t('managedtrade.stations.stock')}</dt>
                  <dd className="tabular-nums">{t('managedtrade.stations.stockValue', { max: fmt(site.maxStock), recover: fmt(site.stockRecover), minutes: c.stockRecoverMinutes })}</dd>
                  <dt className="text-muted-foreground">{t('managedtrade.stations.purchase')}</dt>
                  <dd className="tabular-nums">{t('managedtrade.stations.purchaseValue', { max: fmt(site.maxPurchase), recover: fmt(site.purchaseRecover), minutes: c.stockRecoverMinutes })}</dd>
                  <dt className="text-muted-foreground">{t('managedtrade.stations.tax')}</dt>
                  <dd className="tabular-nums">{t('managedtrade.stations.taxValue', { base: site.baseTax, min: site.taxMin, max: site.taxMax, special: site.specialTaxMax })}</dd>
                  <dt className="text-muted-foreground">{t('managedtrade.stations.neighbours')}</dt>
                  <dd>{(graph.get(site.id) ?? []).map((route) => siteName(data, route.a === site.id ? route.b : route.a)).join('、')}</dd>
                </dl>
              </article>
            ))}
          </div>
        </div>
      ))}
    </section>
  )
}

const STAT_KEYS = ['speed', 'maxLoad', 'maxEnergy', 'energyRecover', 'taxReduction', 'rumorCount', 'teleportCount'] as const

function CaravanSection({ data, t }: { data: ManagedTradeData; t: T }) {
  return (
    <section className="space-y-6">
      <div>
        <h2 className={SECTION_TITLE}>{t('managedtrade.caravan.heading')}</h2>
        <p className={cn(TYPE.body, 'mb-3 max-w-3xl')}>{t('managedtrade.caravan.note')}</p>
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[44rem] text-sm" data-testid="managed-trade-caravans">
            <thead className="bg-muted/40 text-left">
              <tr className={TYPE.label}>
                <th className="px-3 py-2">{t('managedtrade.caravan.level')}</th>
                <th className="px-3 py-2 text-right">{t('managedtrade.caravan.unlockCost')}</th>
                {STAT_KEYS.map((key) => <th key={key} className="px-3 py-2 text-right">{t(`managedtrade.caravan.${key}`)}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.caravans.flatMap((caravan) => {
                const parts = data.parts[caravan.level - 1] ?? []
                const base = caravanStats(data, caravan.level, parts.map(() => 1))
                const full = caravanStats(data, caravan.level, parts.map((part) => part.levels.length))
                return [
                  <tr key={`${caravan.level}-base`}>
                    <td className="px-3 py-2 font-semibold">{caravan.name} <span className={TYPE.valueMuted}>· {t('managedtrade.caravan.base')}</span></td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(caravan.unlockCost)}</td>
                    {STAT_KEYS.map((key) => <td key={key} className="px-3 py-2 text-right tabular-nums">{fmt(base[key])}</td>)}
                  </tr>,
                  <tr key={`${caravan.level}-full`} className="bg-muted/20">
                    <td className="px-3 py-2 text-muted-foreground">{t('managedtrade.caravan.fullParts')}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{t('managedtrade.caravan.partsCost', { cost: fmt(partsUpgradeCost(parts)) })}</td>
                    {STAT_KEYS.map((key) => <td key={key} className="px-3 py-2 text-right font-semibold tabular-nums">{fmt(full[key])}</td>)}
                  </tr>,
                ]
              })}
            </tbody>
          </table>
        </div>
      </div>
      {data.caravans.map((caravan) => (
        <PartsTable key={caravan.level} data={data} level={caravan.level} t={t} />
      ))}
    </section>
  )
}

const BONUS_KEYS = [
  ['speedBonus', 'speed'],
  ['loadBonus', 'maxLoad'],
  ['maxEnergyBonus', 'maxEnergy'],
  ['energyRecBonus', 'energyRecover'],
  ['taxReduceBonus', 'taxReduction'],
] as const

function PartsTable({ data, level, t }: { data: ManagedTradeData; level: number; t: T }) {
  const parts = data.parts[level - 1] ?? []
  const depth = Math.max(0, ...parts.map((part) => part.levels.length))
  return (
    <div>
      <h3 className="mb-2 text-base font-semibold text-[color:var(--arkive-nav-active)]">
        {t('managedtrade.caravan.partsHeading', { name: data.caravans[level - 1]?.name })}
      </h3>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[36rem] text-xs">
          <thead className="bg-muted/40 text-left">
            <tr className={TYPE.label}>
              <th className="px-3 py-2">{t('managedtrade.caravan.part')}</th>
              {Array.from({ length: depth - 1 }, (_, index) => (
                <th key={index} className="px-3 py-2">Lv {index + 2}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {parts.map((part) => (
              <tr key={part.type}>
                <td className="px-3 py-2 font-semibold">{part.name}</td>
                {Array.from({ length: depth - 1 }, (_, index) => {
                  const row = part.levels[index + 1]
                  if (!row) return <td key={index} className="px-3 py-2 text-muted-foreground">—</td>
                  const bonuses = BONUS_KEYS.filter(([field]) => row[field] > 0).map(([field, label]) => `${t(`managedtrade.caravan.${label}`)} +${row[field]}`)
                  return (
                    <td key={index} className="px-3 py-2 align-top">
                      <div className="font-semibold tabular-nums">{fmt(row.cost)}</div>
                      <div className="text-muted-foreground">{bonuses.join(' · ')}</div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className={TYPE.label}>{label}</span>
      {children}
    </label>
  )
}

const intValue = (raw: string) => {
  const value = Math.floor(Number(raw))
  return Number.isFinite(value) && value >= 0 ? value : 0
}

function Calculator({ data, t }: { data: ManagedTradeData; t: T }) {
  const [goodsId, setGoodsId] = useState(data.goods[0].id)
  const goods = data.goods.find((entry) => entry.id === goodsId) ?? data.goods[0]
  const [from, setFrom] = useState(goods.producers[0] ?? data.sites[0].id)
  const [to, setTo] = useState(() => data.sites.find((site) => !goods.producers.includes(site.id))?.id ?? data.sites[0].id)
  const [buyPrice, setBuyPrice] = useState(goods.stationSells.mid)
  const [sellPrice, setSellPrice] = useState(goods.stationBuys.mid)
  const [buyTax, setBuyTax] = useState(data.sites[0].baseTax)
  const [sellTax, setSellTax] = useState(data.sites[0].baseTax)
  const [level, setLevel] = useState(1)
  const [partLevels, setPartLevels] = useState<number[]>(() => (data.parts[0] ?? []).map(() => 1))
  const [quantity, setQuantity] = useState<number | null>(null)

  const parts = data.parts[level - 1] ?? []
  const stats = caravanStats(data, level, partLevels)
  const fill = Math.floor(stats.maxLoad / goods.weight)
  const count = quantity ?? fill

  const chooseGoods = (id: number) => {
    const next = data.goods.find((entry) => entry.id === id) ?? data.goods[0]
    setGoodsId(next.id)
    setBuyPrice(next.stationSells.mid)
    setSellPrice(next.stationBuys.mid)
    if (!next.producers.includes(from)) setFrom(next.producers[0] ?? from)
    if (next.producers.includes(to)) setTo(data.sites.find((site) => !next.producers.includes(site.id))?.id ?? to)
    setQuantity(null)
  }
  const chooseLevel = (next: number) => {
    setLevel(next)
    setPartLevels((data.parts[next - 1] ?? []).map(() => 1))
    setQuantity(null)
  }

  const unitCost = taxedBuyPrice(buyPrice, buyTax, stats.taxReduction)
  const unitGain = taxedSellPrice(sellPrice, sellTax, stats.taxReduction)
  const unitProfit = unitGain - unitCost
  const path = shortestPath(data.routes, from, to)
  const total = unitProfit * count
  const breakEven = breakEvenSellPrice(unitCost, sellTax, stats.taxReduction)
  const buyLevel = priceLevel(buyPrice, goods.stationSells)
  const sellLevel = priceLevel(sellPrice, goods.stationBuys)

  return (
    <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]" data-testid="managed-trade-calculator">
      <div className="space-y-4">
        <div>
          <h2 className={SECTION_TITLE}>{t('managedtrade.calc.heading')}</h2>
          <p className={TYPE.body}>{t('managedtrade.calc.intro')}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={t('managedtrade.calc.goods')}>
            <select className={SELECT_CLASS} value={goodsId} onChange={(event) => chooseGoods(Number(event.target.value))} data-testid="managed-trade-calc-goods">
              {data.goods.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
            </select>
          </Field>
          <Field label={t('managedtrade.calc.from')}>
            <select className={SELECT_CLASS} value={from} onChange={(event) => setFrom(Number(event.target.value))}>
              {data.sites.map((site) => <option key={site.id} value={site.id}>{site.name}{goods.producers.includes(site.id) ? ' ★' : ''}</option>)}
            </select>
          </Field>
          <Field label={t('managedtrade.calc.to')}>
            <select className={SELECT_CLASS} value={to} onChange={(event) => setTo(Number(event.target.value))}>
              {data.sites.map((site) => <option key={site.id} value={site.id}>{site.name}{goods.producers.includes(site.id) ? ' ★' : ''}</option>)}
            </select>
          </Field>
        </div>
        {!goods.producers.includes(from) && <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">{t('managedtrade.calc.notProducer')}</p>}
        {goods.producers.includes(to) && <p className="text-xs font-semibold text-rose-700 dark:text-rose-300">{t('managedtrade.calc.producerWarning')}</p>}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('managedtrade.calc.buyPrice')}>
            <Input type="number" min={0} value={buyPrice} onChange={(event) => setBuyPrice(intValue(event.target.value))} className="h-9 text-sm" data-testid="managed-trade-calc-buy" />
            <PriceHint level={buyLevel} range={goods.stationSells} t={t} />
          </Field>
          <Field label={t('managedtrade.calc.sellPrice')}>
            <Input type="number" min={0} value={sellPrice} onChange={(event) => setSellPrice(intValue(event.target.value))} className="h-9 text-sm" data-testid="managed-trade-calc-sell" />
            <PriceHint level={sellLevel} range={goods.stationBuys} t={t} selling />
          </Field>
          <Field label={t('managedtrade.calc.buyTax')}>
            <Input type="number" min={0} max={100} value={buyTax} onChange={(event) => setBuyTax(Math.min(100, intValue(event.target.value)))} className="h-9 text-sm" />
          </Field>
          <Field label={t('managedtrade.calc.sellTax')}>
            <Input type="number" min={0} max={100} value={sellTax} onChange={(event) => setSellTax(Math.min(100, intValue(event.target.value)))} className="h-9 text-sm" />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-5">
          <Field label={t('managedtrade.calc.caravanLevel')}>
            <select className={SELECT_CLASS} value={level} onChange={(event) => chooseLevel(Number(event.target.value))}>
              {data.caravans.map((caravan) => <option key={caravan.level} value={caravan.level}>{caravan.name}</option>)}
            </select>
          </Field>
          {parts.map((part, index) => (
            <Field key={part.type} label={t('managedtrade.calc.partLevel', { name: part.name })}>
              <select
                className={SELECT_CLASS}
                value={partLevels[index] ?? 1}
                onChange={(event) => {
                  const next = [...partLevels]
                  next[index] = Number(event.target.value)
                  setPartLevels(next)
                  setQuantity(null)
                }}
              >
                {part.levels.map((row) => <option key={row.level} value={row.level}>Lv {row.level}</option>)}
              </select>
            </Field>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Field label={t('managedtrade.calc.quantity')}>
            <Input type="number" min={0} value={count} onChange={(event) => setQuantity(intValue(event.target.value))} className="h-9 w-32 text-sm" />
          </Field>
          <button type="button" onClick={() => setQuantity(null)} className={cn('h-9 rounded-md border border-border px-3 text-sm text-muted-foreground hover:bg-accent hover:text-foreground', FOCUS)}>
            {t('managedtrade.calc.quantityMax', { count: fill })}
          </button>
          <span className={TYPE.valueMuted}>
            {t('managedtrade.calc.load', { used: fmt(count * goods.weight), max: fmt(stats.maxLoad) })} · {t('managedtrade.calc.reduction', { value: stats.taxReduction })}
          </span>
        </div>
      </div>

      <aside className="h-fit space-y-3 rounded-md border border-border bg-card p-4" data-testid="managed-trade-calc-result">
        <div className="flex items-center gap-3">
          <GoodsIcon goods={goods} />
          <div>
            <div className={TYPE.name}>{goods.name}</div>
            <div className={TYPE.valueMuted}>{siteName(data, from)} → {siteName(data, to)}</div>
          </div>
        </div>
        <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 text-sm">
          <dt className="text-muted-foreground">{t('managedtrade.calc.unitCost')}</dt>
          <dd className="text-right tabular-nums">{fmt(unitCost)} <span className={TYPE.valueMuted}>({effectiveTax(buyTax, stats.taxReduction)}%)</span></dd>
          <dt className="text-muted-foreground">{t('managedtrade.calc.unitGain')}</dt>
          <dd className="text-right tabular-nums">{fmt(unitGain)} <span className={TYPE.valueMuted}>({effectiveTax(sellTax, stats.taxReduction)}%)</span></dd>
          <dt className="text-muted-foreground">{t('managedtrade.calc.unitProfit')}</dt>
          <dd className={cn('text-right font-semibold tabular-nums', unitProfit < 0 && 'text-rose-700 dark:text-rose-300')}>{fmt(unitProfit)}</dd>
          <dt className="text-muted-foreground">{t('managedtrade.calc.breakEven')}</dt>
          <dd className="text-right tabular-nums">{breakEven === null ? '—' : fmt(breakEven)}</dd>
          <dt className="text-muted-foreground">{t('managedtrade.calc.totalCost')}</dt>
          <dd className="text-right tabular-nums">{fmt(unitCost * count)}</dd>
        </dl>
        <div className="border-t border-border pt-3">
          <div className={TYPE.label}>{t('managedtrade.calc.total', { count })}</div>
          <div className={cn(TYPE.total, total < 0 && 'text-rose-700 dark:text-rose-300')} data-testid="managed-trade-calc-total">{fmt(total)}</div>
        </div>
        <div className="border-t border-border pt-3 text-sm">
          <div className={TYPE.label}>{t('managedtrade.calc.path')}</div>
          {path ? (
            <>
              <p className="mt-1 text-xs leading-5">{path.stations.map((id) => siteName(data, id)).join(' → ')}</p>
              <p className={TYPE.valueMuted}>{t('managedtrade.calc.pathValue', { hops: path.stations.length - 1, energy: path.energy })}</p>
              {path.energy > 0 && (
                <p className="mt-1 text-xs">
                  {t('managedtrade.calc.perEnergy')}: <strong className="tabular-nums">{fmt(Math.round(total / path.energy))}</strong>
                </p>
              )}
            </>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">{t('managedtrade.calc.unreachable')}</p>
          )}
        </div>
      </aside>
    </section>
  )
}

/** Buying, a low price is good (green); selling, a high one is, so the colours swap. */
const SELL_LEVEL: Record<PriceLevel, PriceLevel> = { low: 'high', belowAvg: 'aboveAvg', medium: 'medium', aboveAvg: 'belowAvg', high: 'low' }

function PriceHint({ level, range, t, selling = false }: { level: PriceLevel; range: PriceRange; t: T; selling?: boolean }) {
  return (
    <span className={TYPE.valueMuted}>
      {t('managedtrade.calc.levelHint')}: <span className={cn('font-semibold', LEVEL_CLASS[selling ? SELL_LEVEL[level] : level])}>{t(`managedtrade.level.${level}`)}</span> · {fmt(range.min)}–{fmt(range.max)}
    </span>
  )
}

const COMMISSION_PAGE = 30
const TYPE_FILTERS = ['all', '1', '2'] as const

function CommissionsSection({ data, t }: { data: ManagedTradeData; t: T }) {
  const [type, setType] = useState<(typeof TYPE_FILTERS)[number]>('all')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const goodsById = useMemo(() => new Map(data.goods.map((goods) => [goods.id, goods])), [data.goods])
  // Reward per unit of caravan load: a commission's goods ride in the same hold
  // as trade goods, so this is what it is weighed against.
  const perLoad = useMemo(
    () => (row: Commission) => row.reward / (row.count * (goodsById.get(row.goodsId)?.weight ?? 1)),
    [goodsById],
  )

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    return data.commissions
      .filter((row) => type === 'all' || String(row.type) === type)
      .filter((row) => !needle || `${row.name} ${goodsById.get(row.goodsId)?.name ?? ''}`.toLocaleLowerCase().includes(needle))
      .sort((a, b) => perLoad(b) - perLoad(a))
  }, [data.commissions, goodsById, perLoad, query, type])
  const pageCount = Math.max(1, Math.ceil(filtered.length / COMMISSION_PAGE))
  const current = Math.min(page, pageCount)
  const rows = filtered.slice((current - 1) * COMMISSION_PAGE, current * COMMISSION_PAGE)

  return (
    <section>
      <h2 className={SECTION_TITLE}>{t('managedtrade.commissions.heading')}</h2>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <FilterGroup label={t('managedtrade.commissions.type')}>
          {TYPE_FILTERS.map((option) => (
            <FilterChip key={option} variant="accent" active={type === option} onClick={() => { setType(option); setPage(1) }}>
              {option === 'all' ? t('managedtrade.commissions.all') : t(`managedtrade.commissions.type${option}`)}
            </FilterChip>
          ))}
        </FilterGroup>
        <SearchInput
          value={query}
          onChange={(value) => { setQuery(value); setPage(1) }}
          placeholder={t('managedtrade.commissions.searchPlaceholder')}
          clearOnEscape
          type="search"
          inputClassName="h-9 w-64 text-sm"
          testId="managed-trade-commission-search"
        />
      </div>
      <p className={cn(TYPE.valueMuted, 'mb-2')}>{t('managedtrade.commissions.count', { count: filtered.length })}</p>
      {filtered.length === 0 ? (
        <p className="border-y border-border py-10 text-center text-sm text-muted-foreground">{t('managedtrade.commissions.empty')}</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[44rem] text-sm" data-testid="managed-trade-commissions">
            <thead className="bg-muted/40 text-left">
              <tr className={TYPE.label}>
                <th className="px-3 py-2">{t('managedtrade.commissions.name')}</th>
                <th className="px-3 py-2">{t('managedtrade.commissions.goods')}</th>
                <th className="px-3 py-2 text-right">{t('managedtrade.commissions.reward')}</th>
                <th className="px-3 py-2 text-right">{t('managedtrade.commissions.perLoad')}</th>
                <th className="px-3 py-2">{t('managedtrade.commissions.target')}</th>
                <th className="px-3 py-2 text-right">{t('managedtrade.commissions.unlock')}</th>
                <th className="px-3 py-2 text-right">{t('managedtrade.commissions.expire')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => {
                const goods = goodsById.get(row.goodsId)
                return (
                  <tr key={row.id}>
                    <td className="px-3 py-2">
                      <div className="font-semibold">{row.name}</div>
                      <div className={TYPE.valueMuted}>{t(`managedtrade.commissions.type${row.type}`)} · {t('managedtrade.commissions.quality')} {row.quality}</div>
                    </td>
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-2">
                        {goods && <GoodsIcon goods={goods} size="size-8" />}
                        <span className="whitespace-nowrap">{goods?.name ?? row.goodsId} × {row.count}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(row.reward)}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{fmt(Math.round(perLoad(row)))}</td>
                    <td className="px-3 py-2 text-xs">
                      {row.type === 1 ? t('managedtrade.commissions.postingStation') : row.targets.map((id) => siteName(data, id)).join('、')}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.unlockDay || t('managedtrade.commissions.anyDay')}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.expireDay || t('managedtrade.commissions.anyDay')}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-3">
        <CatalogPagination page={current} pageCount={pageCount} onPageChange={setPage} />
      </div>
    </section>
  )
}
