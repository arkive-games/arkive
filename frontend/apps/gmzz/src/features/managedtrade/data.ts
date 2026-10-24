import { dataUrl, iconUrl } from '@/lib/urls'

/*
 * 贸易战 — the client's `ManagedTrade` mode.
 *
 * Every rule in this file is the client's own, read out of its LuaJIT bytecode
 * (`ManagedTradeSystem`, `Shared.Utils.ManagedTradeUtils`,
 * `Shared.Const.ManagedTradeConst`) and the `TradeWar_*` rows of `FormulaData`.
 * Live prices are not here: the service keeps them `SERVER_ONLY` and hands a
 * client one station's snapshot when it opens that station's market.
 *
 * Naming trap: the goods table's `Sell*`/`Buy*` columns are the STATION's side.
 * A player buys at a price graded against `SellMin..SellMax` and sells at one
 * graded against `BuyMin..BuyMax`. This module renames them once, to
 * `stationSells` (what you pay) and `stationBuys` (what you are paid), so no
 * component has to remember the inversion.
 */

export type PriceRange = { min: number; mid: number; max: number }

export type TradeGoods = {
  id: number
  name: string
  description: string
  rarity: number
  /** Load each unit takes on the caravan. */
  weight: number
  order: number
  icon: string
  /** Untaxed price range a station sells this at — what a player pays. */
  stationSells: PriceRange
  /** Untaxed price range a station buys this at — what a player is paid. */
  stationBuys: PriceRange
  /** Stations whose specialty this is: the only ones that sell it. */
  producers: number[]
}

export type TradeSite = {
  id: number
  name: string
  region: string
  level: number
  /** Goods this station sells. It cannot buy them back (error SELL_OWN_SPECIALTY). */
  specialties: number[]
  maxStock: number
  stockRecover: number
  maxPurchase: number
  purchaseRecover: number
  baseTax: number
  taxMin: number
  taxMax: number
  specialTaxMax: number
  /** Seconds after the season opens before the station unlocks; 0 = open from the start. */
  unlockOffset: number
  /** Order the station list is shown in by the game's distribution screen. */
  order: number
}

export type TradeRoute = { id: number; a: number; b: number; distance: number; energy: number }

export type CaravanLevel = {
  level: number
  name: string
  unlockCost: number
  speed: number
  maxLoad: number
  maxEnergy: number
  energyRecover: number
  taxReduction: number
  rumorCount: number
  teleportCount: number
}

export type CaravanPartLevel = {
  level: number
  cost: number
  speedBonus: number
  loadBonus: number
  maxEnergyBonus: number
  energyRecBonus: number
  taxReduceBonus: number
}

export type CaravanPart = { type: number; name: string; levels: CaravanPartLevel[] }

export type Commission = {
  id: number
  name: string
  /** 1 = 采购 (deliver to the posting station), 2 = 运输 (carry to `targets`). */
  type: 1 | 2
  quality: number
  goodsId: number
  count: number
  reward: number
  targets: number[]
  unlockDay: number
  expireDay: number
  weight: number
}

export type TradeConstants = {
  initialMoney: number
  priceRefreshMinutes: number
  stockRecoverMinutes: number
  nightStart: number
  nightEnd: number
  lowPriceSellMultiplier: number
  lowestPrice: number
  highestPrice: number
  maxActiveCommissions: number
  doubleCommissionCount: number
  defaultSitePool: number[]
  rumorDisplayMax: number
  taxAdjustCooldownHours: number
}

export type ManagedTradeData = {
  goods: TradeGoods[]
  sites: TradeSite[]
  routes: TradeRoute[]
  /** Indexed by caravan level − 1. */
  caravans: CaravanLevel[]
  /** `[caravan level − 1][part type − 1]` — each caravan level has its own part ladder. */
  parts: CaravanPart[][]
  commissions: Commission[]
  constants: TradeConstants
  formulas: { buy: string; sell: string }
}

type RawGoods = {
  Id: number
  GoodsName: string
  GoodsDesc?: string
  GoodsOrder: number
  Rarity: number
  Weight: number
  SellMin: number
  SellMid: number
  SellMax: number
  BuyMin: number
  BuyMid: number
  BuyMax: number
  ItemDisplayId: number
}

type RawSite = {
  Id: number
  SiteName: string
  MapName: string
  SiteLevel: number
  SpecialtyGoods: number[]
  MaxStock: number
  StockRecover: number
  MaxPurchase: number
  PurchaseRecover: number
  BaseTax: number
  TaxMin: number
  TaxMax: number
  SpecTaxMax: number
  DefaultLock: number
  UnlockTimeOffset: number
  DistOrder: number
}

