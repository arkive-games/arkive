/**
 * Combat power engine. Pure: no React, no DOM, no storage, no i18n.
 *
 * Structure follows the game's own model, verified against EFTable_BattlePoint:
 *
 *   baseAttack  = sqrt(weaponAttack * mainStat / 6)
 *   basePower   = baseAttack * base_rate
 *   score       = basePower * product(1 + amp_i)
 *
 * Every amp is returned named and itemised so the composition panel can show a
 * breakdown, and so a wrong total is traceable to the row that caused it.
 */

import type {
  AmpRow,
  GearByLevel,
  Loadout,
  Result,
  RoleCoefficients,
  ScoreComponent,
} from './types'

/** Piece ids in EFTable_ItemLevelOption are per-slot; the weapon carries MaxDam. */
const MAIN_STAT_FLAT = 477

/**
 * Structural constants for the support heal component.
 *
 * UNLIKE every coefficient in `RoleCoefficients`, these are NOT yet sourced from
 * the game tables — they come from the reference fan site's reverse-engineering.
 * A search of EFTable_BattlePoint found no row carrying 27722 or 1700, so the
 * BattlePoint types that hold them are still undecoded (11-28 remain open).
 *
 * Treat them as provisional: the heal score's shape is right, its absolute value
 * is only as good as these three numbers.
 */
const VITALITY_FLAT = 27722
const HP_FIXED_AMP = 0.17
const KARMA_EVOLUTION_HP = 400

const SUPPORT_VITALITY_FACTOR: Record<string, number> = {
  bard: 2,
  paladin: 2.1,
}

export function round(value: number, digits = 2): number {
  return Number(value.toFixed(Math.max(0, Math.min(6, digits))))
}

export function productAmp(rows: AmpRow[]): number {
  return rows.reduce((acc, row) => acc * (1 + row.value), 1)
}

/**
 * Piece ids are `[5-digit set][stat variant][slot]`.
 *
 * At one item level the table holds several armour sets, each repeated once per
 * class main stat (Str / Agi / Int) with identical numbers. Summing every row
 * would count the same armour three times over, once per class, and then again
 * per set — so a group is `id.slice(0, 7)` and a wearable loadout is the five
 * armour slots within one group.
 */
export function armourGroups(gear: GearByLevel, itemLevel: number): string[] {
  const pieces = gear[String(itemLevel)]
  if (!pieces) return []
  const counts = new Map<string, number>()
  for (const [id, piece] of Object.entries(pieces)) {
    if (piece.main === undefined) continue
    const group = id.slice(0, 7)
    counts.set(group, (counts.get(group) ?? 0) + 1)
  }
  return [...counts.entries()]
    .filter(([, n]) => n === 5)
    .map(([group]) => group)
    .sort()
}

/** Sum one stat across the five armour slots of a group. */
function gearStatTotal(
  gear: GearByLevel,
  itemLevel: number,
  group: string,
  stat: 'main' | 'vitality',
): number {
  const pieces = gear[String(itemLevel)]
  if (!pieces) return 0
  return Object.entries(pieces).reduce(
    (total, [id, p]) => (id.startsWith(group) ? total + (p[stat] ?? 0) : total),
    0,
  )
}

/** Sum the main stat across the five armour slots of one group. */
export function gearMainTotal(
  gear: GearByLevel,
  itemLevel: number,
  group: string,
): number {
  return gearStatTotal(gear, itemLevel, group, 'main')
}

/** Sum vitality across the five armour slots of one group. */
export function gearVitalityTotal(
  gear: GearByLevel,
  itemLevel: number,
  group: string,
): number {
  return gearStatTotal(gear, itemLevel, group, 'vitality')
}

/** Weapon ids at this item level, with their attack values. */
export function weaponOptions(
  gear: GearByLevel,
  itemLevel: number,
): { id: string; attack: number }[] {
  const pieces = gear[String(itemLevel)]
  if (!pieces) return []
  return Object.entries(pieces)
    .filter(([, p]) => p.weapon_attack !== undefined)
    .map(([id, p]) => ({ id, attack: p.weapon_attack as number }))
    .sort((a, b) => a.id.localeCompare(b.id))
}

export function weaponAttackOf(
  gear: GearByLevel,
  itemLevel: number,
  weaponId: string,
): number {
  return gear[String(itemLevel)]?.[weaponId]?.weapon_attack ?? 0
}

