import { describe, expect, it } from 'vitest'
import {
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
    tiers: [],
  },
]

describe('RO3 card catalog helpers', () => {
  it('filters cards by quality, name, and numeric id', () => {
    expect(filterCards(cards, '', 'quality-2')).toEqual([cards[0]])
    expect(filterCards(cards, 'Savage', 'all')).toEqual([cards[1]])
    expect(filterCards(cards, '1420100', 'all')).toEqual([cards[0]])
  })

  it('counts quality groups without changing the source list', () => {
    expect(countCardsByQuality(cards, 2)).toBe(1)
    expect(countCardsByQuality(cards, 5)).toBe(0)
    expect(cards).toHaveLength(2)
  })

  it('uses Simplified Chinese and removes game rich-text markup', () => {
    expect(localizedText({ 'zh-CN': 'Name', 'en-US': 'English' })).toBe('Name')
    expect(stripGameMarkup('<color=#fff>46%</color><br>Damage')).toBe('46%\nDamage')
  })
})
