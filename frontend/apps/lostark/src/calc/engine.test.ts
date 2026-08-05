import { describe, expect, it } from 'vitest'
import { braceletAmp } from './engine'

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