/**
 * Build the amp rows for a loadout.
 *
 * Combat level and weapon quality are *table lookups*, not formulas — the game
 * parameterises both, and fitting a curve to them (as the reference fan site
 * does) is measurably wrong.
 */
export function buildAmps(loadout: Loadout, coeffs: RoleCoefficients): AmpRow[] {
  const rows: AmpRow[] = []

  rows.push({
    name: '战斗等级',
    value: coeffs.combat_level_amp[String(loadout.combatLevel)] ?? 0,
  })

  if (coeffs.weapon_quality_amp) {
    rows.push({
      name: '武器品质',
      value: coeffs.weapon_quality_amp[String(loadout.weaponQuality)] ?? 0,
    })
  }

  // Below 40 evolution points there is no bonus, and no penalty either.
  rows.push({
    name: '进化',
    value: Math.max(0, (loadout.arkEvolution - 40) * coeffs.evolution_rate),
  })
  rows.push({
    name: '顿悟',
    value: loadout.arkEnlightenment * coeffs.enlightenment_rate,
  })
  rows.push({ name: '飞跃', value: loadout.arkLeap * coeffs.leap_rate })
  rows.push({
    name: '进化业力',
    value: loadout.karmaEvolutionStage * coeffs.karma_stage_step,
  })
  if (coeffs.leap_karma_rate !== undefined) {
    rows.push({
      name: '飞跃业力',
      value: loadout.karmaLeapLevel * coeffs.leap_karma_rate,
    })
  }

  loadout.cores.forEach((core, index) => {
    // Keyed by option index (1-6), not by the point threshold the user picks.
    const byOption = core.id ? coeffs.ark_core_values[core.id] : undefined
    rows.push({
      name: `方舟核心 ${index + 1}`,
      value: byOption?.[String(core.optionIndex)] ?? 0,
    })
  })

  const orb = loadout.orbId ? coeffs.orb_values[loadout.orbId] : undefined
  rows.push({ name: '乐园宝珠', value: orb?.amp ?? 0 })

  return rows
}

export function evaluate(
  loadout: Loadout,
  coeffs: RoleCoefficients,
  gear: GearByLevel,
): Result {
  const mainStat = gearMainTotal(gear, loadout.itemLevel, loadout.armourGroup) + MAIN_STAT_FLAT
  const weaponAttack = weaponAttackOf(gear, loadout.itemLevel, loadout.weaponId)
  const baseAttack = round(Math.sqrt((weaponAttack * mainStat) / 6), 2)
  const basicAttack = baseAttack
  const amps = buildAmps(loadout, coeffs)

  const primary: ScoreComponent = {
    key: loadout.role,
    label: loadout.role === 'dps' ? '输出战斗力' : '支援战斗力',
    base: basicAttack * coeffs.base_rate,
    amps,
    score: 0,
  }
  primary.score = round(primary.base * productAmp(amps), 2)

  if (loadout.role !== 'support' || coeffs.heal_rate === undefined) {
    return {
      components: [primary],
      total: primary.score,
      mainStat,
      weaponAttack,
      baseAttack,
      basicAttack,
    }
  }

  // Support emits a SECOND component. Its amps are a different set from the
  // support-score amps -- the orb contributes a heal amp here rather than the
  // damage amp it contributes above.
  const vitality =
    gearVitalityTotal(gear, loadout.itemLevel, loadout.armourGroup) + VITALITY_FLAT
  const factor = SUPPORT_VITALITY_FACTOR[loadout.supportClass] ?? 2
  const maxHp =
    (vitality * factor + loadout.karmaEvolutionStage * KARMA_EVOLUTION_HP) *
    (1 + HP_FIXED_AMP)

  const orb = loadout.orbId ? coeffs.orb_values[loadout.orbId] : undefined
  const healAmps: AmpRow[] = [{ name: '乐园宝珠', value: orb?.heal_amp ?? 0 }]

  const heal: ScoreComponent = {
    key: 'heal',
    label: '恢复战斗力',
    base: maxHp * coeffs.heal_rate,
    amps: healAmps,
    score: 0,
  }
  heal.score = round(heal.base * productAmp(healAmps), 2)

  return {
    components: [primary, heal],
    // Each half is rounded BEFORE summing; rounding the total instead gives a
    // different answer.
    total: round(primary.score + heal.score, 2),
    mainStat,
    weaponAttack,
    baseAttack,
    basicAttack,
    maxHp,
  }
}
