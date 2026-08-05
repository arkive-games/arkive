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

import {
  STONE_BASIC,
  dpsEngravingBase,
  dpsEngravingBooks,
  dpsEngravingStones,
  supportEngravingBase,
  supportEngravingBooks,
  supportEngravingStones,
} from './fansite.generated'
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
 * UNLIKE every coefficient in `RoleCoefficients`, these are NOT sourced from the
 * game tables — they come from the reference fan site's reverse-engineering.
 *
 * Three searches failed to find them (2026-08-03): EFTable_BattlePoint carries
 * no row with 27722 or 1700; a scan of all 779 tables found 27722 only in
 * SummonNpcLevel, which is unrelated; and neither PCAdjustmentLevelStat (PvP
 * adjustment flags) nor CharInfoStatMinMax (stat clamps) holds a player base
 * vitality. 27722 is most likely a level-70 character's base Con, computed
 * rather than stored.
 *
 * Treat them as provisional: the heal score's shape is right, its absolute value
 * is only as good as these three numbers.
 */
const VITALITY_FLAT = 27722
const HP_FIXED_AMP = 0.17
const KARMA_EVOLUTION_HP = 400

/**
 * Paladin carries a higher vitality factor than the other supports. Keyed by
 * class id (105 HolyKnight, 113 HolyKnight_Female) so it follows the class
 * selector rather than a second control that could disagree with it.
 */
const PALADIN_CLASS_IDS = new Set([105, 113])
const PALADIN_VITALITY_FACTOR = 2.1
const DEFAULT_VITALITY_FACTOR = 2

/** The fields of an engraving that scoring needs. */
export type EngravingAmpSource = {
  slug: string
  amp: { dps: Record<string, number>; support: Record<string, number> }
  heal_amp: { dps: Record<string, number>; support: Record<string, number> }
}

/**
 * Engraving amp for one slot, from the client's own table.
 *
 * BattlePoint Type 10 keys the amps by a REWORKED ("S3") ability id rather than
 * the roster id, which is why an earlier pass concluded no Type was keyed by
 * engravings at all. `EFTable_AbilityMapping` joins the two.
 *
 * The grid is indexed by a growth code composing the stone and book dials:
 * `20 * stone + 1 + 4 * (grade - 2) + level`. The stone is a second independent
 * axis, NOT extra engraving levels, and the grid is exactly additive over the
 * two — verified at every checkable cell of all 31 grids.
 *
 * Returns 0 for the 15 general engravings the game grants no power: defensive
 * and utility ones genuinely score nothing.
 *
 * `channel` picks which BattlePoint type to read. Type 10 feeds the damage or
 * support SCORE; Type 11 is the separate heal channel and must feed the heal
 * component instead, exactly as the orb's heal amp does. Summing the two into
 * one number counted 妙手回春's heal amp as support score — and since that
 * engraving has no Type 10 cells at all, it inflated the wrong half of the
 * total and left the heal half untouched.
 */
export function engravingAmpFromClient(
  slot: { name: string; grade: number; book: number; stone: number },
  role: 'dps' | 'support',
  byName: Map<string, EngravingAmpSource>,
  channel: 'score' | 'heal' = 'score',
): number {
  if (!slot.name || !slot.grade) return 0
  const e = byName.get(slot.name)
  if (!e) return 0
  const code = String(20 * slot.stone + 1 + 4 * (slot.grade - 2) + slot.book)
  return (channel === 'heal' ? e.heal_amp[role][code] : e.amp[role][code]) ?? 0
}

/**
 * Engraving amp for one slot, fan-site sourced.
 *
 * Retained only for the values the client does not cover. Prefer
 * `engravingAmpFromClient`.
 */
