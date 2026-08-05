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
  const lines = [
    { id: 'a', amp: { dps: 0.03, support: 0.01 } },
    { id: 'b', amp: { dps: 0.02, support: 0.005 } },
    { id: 'zero', amp: { dps: 0, support: 0 } },
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
