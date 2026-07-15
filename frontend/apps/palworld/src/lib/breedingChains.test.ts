import { describe, it, expect } from 'vitest'

import { makeEngine, type BreedingData, type BreedingPal } from './breeding'
import { findChains } from './breedingChains'

/**
 * Synthetic roster with a deterministic topology: every Pal has the same
 * CombiRank, so every rank-average pairing resolves to `Sink` (rank tie →
 * same-rank fallback → lowest Paldeck number, and Sink is No.1). The unique
 * combos below are therefore the ONLY interesting edges:
 *
 *   A + X1 = B     A + X7 = B    (two partner options for the same step)
 *   A + X3 = E     A + X6 = F
 *   A + Y0 = C                    (direct)
 *   B♀ + Y2♂ = C                  (gendered)
 *   F + Y3 = C
 *   E + X4 = D     E + X5 = B
 *   D + Z1 = C
 *   L (legendary) has no recipe at all.
 *
 * Expected chains A → C, max 3 generations:
 *   direct:  A + Y0 = C
 *   2-gen:   A → B → C   and   A → F → C
 *   3-gen:   A → E → D → C  only
 * Detour-filtered out: A → B → D → C (B makes C directly) and
 * A → E → B → C (B is already a direct child of A).
 */
const pal = (id: string, zukanIndex: number, extra: Partial<BreedingPal> = {}): BreedingPal => ({
  id,
  zukanIndex,
  zukanIndexSuffix: '',
  icon: '',
  rank: 1000,
  idx: zukanIndex,
  breedChild: true,
  ...extra,
})

const data: BreedingData = {
  pals: [
    pal('Sink', 1),
    pal('A', 2),
    pal('B', 3),
    pal('E', 4),
    pal('F', 5),
    pal('D', 6),
    pal('C', 7),
    pal('X1', 8),
    pal('X3', 9),
    pal('X4', 10),
    pal('X5', 11),
    pal('X6', 12),
    pal('Y0', 13),
    pal('Y2', 14),
    pal('Y3', 15),
    pal('Z1', 16),
    pal('L', 17, { breedChild: false, legendary: true }),
    pal('X7', 18),
  ],
  combos: [
    // Slot order deliberately reversed: orientation must put the fixed parent in slot a.
    { a: 'X1', b: 'A', c: 'B' },
    { a: 'A', b: 'X7', c: 'B' },
    { a: 'A', b: 'X3', c: 'E' },
    { a: 'A', b: 'X6', c: 'F' },
    { a: 'A', b: 'Y0', c: 'C' },
    { a: 'B', b: 'Y2', c: 'C', ag: 'F', bg: 'M' },
    { a: 'F', b: 'Y3', c: 'C' },
    { a: 'E', b: 'X4', c: 'D' },
    { a: 'E', b: 'X5', c: 'B' },
    { a: 'D', b: 'Z1', c: 'C' },
  ],
}

const engine = makeEngine(data)

/** Chain shape as `child` sequences, e.g. ['B', 'C'] for A → B → C. */
const shape = (chains: ReturnType<typeof findChains>) => chains.map((ch) => ch.steps.map((s) => s.child))

describe('findChains', () => {
  it('lists direct, 2-gen and detour-free 3-gen chains in that order (max 3)', () => {
    const chains = findChains(engine, data, 'A', 'C', 3)
    expect(shape(chains)).toEqual([
      ['C'], // direct, prioritized first
      ['B', 'C'],
      ['F', 'C'],
      ['E', 'D', 'C'], // A→B→D→C and A→E→B→C are dominated detours
    ])
  })

  it('caps at 2 generations when maxGen is 2', () => {
    expect(shape(findChains(engine, data, 'A', 'C', 2))).toEqual([['C'], ['B', 'C'], ['F', 'C']])
  })

  it('links steps: fixed of step i+1 is the child of step i, starting at A', () => {
    for (const ch of findChains(engine, data, 'A', 'C', 3)) {
      expect(ch.steps[0].fixed).toBe('A')
      for (let i = 1; i < ch.steps.length; i++) {
        expect(ch.steps[i].fixed).toBe(ch.steps[i - 1].child)
      }
      expect(ch.steps[ch.steps.length - 1].child).toBe('C')
    }
  })

  it('groups partner options per step, oriented with the fixed parent in slot a, roster-ordered', () => {
    const chains = findChains(engine, data, 'A', 'C', 3)
    const toB = chains[1]
    // X1 comes from the reversed row {a:'X1', b:'A'}; X7 sits at the roster's end.
    expect(toB.steps[0].partners.map((f) => [f.a, f.b, f.c])).toEqual([
      ['A', 'X1', 'B'],
      ['A', 'X7', 'B'],
    ])
  })

  it('keeps genders attached through orientation on the gendered combo', () => {
    const chains = findChains(engine, data, 'A', 'C', 3)
    const [step2] = chains[1].steps.slice(1)
    expect(step2.partners).toHaveLength(1)
    expect(step2.partners[0]).toMatchObject({ a: 'B', b: 'Y2', c: 'C', ag: 'F', bg: 'M' })
  })

  it('marks hand-authored combos as unique in partner options', () => {
    const chains = findChains(engine, data, 'A', 'C', 3)
    expect(chains[0].steps[0].partners[0].unique).toBe(true)
  })

  it('returns no chains for an unbreedable (legendary) target', () => {
    expect(findChains(engine, data, 'A', 'L', 3)).toEqual([])
  })

  it('returns only the self-pair when parent and child are the same Pal', () => {
    const chains = findChains(engine, data, 'C', 'C', 3)
    expect(shape(chains)).toEqual([['C']])
    expect(chains[0].steps[0].partners.map((f) => [f.a, f.b])).toEqual([['C', 'C']])
  })
})