export function engravingAmp(
  slot: { name: string; book: number; stone: number },
  role: 'dps' | 'support',
): number {
  if (!slot.name) return 0
  const num = (v: unknown) => (typeof v === 'number' ? v : 0)
  if (role === 'support') {
    // Support tables split each entry into support / heal channels; only the
    // support channel feeds the support score.
    const base = supportEngravingBase[slot.name as keyof typeof supportEngravingBase] as
      | { support: number }
      | undefined
    const book = supportEngravingBooks[slot.name as keyof typeof supportEngravingBooks] as
      | { support: number[] }
      | undefined
    const stone = supportEngravingStones[slot.name as keyof typeof supportEngravingStones] as
      | { support: number[] }
      | undefined
    return (
      num(base?.support) + num(book?.support?.[slot.book]) + num(stone?.support?.[slot.stone])
    )
  }
  const base = dpsEngravingBase[slot.name as keyof typeof dpsEngravingBase] as number | undefined
  const book = dpsEngravingBooks[slot.name as keyof typeof dpsEngravingBooks] as
    | number[]
    | undefined
  const stone = dpsEngravingStones[slot.name as keyof typeof dpsEngravingStones] as
    | number[]
    | undefined
  return num(base) + num(book?.[slot.book]) + num(stone?.[slot.stone])
}

/** Basic-attack bonus once total ability-stone levels reach the threshold. */
export function stoneBasic(engravings: { name: string; stone: number }[]): number {
  const total = engravings
    .filter((e) => e.name)
    .reduce((sum, e) => sum + e.stone, 0)
  return total >= STONE_BASIC.threshold ? STONE_BASIC.amp : 0
}

/** Just the fields of a bracelet line that scoring needs. */
export type BraceletAmp = { id: string; amp: { dps: number; support: number } }

/**
 * Bracelet line amp, from the client's own tables.
 *
 * The amps come from BattlePoint Types 19/20/21 joined to the option lines in
 * `ItemGradeOptionRandom`. That replaced a hand-copied fan-site table which was
 * a strict subset — the client reproduces all 45 of its values and adds 65 more,
 * and its heal column was half the game's amp with 0.0175 rounded to 0.017.
 *
 * Lines compound rather than sum, matching the reference's productAmp(...) - 1.
 */
export function braceletAmp(
  ids: string[],
  role: 'dps' | 'support',
  lines: BraceletAmp[],
): number {
  const byId = new Map(lines.map((l) => [l.id, l.amp[role]]))
  return ids.reduce((acc, id) => acc * (1 + (id ? (byId.get(id) ?? 0) : 0)), 1) - 1
}

/** Fields of an avatar option that scoring needs. */
export type AvatarAmpSource = { id: string; amp: number }

/**
 * Total avatar main-stat amp, from the client's own tables.
 *
 * NOT a combat-power coefficient, which is why no BattlePoint Type carries it
 * and the 35-member Type enum has no avatar member: the client's avatar bonus is
 * an `ItemGradeOptionStatic` addon on stat 7/8/9 -- the PERCENTAGE variants of
 * Str/Agi/Int -- so it scales `mainStat` before the attack formula.
 *
 * Ids are `<slot>-<grade>`. The amps are 0.005 / 0.01 / 0.02 by grade in all four
 * slots, exactly the set the fan site published.
 */
