import rawCatalog from './data/cards.json'
import rawAssetCatalog from './data/cardAssets.json'

export type CardKind = 'all' | 'base' | 'collection'

export interface WikiCard {
  id: string
  kind: Exclude<CardKind, 'all'>
  name: string
  aliases?: string[]
  baseCardName?: string
  stages?: string[]
  source: {
    file: string
    offset: number
  }
  dataStatus: 'client-name-confirmed' | 'client-series-confirmed'
}

export interface CardAssetReference {
  name: string
  files: string[]
}

interface CardAssetCatalogDocument {
  source: string
  note: string
  referenceCount: number
  references: CardAssetReference[]
}

interface CardCatalogDocument {
  clientVersion: string
  source: {
    kind: string
    files: Array<{
      file: string
      size: number
      sha256: string
    }>
    note: string
  }
  counts: {
    sourceNames: number
    baseCards: number
    collectionCards: number
    aliases: number
    wikiCards: number
  }
  cards: WikiCard[]
}

const catalog = rawCatalog as CardCatalogDocument
const assetCatalog = rawAssetCatalog as CardAssetCatalogDocument

export const CARD_CATALOG = catalog.cards
export const CARD_COUNTS = catalog.counts
export const CARD_SOURCE = catalog.source
export const CARD_CLIENT_VERSION = catalog.clientVersion
export const CARD_ASSET_SOURCE = assetCatalog.source
export const CARD_ASSET_NOTE = assetCatalog.note
export const CARD_ASSET_REFERENCES = assetCatalog.references
export const CARD_ASSET_COUNT = assetCatalog.referenceCount

export function filterCards(query: string, kind: CardKind) {
  const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN')

  return CARD_CATALOG.filter((card) => {
    if (kind !== 'all' && card.kind !== kind) return false
    if (!normalizedQuery) return true

    return [
      card.name,
      card.baseCardName,
      ...(card.aliases ?? []),
      ...(card.stages ?? []),
    ].some((value) => value?.toLocaleLowerCase('zh-CN').includes(normalizedQuery))
  })
}
