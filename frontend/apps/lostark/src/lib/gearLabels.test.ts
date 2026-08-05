import { describe, expect, it } from 'vitest'
import {
  armourSetLabel,
  commonPrefix,
  gradePalette,
  seriesLabel,
  weaponLabel,
} from './gearLabels'
import type { GearItems } from './data'

/** Shaped like the real artifact, with the client's own strings. */
const names: Record<string, string> = {
  h: '宿命决断头盔',
  c: '宿命决断上装',
  l: '宿命决断下装',
  g: '宿命决断手套',
  s: '宿命决断肩甲',
  H: '疯狂决断头盔',
  C: '疯狂决断上装',
  L: '疯狂决断下装',
  G: '疯狂决断手套',
  S: '疯狂决断肩甲',
  kh: '운명의 결단 투구',
  kc: '운명의 결단 상의',
  kl: '운명의 결단 하의',
  kg: '운명의 결단 장갑',
  ks: '운명의 결단 견갑',
  w: '宿命决断大剑',
}

const items: GearItems = {
  grades: { '5': 'grade.relic' },
  weapons: { '10159000': { grade: 5, set_key: null, names: { '102': ['w'] } } },
  sets: {
    '1015901': {
      grade: 5,
      set_key: null,
      series: { '102': [['h', 'c', 'l', 'g', 's'], ['H', 'C', 'L', 'G', 'S']] },
    },
  },
  unnamed: [],
}

describe('commonPrefix', () => {
  it('returns the shared head of every value', () => {
    expect(commonPrefix(['abcd', 'abce', 'abzz'])).toBe('ab')
  })

  it('returns empty when nothing is shared', () => {
    expect(commonPrefix(['abc', 'xyz'])).toBe('')
    expect(commonPrefix([])).toBe('')
  })
})

describe('seriesLabel', () => {
  it('reduces the five piece names to the series name', () => {
    expect(seriesLabel(['h', 'c', 'l', 'g', 's'], names)).toBe('宿命决断')
  })

  it('trims the space Korean names put before the slot word', () => {
    expect(seriesLabel(['kh', 'kc', 'kl', 'kg', 'ks'], names)).toBe('운명의 결단')
  })

  it('falls back to a full piece name when nothing is shared', () => {
    expect(seriesLabel(['h', 'C'], names)).toBe('宿命决断头盔')
  })

  it('is empty when no key resolves, so the caller can fall back to the id', () => {
    expect(seriesLabel(['missing'], names)).toBe('')
  })
})

describe('armourSetLabel', () => {
  it('joins the series one stat template covers', () => {
    expect(armourSetLabel(items, '1015901', 102, names)).toBe('宿命决断 · 疯狂决断')
  })

  it('is empty for a class that cannot wear the set', () => {
    expect(armourSetLabel(items, '1015901', 204, names)).toBe('')
  })

  it('is empty without the artifact, rather than throwing', () => {
    expect(armourSetLabel(undefined, '1015901', 102, names)).toBe('')
  })
})

describe('weaponLabel', () => {
  it('names the weapon of the selected class', () => {
    expect(weaponLabel(items, '10159000', 102, names)).toBe('宿命决断大剑')
  })

  it('is empty for a class the template does not list', () => {
    expect(weaponLabel(items, '10159000', 999, names)).toBe('')
  })
})

describe('gradePalette', () => {
  it('maps Item.Grade 3..6 onto the four palette slots', () => {
    expect(gradePalette(3)).toBe(0)
    expect(gradePalette(6)).toBe(3)
  })

  it('has no colour for Esther or for an unknown grade', () => {
    expect(gradePalette(7)).toBeNull()
    expect(gradePalette(2)).toBeNull()
    expect(gradePalette(undefined)).toBeNull()
  })
})