export function totalAvatarAmp(ids: string[], options: AvatarAmpSource[] = []): number {
  const byId = new Map(options.map((o) => [o.id, o.amp]))
  return ids.reduce((sum, id) => sum + (id ? (byId.get(id) ?? 0) : 0), 0)
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
export function buildAmps(
  loadout: Loadout,
  coeffs: RoleCoefficients,
  braceletLines: BraceletAmp[] = [],
  engravingsByName: Map<string, EngravingAmpSource> = new Map(),
): AmpRow[] {
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

  rows.push({
    name: '手镯',
    value: braceletAmp(loadout.braceletLines, loadout.role, braceletLines),
  })

  // Engravings compound, like gems and affix lines.
  const engProduct = loadout.engravings.reduce(
    (acc, e) => acc * (1 + engravingAmpFromClient(e, loadout.role, engravingsByName)),
    1,
  )
  rows.push({ name: '刻印效果', value: engProduct - 1 })

  // Combat stats: damage dealers count crit+spec+swift, supports spec+swift.
  // Combat traits, from BattlePoint Type 26 (`battlestat`). Both the rates and
  // the per-role split are the client's: a damage dealer scores 会心/专长/迅捷 at
  // 0.0003 a point, a support 专长/迅捷 at 0.0004. There is NO base -- ValueC is
  // zero on all five rows -- so `combatStats` holds the character's real totals
  // and the fan site's fixed 2160, which appears nowhere in 779 tables, is gone.
  rows.push({
    name: '战斗特性',
    value: Object.entries(coeffs.combat_stat_rates).reduce(
      (sum, [index, rate]) => sum + (loadout.combatStats[index] ?? 0) * rate,
      0,
    ),
  })

  // Affix lines each multiply independently, like gems.
  const lineProduct = loadout.accessoryLines.reduce(
    (acc, id) => acc * (1 + (id ? (coeffs.accessory_line_values[id] ?? 0) : 0)),
    1,
  )
  rows.push({ name: '首饰词条', value: lineProduct - 1 })

  // Each gem multiplies independently, so the group's combined amp is
  // product(1 + gem_i) - 1 rather than a plain sum.
  const gemProduct = loadout.gems.reduce((acc, g) => {
    const value = g.tier ? (coeffs.gem_values[g.tier]?.[String(g.level)] ?? 0) : 0
    return acc * (1 + value)
  }, 1)
  rows.push({ name: '宝石', value: gemProduct - 1 })

  rows.push({
    name: '神选武器',
    value: loadout.chosenWeaponId
      ? (coeffs.chosen_weapon_values[loadout.chosenWeaponId] ?? 0)
      : 0,
  })
  rows.push({
    name: '卡牌',
    value: loadout.cardSetId
      ? (coeffs.card_set_values[loadout.cardSetId]?.[String(loadout.cardStage)] ?? 0)
      : 0,
  })
  rows.push({
    name: '牧场',
    value: loadout.petRanchId ? (coeffs.pet_ranch_values[loadout.petRanchId] ?? 0) : 0,
  })

  const orb = loadout.orbId ? coeffs.orb_values[loadout.orbId] : undefined
  rows.push({ name: '乐园宝珠', value: orb?.amp ?? 0 })

  return rows
}

export function evaluate(
  loadout: Loadout,
  coeffs: RoleCoefficients,
  gear: GearByLevel,
  braceletLines: BraceletAmp[] = [],
  engravingsByName: Map<string, EngravingAmpSource> = new Map(),
  avatarOptions: AvatarAmpSource[] = [],
): Result {
  const mainStat =
    (gearMainTotal(gear, loadout.itemLevel, loadout.armourGroup) + MAIN_STAT_FLAT) *
    (1 + totalAvatarAmp(loadout.avatars, avatarOptions))
  const weaponAttack = weaponAttackOf(gear, loadout.itemLevel, loadout.weaponId)
  const baseAttack = round(Math.sqrt((weaponAttack * mainStat) / 6), 2)
  const basicAttack = baseAttack * (1 + stoneBasic(loadout.engravings))
  const amps = buildAmps(loadout, coeffs, braceletLines, engravingsByName)

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
  const factor = PALADIN_CLASS_IDS.has(loadout.classId)
    ? PALADIN_VITALITY_FACTOR
    : DEFAULT_VITALITY_FACTOR
  const maxHp =
    (vitality * factor + loadout.karmaEvolutionStage * KARMA_EVOLUTION_HP) *
    (1 + HP_FIXED_AMP)

  const orb = loadout.orbId ? coeffs.orb_values[loadout.orbId] : undefined
  // Engraving heal amps (BattlePoint Type 11) belong here, not in the support
  // score, for the same reason the orb's heal amp does. They compound like the
  // score-side engraving amps.
  const engHealProduct = loadout.engravings.reduce(
    (acc, e) => acc * (1 + engravingAmpFromClient(e, loadout.role, engravingsByName, 'heal')),
    1,
  )
  const healAmps: AmpRow[] = [{ name: '乐园宝珠', value: orb?.heal_amp ?? 0 }]
  if (engHealProduct !== 1) healAmps.push({ name: '刻印恢复', value: engHealProduct - 1 })

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
