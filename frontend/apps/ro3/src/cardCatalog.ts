export type CardKind = 'all' | 'quality-2' | 'quality-3' | 'quality-4' | 'quality-5' | 'quality-6'

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
}

export function localizedText(value: LocalizedText | null | undefined): string {
  return value?.['zh-CN'] ?? ''
}

export function filterCards(cards: WikiCard[], query: string, kind: CardKind) {
  const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN')
  const quality = kind === 'all' ? null : Number(kind.replace('quality-', ''))

  return cards.filter((card) => {
    if (quality !== null && card.quality !== quality) return false
    if (!normalizedQuery) return true

    return [String(card.id), localizedText(card.name), localizedText(card.description)]
      .some((value) => value.toLocaleLowerCase('zh-CN').includes(normalizedQuery))
  })
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
