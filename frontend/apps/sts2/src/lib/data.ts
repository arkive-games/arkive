import { dataUrl } from './urls'

export interface CardVar {
  base: number
  /** Present only when upgrading changes the value. */
  upgraded?: number
}

export interface Card {
  id: string
  type: string
  rarity: string
  cost: number
  target: string
  /** Character deck this card belongs to, e.g. `ironclad`; absent for a few unreleased cards. */
  pool?: string
  keywords?: string[]
  tags?: string[]
  /** Magnitudes the localized description's {Name:diff()} placeholders resolve against. */
  vars?: Record<string, CardVar>
  icon?: string
  hiddenInLibrary?: boolean
}

export interface CardFilters {
  pools: string[]
  types: string[]
  rarities: string[]
  costs: number[]
}

export interface Character {
  id: string
  playable: boolean
  pool?: string
  cardCount?: number
  startingHp: number
  startingGold: number
  maxEnergy: number
  orbSlots: number
  gender?: string
  /** Deck theme colour, straight from the game's own card pool. */
  color?: string
  icon?: string
}

export interface TextEntry {
  name: string
  description?: string
}

export interface CharacterText extends TextEntry {
  cardsModifierTitle?: string
  cardsModifierDescription?: string
}

export interface Bundle {
  cards: Card[]
  cardsById: Map<string, Card>
  filters: CardFilters
  characters: Character[]
  charactersById: Map<string, Character>
  cardText: Record<string, TextEntry>
  characterText: Record<string, CharacterText>
  keywordText: Record<string, TextEntry>
}

const j = async <T,>(url: string): Promise<T> => {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${url}: ${r.status}`)
  return r.json() as Promise<T>
}

const cache = new Map<string, Promise<Bundle>>()

async function fetchBundle(lng: string): Promise<Bundle> {
  const [cardsFile, charactersFile, cardText, characterText, keywordText] = await Promise.all([
    j<{ cards: Card[]; filters: CardFilters }>(dataUrl('cards.json')),
    j<{ characters: Character[] }>(dataUrl('characters.json')),
    j<Record<string, TextEntry>>(dataUrl(`locales/${lng}/cards.json`)),
    j<Record<string, CharacterText>>(dataUrl(`locales/${lng}/characters.json`)),
    j<Record<string, TextEntry>>(dataUrl(`locales/${lng}/keywords.json`)),
  ])

  return {
    cards: cardsFile.cards,
    cardsById: new Map(cardsFile.cards.map((c) => [c.id, c])),
    filters: cardsFile.filters,
    characters: charactersFile.characters,
    charactersById: new Map(charactersFile.characters.map((c) => [c.id, c])),
    cardText,
    characterText,
    keywordText,
  }
}

/**
 * Load (and cache per language) the whole dataset.
 *
 * The game ships no Traditional Chinese, so zh-TW falls back to zh-CN rather
 * than to English: the two are mutually intelligible, and machine-converting
 * would mean inventing translations the game never shipped.
 */
export function loadBundle(lng: string): Promise<Bundle> {
  const tag = lng === 'zh-TW' ? 'zh-CN' : lng
  let p = cache.get(tag)
  if (!p) { p = fetchBundle(tag); cache.set(tag, p) }
  return p
}

export const cardName = (b: Bundle, id: string): string => b.cardText[id]?.name ?? id
export const characterName = (b: Bundle, id: string): string => b.characterText[id]?.name ?? id