type RawRoute = { RouteId: number; SiteA: number; SiteB: number; Distance: number; EnergyCost: number }

type RawCaravan = {
  Level: number
  Name: string
  UnlockCost: number
  Speed: number
  MaxLoad: number
  MaxEnergy: number
  EnergyRecover: number
  TaxReduction: number
  RumorCount: number
  TeleportCount: number
}

type RawPart = {
  Level: number
  PartType: number
  PartName: string
  UpgradeCost: number
  SpeedBonus: number
  LoadBonus: number
  MaxEnergyBonus: number
  EnergyRecBonus: number
  TaxReduceBonus: number
}

type RawQuest = {
  QuestId: number
  QuestName: string
  QuestType: 1 | 2
  Quality: number
  GoodsId: number
  GoodsCount: number
  BaseReward: number
  TargetStation: number[] | Record<string, never>
  UnlockDay: number
  ExpireDay: number
  Weight: number
}

type RawFormula = { Formula: string; Name: string }

const file = (name: string) => dataUrl(`managedtrade/${name}`)

async function loadJson<T>(name: string): Promise<T> {
  const response = await fetch(file(name))
  if (!response.ok) throw new Error(`Unable to load managedtrade/${name} (${response.status})`)
  return (await response.json()) as T
}

/** Strip the client's rich-text markup (`<HighLight>…</>`, `<img …/>`). */
const stripMarkup = (value: string | undefined) => (value ?? '').replace(/<[^>]+>/g, '').trim()

/** Lua's empty table serialises as `{}`, so an empty list may arrive as an object. */
const list = <T>(value: T[] | Record<string, never> | undefined): T[] => (Array.isArray(value) ? value : [])

export async function loadManagedTrade(): Promise<ManagedTradeData> {
  const [goods, sites, routes, caravans, parts, quests, constants, formulas, icons] = await Promise.all([
    loadJson<RawGoods[]>('goods.json'),
    loadJson<RawSite[]>('sites.json'),
    loadJson<RawRoute[]>('routes.json'),
    loadJson<RawCaravan[]>('caravans.json'),
    loadJson<RawPart[][][]>('caravan_parts.json'),
    loadJson<RawQuest[]>('commissions.json'),
    loadJson<Record<string, unknown>>('constants.json'),
    loadJson<Record<string, RawFormula>>('formulas.json'),
    loadJson<Record<string, string>>('icons.json'),
  ])

  const producers = new Map<number, number[]>()
  for (const site of sites) {
    for (const id of site.SpecialtyGoods) producers.set(id, [...(producers.get(id) ?? []), site.Id])
  }

  const num = (key: string) => Number(constants[key] ?? 0)
  return {
    goods: goods
      .map((row) => ({
        id: row.Id,
        name: row.GoodsName,
        description: stripMarkup(row.GoodsDesc),
        rarity: row.Rarity,
        weight: row.Weight,
        order: row.GoodsOrder,
        icon: icons[String(row.Id)] ?? String(row.ItemDisplayId),
        stationSells: { min: row.SellMin, mid: row.SellMid, max: row.SellMax },
        stationBuys: { min: row.BuyMin, mid: row.BuyMid, max: row.BuyMax },
        producers: producers.get(row.Id) ?? [],
      }))
      .sort((a, b) => a.order - b.order || a.id - b.id),
    sites: sites
      .map((row) => ({
        id: row.Id,
        name: row.SiteName,
        region: row.MapName,
        level: row.SiteLevel,
        specialties: row.SpecialtyGoods,
        maxStock: row.MaxStock,
        stockRecover: row.StockRecover,
        maxPurchase: row.MaxPurchase,
        purchaseRecover: row.PurchaseRecover,
        baseTax: row.BaseTax,
        taxMin: row.TaxMin,
        taxMax: row.TaxMax,
        specialTaxMax: row.SpecTaxMax,
        unlockOffset: row.DefaultLock ? row.UnlockTimeOffset : 0,
        order: row.DistOrder,
      }))
      .sort((a, b) => a.id - b.id),
    routes: routes.map((row) => ({ id: row.RouteId, a: row.SiteA, b: row.SiteB, distance: row.Distance, energy: row.EnergyCost })),
    caravans: caravans
      .map((row) => ({
        level: row.Level,
        name: row.Name,
        unlockCost: row.UnlockCost,
        speed: row.Speed,
        maxLoad: row.MaxLoad,
        maxEnergy: row.MaxEnergy,
        energyRecover: row.EnergyRecover,
        taxReduction: row.TaxReduction,
        rumorCount: row.RumorCount,
        teleportCount: row.TeleportCount,
      }))
      .sort((a, b) => a.level - b.level),
    parts: parts.map((byType) =>
      byType.map((levels) => ({
        type: levels[0]?.PartType ?? 0,
        name: levels[0]?.PartName ?? '',
        levels: levels.map((row) => ({
          level: row.Level,
          cost: row.UpgradeCost,
          speedBonus: row.SpeedBonus,
          loadBonus: row.LoadBonus,
          maxEnergyBonus: row.MaxEnergyBonus,
          energyRecBonus: row.EnergyRecBonus,
          taxReduceBonus: row.TaxReduceBonus,
        })),
      })),
    ),
    commissions: quests.map((row) => ({
      id: row.QuestId,
      name: row.QuestName,
      type: row.QuestType,
      quality: row.Quality,
      goodsId: row.GoodsId,
      count: row.GoodsCount,
      reward: row.BaseReward,
      targets: list(row.TargetStation),
      unlockDay: row.UnlockDay,
      expireDay: row.ExpireDay,
      weight: row.Weight,
    })),
    constants: {
      initialMoney: num('TRADEWAR_INITIAL_MONEY'),
      priceRefreshMinutes: num('PRICE_UPDATE_INTERVAL'),
      stockRecoverMinutes: num('STOCK_RECOVER_INTERVAL'),
      nightStart: num('TRADEWAR_NIGHT_START'),
      nightEnd: num('TRADEWAR_NIGHT_END'),
      lowPriceSellMultiplier: num('LOW_PRICE_SELL_MULTIPLIER'),
      lowestPrice: num('TRADEWAR_LOWEST_PRICE'),
      highestPrice: num('TRADEWAR_HIGHEST_PRICE'),
      maxActiveCommissions: num('MAX_ACTIVE_QUEST'),
      doubleCommissionCount: num('DOUBLE_QUEST_COUNT'),
      defaultSitePool: list(constants.TRADEWAR_DEFAULT_SITE_POOL as number[] | undefined),
      rumorDisplayMax: num('TRADEWAR_RUMOR_DISPLAY_MAX_NUM'),
      taxAdjustCooldownHours: num('TAX_ADJUST_CD'),
    },
    formulas: {
      buy: formulas.TradeWar_BuyPrice?.Formula ?? '',
      sell: formulas.TradeWar_SellPrice?.Formula ?? '',
    },
  }
}

