export type CardCategory = 'ordinary' | 'collection'

export interface CardFilters {
  category: CardCategory
  parts: number[]
  qualities: number[]
  baseAttributes: number[]
  primaryAttributes: number[]
}

export interface LocalizedText {
  'zh-CN'?: string
  'zh-TW'?: string
  'en-US'?: string
  'ko-KR'?: string
}

export interface CardTier {
  configId: number
  tier: number
  level: number
  power: number
  cost: number[][]
  attributes: number[][]
  specialEffects: number[]
  showLibrary: boolean
  open: boolean
}

export interface WikiCard {
  id: number
  name: LocalizedText
  description: LocalizedText
  quality: number
  part: number
  isElementCard: boolean
  stackLimit: number
  tradable: boolean
  icon: string
  tiers: CardTier[]
}

export interface CardAttribute {
  id: number
  key: string
  name: LocalizedText
  type: number
  dataType: number
}

export interface CardSpecialEffect {
  id: number
  description: LocalizedText | null
}

export interface CardCatalogDocument {
  source: string
  counts: {
    cards: number
    tiers: number
    cardsWithName: number
    cardsWithDescription: number
    cardsWithIcon: number
    specialEffects: number
    specialEffectsWithDescription: number
  }
  attributes: CardAttribute[]
  specialEffects: CardSpecialEffect[]
  cards: WikiCard[]
  flashCardPools: Array<{ cards: number[] }>
}

export function localizedText(value: LocalizedText | null | undefined): string {
  return value?.['zh-CN'] ?? ''
}

export function filterCards(
  cards: WikiCard[],
  query: string,
  filters: CardFilters,
  collectionCardIds: ReadonlySet<number>,
) {
  const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN')

  return cards.filter((card) => {
    if (filters.category === 'collection' && !collectionCardIds.has(card.id)) return false
    if (filters.parts.length > 0 && !filters.parts.includes(card.part)) return false
    if (filters.qualities.length > 0 && !filters.qualities.includes(card.quality)) return false
    if (!hasEveryAttribute(card, filters.baseAttributes)) return false
    if (!hasEveryAttribute(card, filters.primaryAttributes)) return false
    if (!normalizedQuery) return true

    return [String(card.id), localizedText(card.name), localizedText(card.description)]
      .some((value) => value.toLocaleLowerCase('zh-CN').includes(normalizedQuery))
  })
}

function hasEveryAttribute(card: WikiCard, attributeIds: number[]): boolean {
  if (attributeIds.length === 0) return true
  const cardAttributeIds = new Set(card.tiers.flatMap((tier) => tier.attributes.map(([attributeId]) => attributeId)))
  return attributeIds.every((attributeId) => cardAttributeIds.has(attributeId))
}

export function countCardsByCategory(
  cards: WikiCard[],
  category: CardCategory,
  collectionCardIds: ReadonlySet<number>,
): number {
  return category === 'ordinary' ? cards.length : cards.filter((card) => collectionCardIds.has(card.id)).length
}

export function countCardsByQuality(cards: WikiCard[], quality: number): number {
  return cards.filter((card) => card.quality === quality).length
}

export function stripGameMarkup(value: string): string {
  return value
    .replace(/<color(?:=[^>]*)?>/gi, '')
    .replace(/<\/color>/gi, '')
    .replace(/<link(?:=[^>]*)?>/gi, '')
    .replace(/<\/link>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
}
