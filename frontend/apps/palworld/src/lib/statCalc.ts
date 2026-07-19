import type { PalFriendship, PalStats } from './pals'

// Pal stat calculator. Implements the native-validated enhancement formula
// (docs/superpowers/specs/2026-07-19-palworld-stat-formula.md): awakening
// multiplies only the original species base, bond growth is folded in before
// IV/level scaling, and each stage truncates before the next multiplier
// (level/IV → condense → souls). Craft speed is level-independent with its
// own ×0.7 tribe multiplier and a hard-coded 10%/star condense bonus.

export const STAT_CONSTANTS = {
  talentRate: 0.003,
  tribePlusHP: 10,
  levelMulHP: 0.5,
  constHP: 500,
  levelMulAttack: 0.075,
  constAttack: 100,
  levelMulDefense: 0.075,
  constDefense: 50,
  condenseRate: 0.05,
  soulRate: 0.03,
  awakeningMul: 1.1,
  craftTribeMul: 0.7,
  craftCondenseRate: 0.1,
} as const

export const MAX_LEVEL = 100
export const MAX_IV = 100
export const MAX_STARS = 4
export const MAX_SOUL = 20
export const MAX_BOND = 10

/** Every enhancement knob except the per-stat IVs. */
export interface EnhanceInputs {
  level: number
  /** Condenser stars 0–4 (stored rank − 1). */
  stars: number
  /** Statue-of-Power soul ranks, 0–20 per stat. */
  soulHp: number
  soulAttack: number
  soulDefense: number
  soulCraft: number
  /** Trust/bond rank; negative ranks contribute nothing. */
  bond: number
  awake: boolean
}

export interface IVInputs {
  hp: number
  attack: number
  defense: number
}

export interface CombatStages {
  /** After level/IV scaling (first truncation). */
  s0: number
  /** After the condenser multiplier (second truncation). */
  s1: number
  /** After the soul multiplier (displayed value). */
  final: number
}
export interface CraftStages {
  /** floor(species base + bond growth). */
  base: number
  /** After the ×0.7 tribe multiplier. */
  s0: number
  s1: number
  final: number
}
export interface CalcResult {
  hp: CombatStages
  attack: CombatStages
  defense: CombatStages
  craft: CraftStages
}

// f64 rounding can land an exact stage boundary just below the integer
// (e.g. 4700 × 1.2); the guard is far below the formula's real fractional
// resolution (≥1e-8), so it only absorbs float error, never real fractions.
const fl = (x: number) => Math.floor(x + 1e-9)

function combat(
  base: number,
  bondGrowth: number,
  iv: number,
  soul: number,
  inp: EnhanceInputs,
  levelMul: number,
  constant: number,
  plus: number,
): CombatStages {
  const c = STAT_CONSTANTS
  const f = Math.max(inp.bond, 0)
  const b = base * (inp.awake ? c.awakeningMul : 1) + bondGrowth * f
  const s0 = fl((b * (1 + iv * c.talentRate) + plus) * levelMul * inp.level + constant)
  const s1 = fl(s0 * (1 + inp.stars * c.condenseRate))
  const final = fl(s1 * (1 + soul * c.soulRate))
  return { s0, s1, final }
}

export function calcHp(stats: PalStats, friendship: PalFriendship | undefined, iv: number, inp: EnhanceInputs): CombatStages {
  const c = STAT_CONSTANTS
  return combat(stats.hp, friendship?.hp ?? 0, iv, inp.soulHp, inp, c.levelMulHP, c.constHP, c.tribePlusHP)
}
/** Attack: in this build the melee accessor tail-jumps to the shot-attack
 *  calculation, so a single Attack value covers both. */
export function calcAttack(stats: PalStats, friendship: PalFriendship | undefined, iv: number, inp: EnhanceInputs): CombatStages {
  const c = STAT_CONSTANTS
  return combat(stats.shotAttack, friendship?.shotAttack ?? 0, iv, inp.soulAttack, inp, c.levelMulAttack, c.constAttack, 0)
}
export function calcDefense(stats: PalStats, friendship: PalFriendship | undefined, iv: number, inp: EnhanceInputs): CombatStages {
  const c = STAT_CONSTANTS
  return combat(stats.defense, friendship?.defense ?? 0, iv, inp.soulDefense, inp, c.levelMulDefense, c.constDefense, 0)
}
/** Craft speed has no IV and no awakening; each stage truncates. */
export function calcCraft(stats: PalStats, friendship: PalFriendship | undefined, inp: EnhanceInputs): CraftStages {
  const c = STAT_CONSTANTS
  const f = Math.max(inp.bond, 0)
  const base = fl(stats.craftSpeed + (friendship?.craftSpeed ?? 0) * f)
  const s0 = fl(base * c.craftTribeMul)
  const s1 = fl(s0 * (1 + inp.stars * c.craftCondenseRate))
  const final = fl(s1 * (1 + inp.soulCraft * c.soulRate))
  return { base, s0, s1, final }
}

export function calcStats(
  stats: PalStats,
  friendship: PalFriendship | undefined,
  iv: IVInputs,
  inp: EnhanceInputs,
): CalcResult {
  return {
    hp: calcHp(stats, friendship, iv.hp, inp),
    attack: calcAttack(stats, friendship, iv.attack, inp),
    defense: calcDefense(stats, friendship, iv.defense, inp),
    craft: calcCraft(stats, friendship, inp),
  }
}

/** Contiguous IV range (stats are monotonic in IV, so several IVs can share
 *  one displayed value at low levels). */
export interface IVSolution {
  min: number
  max: number
}

/** All IVs 0–100 whose computed stat equals `observed`, or null if none. */
export function solveIV(observed: number, statForIv: (iv: number) => number): IVSolution | null {
  let min = -1
  let max = -1
  for (let iv = 0; iv <= MAX_IV; iv++) {
    const v = statForIv(iv)
    if (v === observed) {
      if (min < 0) min = iv
      max = iv
    } else if (min >= 0) {
      break
    }
  }
  return min < 0 ? null : { min, max }
}

export interface IVSolveResult {
  hp: IVSolution | null
  attack: IVSolution | null
  defense: IVSolution | null
  /** Craft speed has no IV — the expected value doubles as a settings check. */
  craftExpected: number
}

export function solveIVs(
  stats: PalStats,
  friendship: PalFriendship | undefined,
  observed: { hp?: number; attack?: number; defense?: number },
  inp: EnhanceInputs,
): IVSolveResult {
  return {
    hp: observed.hp === undefined ? null : solveIV(observed.hp, (iv) => calcHp(stats, friendship, iv, inp).final),
    attack:
      observed.attack === undefined
        ? null
        : solveIV(observed.attack, (iv) => calcAttack(stats, friendship, iv, inp).final),
    defense:
      observed.defense === undefined
        ? null
        : solveIV(observed.defense, (iv) => calcDefense(stats, friendship, iv, inp).final),
    craftExpected: calcCraft(stats, friendship, inp).final,
  }
}
