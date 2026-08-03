/** Domain types for the combat power engine. Pure data — no React, no DOM. */

export type Role = 'dps' | 'support'

/** Per-role coefficient tables, as emitted by `tools/apps/lostark`. */
export interface RoleCoefficients {
  base_rate: number
  heal_rate?: number
  evolution_rate: number
  enlightenment_rate: number
  leap_rate: number
  leap_karma_rate?: number
  karma_stage_step: number
  combat_level_amp: Record<string, number>
  weapon_quality_amp?: Record<string, number>
  ark_core_values: Record<string, Record<string, number>>
  gem_option_values: Record<string, Record<string, number>>
  orb_values: Record<string, { points?: number; amp?: number; heal_amp?: number }>
}

/** Gear stats for one item level, keyed by piece id. */
export type GearByLevel = Record<string, Record<string, GearPiece>>

export interface GearPiece {
  main?: number
  vitality?: number
  weapon_attack?: number
  defence?: number
  resistance?: number
}

export interface CoreSelection {
  /** ArkGridCore id, or '' for an empty slot. */
  id: string
  /** Activated points. */
  points: number
}

/** Everything the user can set. Plain data so it serialises straight to JSON. */
export interface Loadout {
  role: Role
  combatLevel: number
  /** Item level driving the gear stat lookup. */
  itemLevel: number
  /** Armour group id (`[5-digit set][stat variant]`) — five slots share it. */
  armourGroup: string
  /** Weapon piece id at this item level. */
  weaponId: string
  /** Weapon quality 0-100. */
  weaponQuality: number
  arkEvolution: number
  arkEnlightenment: number
  arkLeap: number
  karmaEvolutionStage: number
  karmaLeapLevel: number
  cores: CoreSelection[]
  /** Paradise orb id, or '' for none. */
  orbId: string
}

export interface AmpRow {
  name: string
  value: number
}

export interface ScoreComponent {
  key: string
  label: string
  base: number
  amps: AmpRow[]
  score: number
}

export interface Result {
  components: ScoreComponent[]
  total: number
  mainStat: number
  weaponAttack: number
  baseAttack: number
  basicAttack: number
}
