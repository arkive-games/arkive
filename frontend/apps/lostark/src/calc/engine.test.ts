import { describe, expect, it } from 'vitest'
import { braceletAmp, engravingAmpFromClient } from './engine'

/**
 * Bracelet compounding used to be covered end-to-end by picking two lines in
 * two different slots. That stopped being possible once the picker became the
 * game's own three groups: of the 347 option lines the client ships, only the
 * 289 in the 刻印效果 group carry any combat power (168 of them), and 基本效果
 * and 战斗特性 carry none. A user therefore cannot select two scoring lines,
 * so the multiply-vs-sum question belongs here, against the pure function.
 */
describe('braceletAmp', () => {
  const none = { dps: 0, support: 0 }
  const lines = [
    { id: 'a', amp: { dps: 0.03, support: 0.01 }, heal_amp: none },
    { id: 'b', amp: { dps: 0.02, support: 0.005 }, heal_amp: none },
    { id: 'zero', amp: none, heal_amp: none },
    // Type 21: a protection/heal line, which carries NO score amp.
    { id: 'heal', amp: none, heal_amp: { dps: 0, support: 0.049 } },
  ]

  it('compounds rather than sums', () => {
    // 1.03 * 1.02 - 1 = 0.0506, not 0.05.
    expect(braceletAmp(['a', 'b'], 'dps', lines)).toBeCloseTo(0.0506, 10)
    expect(braceletAmp(['a', 'b'], 'dps', lines)).not.toBeCloseTo(0.05, 10)
  })

  it('reads the amp for the requested role', () => {
    expect(braceletAmp(['a'], 'dps', lines)).toBeCloseTo(0.03, 10)
    expect(braceletAmp(['a'], 'support', lines)).toBeCloseTo(0.01, 10)
  })

  it('treats empty slots and unknown ids as no-ops', () => {
    expect(braceletAmp(['', '', ''], 'dps', lines)).toBe(0)
    expect(braceletAmp(['a', '', 'nope'], 'dps', lines)).toBeCloseTo(0.03, 10)
  })

  it('contributes nothing for lines the game grants no power', () => {
    expect(braceletAmp(['zero'], 'dps', lines)).toBe(0)
  })

  /**
   * Type 21 is the protection/heal channel and belongs to the support role's
   * separate heal component. Merging it into the score amp put a 4.9% amp on a
   * base of 8.55 instead of 189.25 — a percent-level error, not a rounding one.
   */
  it('keeps the heal channel out of the score', () => {
    expect(braceletAmp(['heal'], 'support', lines)).toBe(0)
    expect(braceletAmp(['heal'], 'support', lines, 'heal')).toBeCloseTo(0.049, 10)
  })

  it('does not leak a heal amp into the dps role', () => {
    expect(braceletAmp(['heal'], 'dps', lines, 'heal')).toBe(0)
  })
})

/**
 * Engraving amps split across two BattlePoint types, and the split matters.
 *
 * Type 10 feeds the damage or support SCORE; Type 11 is the heal channel and
 * belongs to the separate heal component, exactly as the orb's heal amp does.
 * 妙手回春 is the only engraving with a Type 11 grid and it has NO Type 10 cells,
 * so summing the two channels counted its heal amp as support score: it inflated
 * the wrong half of the total and left the heal half at zero.
 */
describe('engravingAmpFromClient channels', () => {
  const slot = { name: 'heal-one', grade: 4, book: 1, stone: 0 }
  // grade 4, book 1, stone 0 -> 20*0 + 1 + 4*2 + 1 = 10
  const byName = new Map([
    [
      'heal-one',
      {
        slug: 'heal_one',
        amp: { dps: {}, support: {} },
        heal_amp: { dps: {}, support: { '10': 0.35 } },
      },
    ],
  ])

  it('keeps the heal channel out of the score', () => {
    expect(engravingAmpFromClient(slot, 'support', byName)).toBe(0)
    expect(engravingAmpFromClient(slot, 'support', byName, 'score')).toBe(0)
  })

  it('reads the heal channel only when asked', () => {
    expect(engravingAmpFromClient(slot, 'support', byName, 'heal')).toBeCloseTo(0.35, 10)
  })

  it('is zero for a role the grid does not cover', () => {
    expect(engravingAmpFromClient(slot, 'dps', byName, 'heal')).toBe(0)
  })

  it('is zero without a grade, since the growth code needs one', () => {
    expect(engravingAmpFromClient({ ...slot, grade: 0 }, 'support', byName, 'heal')).toBe(0)
  })
})

/**
 * The growth code must never be indexed by a grade off the ladder.
 *
 * Grade 1 (基本) is not on it. The picker never offers it, but an imported
 * loadout could carry it, and `20*stone + 1 + 4*(1-2) + book` then shifts four
 * cells down: at book 4 it lands on 21/41/61/81, which are real cells the UI
 * cannot select, so the score comes out WRONG rather than zero; at lower books it
 * goes negative. `parseLoadout` rejects grade 1, and this pins the arithmetic
 * that makes it dangerous so the guard is not removed as redundant.
 */
describe('growth code', () => {
  const code = (stone: number, grade: number, level: number) =>
    20 * stone + 1 + 4 * (grade - 2) + level

  it('is injective over every selectable triple', () => {
    const seen = new Map<number, string>()
    for (const stone of [0, 1, 2, 3, 4]) {
      for (const grade of [2, 3, 4]) {
        for (const level of [1, 2, 3, 4]) {
          const c = code(stone, grade, level)
          expect(seen.has(c)).toBe(false)
          seen.set(c, `${stone}/${grade}/${level}`)
        }
      }
    }
    expect(seen.size).toBe(60)
  })

  it('would collide with unselectable cells if grade 1 were allowed', () => {
    // The reason parseLoadout rejects it rather than clamping it.
    expect([1, 2, 3, 4].map((b) => code(1, 1, b))).toEqual([18, 19, 20, 21])
    expect(code(0, 1, 1)).toBe(-2)
  })
})
