import { describe, expect, it } from 'vitest'
import type { PalStats } from './pals'
import {
  applyPassive,
  applyPassiveHp,
  applyPassives,
  calcAttack,
  calcCraft,
  calcDefense,
  calcHp,
  calcStats,
  passiveMul,
  solveIV,
  solveIVs,
  type EnhanceInputs,
} from './statCalc'

const stats = (hp: number, shot: number, def: number, craft = 100): PalStats => ({
  hp,
  meleeAttack: shot,
  shotAttack: shot,
  defense: def,
  support: 100,
  craftSpeed: craft,
  stamina: 100,
  foodAmount: 5,
  maxFullStomach: 300,
  captureRate: 1,
  expRatio: 1,
  price: 1000,
  maleProbability: 50,
  slowWalkSpeed: 80,
  walkSpeed: 160,
  runSpeed: 800,
  rideSprintSpeed: 1000,
  transportSpeed: 480,
  swimSpeed: 240,
})

const inputs = (over: Partial<EnhanceInputs> = {}): EnhanceInputs => ({
  level: 1,
  stars: 0,
  soulHp: 0,
  soulAttack: 0,
  soulDefense: 0,
  soulCraft: 0,
  bond: 0,
  awake: false,
  ...over,
})

// The stat-formula spec's worked example (native-validated): base 100/116/100,
// level 60, IV 100, 4 stars, soul rank 20, no bond, no awakening.
describe('worked example (spec 2026-07-19)', () => {
  const s = stats(100, 116, 100)
  const inp = inputs({ level: 60, stars: 4, soulHp: 20, soulAttack: 20, soulDefense: 20 })

  it('HP truncates 4700 → 5640 → 9024', () => {
    expect(calcHp(s, undefined, 100, inp)).toEqual({ s0: 4700, s1: 5640, final: 9024 })
  })
  it('Attack truncates 778 → 933 → 1492 (not 1493)', () => {
    expect(calcAttack(s, undefined, 100, inp)).toEqual({ s0: 778, s1: 933, final: 1492 })
  })
  it('Defense truncates 635 → 762 → 1219', () => {
    expect(calcDefense(s, undefined, 100, inp)).toEqual({ s0: 635, s1: 762, final: 1219 })
  })
})

describe('base cases', () => {
  it('level 1, no enhancements: HP = floor((base+10)×0.5) + 500', () => {
    const r = calcHp(stats(100, 100, 100), undefined, 0, inputs())
    expect(r.final).toBe(Math.floor((100 + 10) * 0.5 + 500))
  })
  it('attack/defense constants differ (100 vs 50)', () => {
    const s = stats(100, 100, 100)
    expect(calcAttack(s, undefined, 0, inputs()).final).toBe(Math.floor(100 * 0.075 + 100))
    expect(calcDefense(s, undefined, 0, inputs()).final).toBe(Math.floor(100 * 0.075 + 50))
  })
})

describe('bond growth folds into the base before IV/level scaling', () => {
  const s = stats(100, 100, 100)
  const friendship = { hp: 3, shotAttack: 1.3, defense: 2.5, craftSpeed: 1 }

  it('rank 10 HP: (100 + 3×10) as the scaled base', () => {
    const r = calcHp(s, friendship, 0, inputs({ level: 60, bond: 10 }))
    expect(r.final).toBe(Math.floor((130 + 10) * 0.5 * 60 + 500))
  })
  it('negative ranks clamp to zero', () => {
    expect(calcHp(s, friendship, 0, inputs({ bond: -3 }))).toEqual(
      calcHp(s, friendship, 0, inputs({ bond: 0 })),
    )
  })
})

describe('awakening multiplies only the original species base', () => {
  const s = stats(100, 100, 100)
  const friendship = { hp: 3 }
  it('B′ = 100×1.1 + growth×F (growth not awakened)', () => {
    const r = calcHp(s, friendship, 0, inputs({ level: 60, bond: 10, awake: true }))
    expect(r.final).toBe(Math.floor((100 * 1.1 + 30 + 10) * 0.5 * 60 + 500))
  })
})

describe('craft speed', () => {
  it('applies ×0.7, 10%/star, and 3%/soul-rank with stage floors', () => {
    const r = calcCraft(stats(100, 100, 100, 100), undefined, inputs({ stars: 4, soulCraft: 20 }))
    expect(r).toEqual({ base: 100, s0: 70, s1: 98, final: 156 })
  })
  it('ignores level and awakening', () => {
    const a = calcCraft(stats(100, 100, 100, 100), undefined, inputs({ level: 60, awake: true }))
    const b = calcCraft(stats(100, 100, 100, 100), undefined, inputs())
    expect(a).toEqual(b)
  })
  it('adds bond growth before the tribe multiplier', () => {
    const r = calcCraft(stats(100, 100, 100, 100), { craftSpeed: 1 }, inputs({ bond: 10 }))
    expect(r.s0).toBe(Math.floor(110 * 0.7))
  })
})

