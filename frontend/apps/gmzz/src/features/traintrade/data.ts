import { dataUrl, iconUrl } from '@/lib/urls'
import {
  parseTrainTradeRouteProfiles,
  type RawDifficulty,
  type RawMapGeneration,
  type RawStationType,
  type TrainTradeRouteProfile,
} from './routeProfiles'

export type TrainTradeGoods = {
  id: number
  name: string
  description: string
  stationDescription: string
  buyStations: string
  sellStations: string
  type: string
  category: 'ART' | 'CLOTH' | 'CRAFTS' | 'FOOD' | 'WINE'
  typeDescription: string
  level: number
  quality: number
  baseBuyPrice: number
  baseSellPrice: number
  leftoverSellPrice: number
  systemItemId: number
  /** Item icon id. NOT interchangeable with systemItemId — see `iconFor`. */
  icon: string
}

type RawGoods = {
  BaseBuyPrice: number
  BaseSellPrice: number
  GoodsDesc?: string
  GoodsDescStation?: string
  GoodsLevel: number
  GoodsNameTextID: string
  GoodsType: string
  ID: number
  LeftOverSellPrice: number
  Quality: number
  SystemItemID: number
}

type RawGoodsTypes = Record<string, { GoodsTypeDesc?: string }>

export type TrainTradeStation = 'wine' | 'food' | 'art'
export type TrainTradePriceRange = { buy: [number, number]; sell: [number, number] }
export type TrainTradePrices = Record<TrainTradeStation, TrainTradePriceRange>

type RawPrice = { BuyPriceRange: [number, number]; SellPriceRange: [number, number] }
type RawPriceTable = Record<string, Record<string, RawPrice>>


/** Strip the client's own rich-text markup (`<LightHighlight>…</>`, `<HyperLink …>`). */
const stripMarkup = (value: string | undefined) =>
  (value ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()

const file = (name: string) => dataUrl(`traintrade/${name}`)

async function loadJson<T>(name: string, what: string): Promise<T> {
  const response = await fetch(file(name))
  if (!response.ok) throw new Error(`Unable to load ${what} (${response.status})`)
  return (await response.json()) as T
}

export async function loadTrainTradeRouteProfiles(): Promise<TrainTradeRouteProfile[]> {
  const [difficulties, maps, stations] = await Promise.all([
    loadJson<RawDifficulty[]>('difficulties.json', 'Train Trade difficulties'),
    loadJson<RawMapGeneration[]>('map_generation.json', 'Train Trade map generation'),
    loadJson<RawStationType[]>('station_types.json', 'Train Trade station types'),
  ])
  return parseTrainTradeRouteProfiles(difficulties, maps, stations)
}

/**
 * Icon URL for a goods row.
 *
 * Keyed by the icon id from `traintrade/icons.json`, never by `systemItemId`:
 * the HIGH_ tiers carry their own item id but share their base tier's art, so
 * half of the 64 goods would 404 if the item id were used as the filename.
 */
export function iconFor(goods: TrainTradeGoods): string {
  return iconUrl(goods.icon)
}

export async function loadTrainTradeGoods(): Promise<TrainTradeGoods[]> {
  const [goods, types, icons] = await Promise.all([
    loadJson<RawGoods[]>('goods.json', 'Train Trade goods'),
    loadJson<RawGoodsTypes>('goods_types.json', 'Train Trade goods types'),
    loadJson<Record<string, string>>('icons.json', 'Train Trade icons'),
  ])
  if (!Array.isArray(goods) || !types || typeof types !== 'object') {
    throw new Error('Invalid Train Trade goods data')
  }
  return goods.map((entry) => {
    // The station blurb names the buy stop then the sell stop, each highlighted.
    const stations = [...(entry.GoodsDescStation ?? '').matchAll(/<LightHighlight>(.*?)<\/>/g)]
      .map((match) => stripMarkup(match[1]))

    return {
      id: entry.ID,
      name: entry.GoodsNameTextID,
      description: stripMarkup(entry.GoodsDesc),
      stationDescription: stripMarkup(entry.GoodsDescStation),
      buyStations: stations[0] ?? '',
      sellStations: stations[1] ?? '',
      type: entry.GoodsType,
      category: entry.GoodsType.replace(/^HIGH_/, '') as TrainTradeGoods['category'],
      typeDescription: types[entry.GoodsType]?.GoodsTypeDesc ?? entry.GoodsType,
      level: entry.GoodsLevel,
      quality: entry.Quality,
      baseBuyPrice: entry.BaseBuyPrice,
      baseSellPrice: entry.BaseSellPrice,
      leftoverSellPrice: entry.LeftOverSellPrice,
      systemItemId: entry.SystemItemID,
      icon: icons[String(entry.ID)] ?? String(entry.SystemItemID),
    }
  })
}

export async function loadTrainTradePrices(): Promise<Record<number, TrainTradePrices>> {
  const tables = await loadJson<RawPriceTable[]>('prices.json', 'Train Trade prices')
  if (!Array.isArray(tables)) throw new Error('Invalid Train Trade prices data')
  return Object.fromEntries(tables.map((table, index) => {
    const get = (key: string, id: string): TrainTradePriceRange => {
      const row = table[key]?.[id] ?? { BuyPriceRange: [1, 1], SellPriceRange: [1, 1] }
      return { buy: row.BuyPriceRange, sell: row.SellPriceRange }
    }
    return [index + 1, {
      wine: get('Wine_Station', '30101'),
      food: get('Food_Station', '30101'),
      art: get('Artwork_Station', '30101'),
    }]
  }))
}