export const goodsIconUrl = (goods: TradeGoods) => iconUrl(goods.icon)

/** `max(tax − reduction, 0)` — the rate both taxed prices use. Reduction never makes it negative. */
export function effectiveTax(tax: number, reduction: number): number {
  return Math.max(tax - reduction, 0)
}

/** `TradeWar_BuyPrice`: `floor(price × (100 + max(tax − reduction, 0)) / 100)` — a player's cost per unit. */
export function taxedBuyPrice(price: number, tax: number, reduction: number): number {
  return Math.floor((price * (100 + effectiveTax(tax, reduction))) / 100)
}

/** `TradeWar_SellPrice`: `floor(price × (100 − max(tax − reduction, 0)) / 100)` — what a player keeps per unit. */
export function taxedSellPrice(price: number, tax: number, reduction: number): number {
  return Math.floor((price * (100 - effectiveTax(tax, reduction))) / 100)
}

/**
 * The lowest untaxed station price at which selling at least covers `unitCost`,
 * or `null` when the tax is 100 % and no price can.
 */
export function breakEvenSellPrice(unitCost: number, tax: number, reduction: number): number | null {
  const rate = effectiveTax(tax, reduction)
  if (rate >= 100) return null
  let price = Math.max(0, Math.floor((unitCost * 100) / (100 - rate)))
  while (taxedSellPrice(price, tax, reduction) < unitCost) price += 1
  return price
}

export const PRICE_LEVELS = ['low', 'belowAvg', 'medium', 'aboveAvg', 'high'] as const
export type PriceLevel = (typeof PRICE_LEVELS)[number]

/**
 * `getPriceLevelByRange`: where `price` sits in `[min, max]`, cut at 0.2 / 0.4 /
 * 0.6 / 0.8 with each cut inclusive of its lower band. A degenerate range is
 * "medium", as in the client.
 */
export function priceLevel(price: number, range: PriceRange): PriceLevel {
  if (!(range.max > range.min)) return 'medium'
  const r = (price - range.min) / (range.max - range.min)
  if (r <= 0.2) return 'low'
  if (r <= 0.4) return 'belowAvg'
  if (r <= 0.6) return 'medium'
  if (r <= 0.8) return 'aboveAvg'
  return 'high'
}