describe('passive-skill layer (spec 2026-07-23)', () => {
  // Worked example: Anubis at level 60, IV 100, 4 stars, soul 20, no bond/awake.
  // Legend (+20 ATK, +20 DEF) + Musclehead (+30 ATK) → P_ATK=50, P_DEF=20.
  const s = stats(100, 116, 100)
  const inp = inputs({ level: 60, stars: 4, soulHp: 20, soulAttack: 20, soulDefense: 20 })
  // permanent results from the worked example
  const perm = calcStats(s, undefined, { hp: 100, attack: 100, defense: 100 }, inp)

  it('passiveMul clamps at 0.10', () => {
    expect(passiveMul(-90)).toBeCloseTo(0.10)
    expect(passiveMul(-200)).toBeCloseTo(0.10)
    expect(passiveMul(0)).toBeCloseTo(1.0)
    expect(passiveMul(50)).toBeCloseTo(1.5)
  })

  it('ATK_withPassive = floor(1492 × 1.50) = 2238', () => {
    expect(perm.attack.final).toBe(1492)
    expect(applyPassive(1492, 50)).toBe(2238)
  })

  it('DEF_withPassive = floor(1219 × 1.20) = 1462', () => {
    expect(perm.defense.final).toBe(1219)
    expect(applyPassive(1219, 20)).toBe(1462)
  })

  it('HP passive uses trunc_to_0.001 then floor (FixedPoint64 path)', () => {
    // 9024 × 1.0 = 9024 (integer, no visible effect at M=1)
    expect(applyPassiveHp(9024, 0)).toBe(9024)
    // Fractional case: HP × M is non-integer; trunc_to_0.001 matters
    // floor(floor(1234 × 1.15 × 1000 + ε) / 1000) = floor(1419.1) = 1419
    expect(applyPassiveHp(1234, 15)).toBe(1419)
  })

  it('applyPassives bundles all four stats', () => {
    const r = applyPassives(perm, { hp: 0, attack: 50, defense: 20, craft: 0 })
    expect(r.attack).toBe(2238)
    expect(r.defense).toBe(1462)
    expect(r.hp).toBe(perm.hp.final)
    expect(r.craft).toBe(perm.craft.final)
  })

  it('negative passive below clamp still produces 10%', () => {
    expect(applyPassive(1000, -90)).toBe(100)
    expect(applyPassive(1000, -200)).toBe(100)
  })
})

describe('inverse IV solver', () => {
  const s = stats(120, 130, 100)
  const friendship = { hp: 3, shotAttack: 1.3, defense: 2.5 }

  it('round-trips every IV at level 55', () => {
    const inp = inputs({ level: 55, stars: 2, soulHp: 7, soulAttack: 3, soulDefense: 11, bond: 6 })
    for (const iv of [0, 1, 17, 50, 99, 100]) {
      const observed = calcStats(s, friendship, { hp: iv, attack: iv, defense: iv }, inp)
      const solved = solveIVs(
        s,
        friendship,
        { hp: observed.hp.final, attack: observed.attack.final, defense: observed.defense.final },
        inp,
      )
      for (const key of ['hp', 'attack', 'defense'] as const) {
        expect(solved[key]).not.toBeNull()
        expect(iv).toBeGreaterThanOrEqual(solved[key]!.min)
        expect(iv).toBeLessThanOrEqual(solved[key]!.max)
      }
    }
  })

  it('returns a contiguous range when several IVs collide at low level', () => {
    const inp = inputs({ level: 1 })
    const value = calcHp(s, undefined, 50, inp).final
    const sol = solveIV(value, (iv) => calcHp(s, undefined, iv, inp).final)
    expect(sol).not.toBeNull()
    for (let iv = sol!.min; iv <= sol!.max; iv++) {
      expect(calcHp(s, undefined, iv, inp).final).toBe(value)
    }
    if (sol!.min > 0) expect(calcHp(s, undefined, sol!.min - 1, inp).final).not.toBe(value)
    if (sol!.max < 100) expect(calcHp(s, undefined, sol!.max + 1, inp).final).not.toBe(value)
  })

  it('returns null for impossible values', () => {
    const inp = inputs({ level: 60 })
    expect(solveIV(1, (iv) => calcHp(s, undefined, iv, inp).final)).toBeNull()
    expect(solveIV(10 ** 6, (iv) => calcHp(s, undefined, iv, inp).final)).toBeNull()
  })
})
