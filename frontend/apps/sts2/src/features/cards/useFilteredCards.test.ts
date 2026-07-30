import { describe, expect, it } from 'vitest'
import type { Card } from '../../lib/data'
import { EMPTY_FILTER, filterCards, isFilterActive, toggle } from './useFilteredCards'

const cards: Card[] = [
  { id: 'ANGER', type: 'Attack', rarity: 'Common', cost: 0, target: 'AnyEnemy', pool: 'ironclad', vars: { Damage: { base: 6 } } },
  { id: 'ABRASIVE', type: 'Power', rarity: 'Rare', cost: 3, target: 'Self', pool: 'silent' },
  { id: 'ZAP', type: 'Skill', rarity: 'Common', cost: 1, target: 'Self', pool: 'defect' },
]

const cardText = {
  ANGER: { name: 'Anger', description: 'Deal {Damage:diff()} damage.\nAdd a copy to your [gold]Discard Pile[/gold].' },
  ABRASIVE: { name: 'Abrasive', description: 'Gain Thorns.' },
  ZAP: { name: 'Zap', description: 'Channel 1 Lightning.' },
}

const bundle = { cards, cardText }

describe('filterCards', () => {
  it('sorts by localized name, not by id', () => {
    expect(filterCards(bundle, EMPTY_FILTER).map((c) => c.id)).toEqual(['ABRASIVE', 'ANGER', 'ZAP'])
  })

  it('matches a card by name', () => {
    expect(filterCards(bundle, { ...EMPTY_FILTER, query: 'ang' }).map((c) => c.id)).toEqual(['ANGER'])
  })

  it('matches a card by its rendered effect text', () => {
    // Players look for what a card does far more often than what it is called,
    // so search runs over the resolved description too.
    expect(filterCards(bundle, { ...EMPTY_FILTER, query: 'discard pile' }).map((c) => c.id)).toEqual(['ANGER'])
    expect(filterCards(bundle, { ...EMPTY_FILTER, query: '6 damage' }).map((c) => c.id)).toEqual(['ANGER'])
  })

  it('ORs within a facet and ANDs across facets', () => {
    expect(filterCards(bundle, { ...EMPTY_FILTER, pools: ['ironclad', 'defect'] }).map((c) => c.id))
      .toEqual(['ANGER', 'ZAP'])
    expect(filterCards(bundle, { ...EMPTY_FILTER, pools: ['ironclad', 'defect'], costs: [1] }).map((c) => c.id))
      .toEqual(['ZAP'])
  })

  it('filters by cost including zero', () => {
    // 0 is a real cost, so a falsy check here would silently drop every free card.
    expect(filterCards(bundle, { ...EMPTY_FILTER, costs: [0] }).map((c) => c.id)).toEqual(['ANGER'])
  })
})

describe('filter helpers', () => {
  it('reports an active filter', () => {
    expect(isFilterActive(EMPTY_FILTER)).toBe(false)
    expect(isFilterActive({ ...EMPTY_FILTER, costs: [0] })).toBe(true)
    expect(isFilterActive({ ...EMPTY_FILTER, query: 'x' })).toBe(true)
  })

  it('toggles a value in and out', () => {
    expect(toggle(['a'], 'b')).toEqual(['a', 'b'])
    expect(toggle(['a', 'b'], 'a')).toEqual(['b'])
  })
})
