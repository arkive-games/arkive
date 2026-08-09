import { beforeEach, describe, expect, it } from 'vitest'
import { clearLoadout, defaultLoadout, parseLoadout, restoreLoadout, saveLoadout } from './loadout'

const store = new Map<string, string>()

beforeEach(() => {
  store.clear()
  globalThis.localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() { return store.size },
  } as Storage
})

/**
 * `parseLoadout` is the trust boundary for imported files, so what it accepts
 * matters as much as what it computes.
 */
describe('parseLoadout engraving grades', () => {
  const payload = (grade: unknown) => ({
    engravings: [{ name: 'grudge', grade, book: 4, stone: 1 }],
  })

  it('rejects grade 1, which is not on the growth ladder', () => {
    const { loadout, rejected } = parseLoadout(payload(1))
    expect(loadout.engravings[0].grade).toBe(0)
    expect(rejected.some((r) => r.includes('grade'))).toBe(true)
  })

  it('accepts the ladder grades and the empty state', () => {
    for (const grade of [0, 2, 3, 4]) {
      const { loadout, rejected } = parseLoadout(payload(grade))
      expect(loadout.engravings[0].grade).toBe(grade)
      expect(rejected.some((r) => r.includes('grade'))).toBe(false)
    }
  })

  it('rejects out-of-range and non-numeric grades', () => {
    for (const grade of [5, -1, 2.5, '4', null]) {
      const { loadout, rejected } = parseLoadout(payload(grade))
      expect(loadout.engravings[0].grade).toBe(0)
      expect(rejected.some((r) => r.includes('grade'))).toBe(true)
    }
  })

  it('never leaves a graded slot on level 0, which the code does not define', () => {
    const { loadout } = parseLoadout({
      engravings: [{ name: 'grudge', grade: 4, book: 0, stone: 0 }],
    })
    expect(loadout.engravings[0].book).toBeGreaterThanOrEqual(1)
  })
})

describe('loadout draft memory', () => {
  it('clears persisted work immediately', () => {
    const changed = { ...defaultLoadout(), combatLevel: 62 }
    expect(saveLoadout(changed)).toBe(true)
    expect(restoreLoadout().combatLevel).toBe(62)

    clearLoadout()

    expect(restoreLoadout()).toEqual(defaultLoadout())
  })
})
