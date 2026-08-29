import { describe, expect, it } from 'vitest'
import {
  countCardsByCategory,
  countCardsByQuality,
  filterCards,
  localizedText,
  stripGameMarkup,
  type WikiCard,
} from './cardCatalog'

const cards: WikiCard[] = [
  {
    id: 1420100,
    name: { 'zh-CN': 'Lunatic card' },
    description: { 'zh-CN': 'First card' },
    quality: 2,
    part: 1,
    isElementCard: false,
    stackLimit: 999,
    tradable: true,
    icon: 'icons/cards/card_1420100.webp',
    tiers: [],
  },
  {
    id: 1420101,
    name: { 'zh-CN': 'Savage card' },
    description: { 'zh-CN': 'Second card' },
    quality: 4,
    part: 2,
    isElementCard: false,
    stackLimit: 999,
    tradable: true,
    icon: 'icons/cards/card_1420101.webp',
    tiers: [{
      configId: 2,
      tier: 0,
      level: 5,
      power: 186,
      cost: [],
      attributes: [[1, 1], [101, 298]],
      specialEffects: [],
      showLibrary: true,
      open: true,
    }],
  },
]

const collectionCardIds = new Set([1420101])
const ordinaryFilters = {
  category: 'ordinary' as const,
  parts: [],
  qualities: [],
  baseAttributes: [],
  primaryAttributes: [],
}

describe('RO3 card catalog helpers', () => {
  it('filters cards by category, slot, quality, and attributes', () => {
    expect(filterCards(cards, '', ordinaryFilters, collectionCardIds)).toEqual(cards)
    expect(filterCards(cards, '', { ...ordinaryFilters, category: 'collection' }, collectionCardIds)).toEqual([cards[1]])
    expect(filterCards(cards, '', { ...ordinaryFilters, category: 'collection', parts: [2], qualities: [4], baseAttributes: [1], primaryAttributes: [101] }, collectionCardIds)).toEqual([cards[1]])
    expect(filterCards(cards, '', { ...ordinaryFilters, category: 'collection', baseAttributes: [2] }, collectionCardIds)).toEqual([])
  })

  it('filters the active category by name and numeric id', () => {
    expect(filterCards(cards, 'Savage', { ...ordinaryFilters, category: 'collection' }, collectionCardIds)).toEqual([cards[1]])
    expect(filterCards(cards, '1420100', ordinaryFilters, collectionCardIds)).toEqual([cards[0]])
  })

  it('counts quality groups without changing the source list', () => {
    expect(countCardsByQuality(cards, 2)).toBe(1)
    expect(countCardsByQuality(cards, 5)).toBe(0)
    expect(cards).toHaveLength(2)
  })

  it('counts ordinary and collection cards from the confirmed series map', () => {
    expect(countCardsByCategory(cards, 'ordinary', collectionCardIds)).toBe(2)
    expect(countCardsByCategory(cards, 'collection', collectionCardIds)).toBe(1)
  })

  it('uses Simplified Chinese and removes game rich-text markup', () => {
    expect(localizedText({ 'zh-CN': 'Name', 'en-US': 'English' })).toBe('Name')
    expect(stripGameMarkup('<color=#fff>46%</color><br>Damage')).toBe('46%\nDamage')
  })
})