export type CaravanStats = {
  speed: number
  maxLoad: number
  maxEnergy: number
  energyRecover: number
  taxReduction: number
  rumorCount: number
  teleportCount: number
}

/**
 * `ManagedTradeUtils.GetCaravanAttrValue`: the caravan level's base value plus
 * each part's bonus at its current level, where the part ladder is the one
 * belonging to *this* caravan level (part levels restart at 1 on upgrade).
 * Rumor and teleport counts have no part bonus.
 */
export function caravanStats(data: Pick<ManagedTradeData, 'caravans' | 'parts'>, level: number, partLevels: number[]): CaravanStats {
  const base = data.caravans[level - 1]
  const parts = data.parts[level - 1] ?? []
  const bonus = { speed: 0, load: 0, energy: 0, recover: 0, tax: 0 }
  parts.forEach((part, index) => {
    const row = part.levels.find((entry) => entry.level === (partLevels[index] ?? 1))
    if (!row) return
    bonus.speed += row.speedBonus
    bonus.load += row.loadBonus
    bonus.energy += row.maxEnergyBonus
    bonus.recover += row.energyRecBonus
    bonus.tax += row.taxReduceBonus
  })
  return {
    speed: base.speed + bonus.speed,
    maxLoad: base.maxLoad + bonus.load,
    maxEnergy: base.maxEnergy + bonus.energy,
    energyRecover: base.energyRecover + bonus.recover,
    taxReduction: base.taxReduction + bonus.tax,
    rumorCount: base.rumorCount,
    teleportCount: base.teleportCount,
  }
}

/** Trade coin to raise every part of a caravan level from 1 to its top. */
export function partsUpgradeCost(parts: CaravanPart[]): number {
  return parts.reduce((sum, part) => sum + part.levels.reduce((inner, row) => inner + row.cost, 0), 0)
}

/** Neighbours of every station; routes are undirected (a path may use one either way). */
export function adjacency(routes: TradeRoute[]): Map<number, TradeRoute[]> {
  const out = new Map<number, TradeRoute[]>()
  for (const route of routes) {
    out.set(route.a, [...(out.get(route.a) ?? []), route])
    out.set(route.b, [...(out.get(route.b) ?? []), route])
  }
  return out
}

/**
 * Cheapest path by stamina between two stations (Dijkstra; every route
 * currently costs the same, but the table allows them to differ). The client
 * charges a path the sum of its routes' `EnergyCost`
 * (`ManagedTradeUtils.GetPathDistanceAndCost`). `null` when unreachable.
 */
export function shortestPath(routes: TradeRoute[], from: number, to: number): { stations: number[]; energy: number; distance: number } | null {
  const graph = adjacency(routes)
  const best = new Map<number, { energy: number; distance: number; prev: number | null }>([[from, { energy: 0, distance: 0, prev: null }]])
  const open = new Set([from])
  const done = new Set<number>()
  while (open.size) {
    let current = -1
    for (const id of open) if (current < 0 || best.get(id)!.energy < best.get(current)!.energy) current = id
    open.delete(current)
    done.add(current)
    if (current === to) break
    const here = best.get(current)!
    for (const route of graph.get(current) ?? []) {
      const next = route.a === current ? route.b : route.a
      if (done.has(next)) continue
      const energy = here.energy + route.energy
      const known = best.get(next)
      if (!known || energy < known.energy) {
        best.set(next, { energy, distance: here.distance + route.distance, prev: current })
        open.add(next)
      }
    }
  }
  const end = best.get(to)
  if (!end) return null
  const stations: number[] = []
  for (let id: number | null = to; id !== null; id = best.get(id)!.prev) stations.unshift(id)
  return { stations, energy: end.energy, distance: end.distance }
}

/**
 * Theoretical margin of one unit, bought at a producer and sold elsewhere, at
 * the range points given — untaxed. Divided by weight it is what a unit of
 * caravan load earns, which is the number that decides what to carry.
 */
export function unitMargin(goods: TradeGoods, buyAt: keyof PriceRange = 'mid', sellAt: keyof PriceRange = 'mid'): number {
  return goods.stationBuys[sellAt] - goods.stationSells[buyAt]
}

export const MANAGED_TRADE_TABS = ['overview', 'goods', 'stations', 'caravan', 'calculator', 'commissions'] as const
export type ManagedTradeTab = (typeof MANAGED_TRADE_TABS)[number]

/** `?tab=` — a section is a URL, so a link can open the calculator directly. */
export function managedTradeSearch(search: Record<string, unknown>): { tab?: ManagedTradeTab } {
  return MANAGED_TRADE_TABS.includes(search.tab as ManagedTradeTab) ? { tab: search.tab as ManagedTradeTab } : {}
}
