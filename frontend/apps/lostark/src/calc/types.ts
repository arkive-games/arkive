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
  /** Gem tier -> level -> amp. */
  gem_values: Record<string, Record<string, number>>
  /** Accessory affix effect id -> amp. */
  accessory_line_values: Record<string, number>
  /** Card set id -> awakening stage -> amp. */
  card_set_values: Record<string, Record<string, number>>
  /** Pet ranch tier id -> amp. */
  pet_ranch_values: Record<string, number>
  /** Chosen (神选) weapon id -> amp. */
  chosen_weapon_values: Record<string, number>
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
  /**
   * Option index 1-6, NOT a point total. BattlePoint Type 29 is keyed by this
   * index; `CoreMeta.option_points` maps it to the point threshold shown to the
   * user. 0 means no option activated.
   */
  optionIndex: number
}

/** Everything the user can set. Plain data so it serialises straight to JSON. */
export interface Loadout {
  /** Player class id, driving core lists and gear names. */
  classId: number
  /** Index into that class's two sub-classes; decides dps vs support. */
  subclassIndex: number
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
  /**
   * Accessory affix lines: five accessories (necklace, 2 earrings, 2 rings)
   * with three lines each. Values are effect ids into accessory_line_values.
   */
  accessoryLines: string[]
  /** Equipped gems: tier and level per slot. Up to 11 in game. */
  gems: GemSlot[]
  /** Bracelet line ids (fan-site sourced); '' for an empty slot. */
  braceletLines: string[]
  /** Five engraving slots. */
  engravings: EngravingSlot[]
  /** Avatar tiers for head / top / bottom / weapon. */
  avatars: string[]
  /** Roster (远征队) combat stats, added to the 战斗特性 base. */
  roster: { crit: number; spec: number; swift: number }
  /** Chosen weapon id, or '' for a normal weapon. */
  chosenWeaponId: string
  /** Card set id, or '' for none. */
  cardSetId: string
  /** Awakening stage 1-6; 0 for none. */
  cardStage: number
  /** Pet ranch tier id, or '' for none. */
  petRanchId: string
  /** Paradise orb id, or '' for none. */
  orbId: string
}

export interface EngravingSlot {
  /** Engraving name as keyed in the fan-site tables; '' for an empty slot. */
  name: string
  /** Relic book stage 0-4. */
  book: number
  /** Ability stone level 0-4. */
  stone: number
}

export interface GemSlot {
  /** Gem tier ('3' or '4'); '' for an empty slot. */
  tier: string
  /** Gem level 1-10. */
  level: number
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
  /** One component for damage dealers; two (support + heal) for supports. */
  components: ScoreComponent[]
  /** Sum of each component's ALREADY-ROUNDED score. */
  total: number
  mainStat: number
  weaponAttack: number
  baseAttack: number
  basicAttack: number
  /** Support only. */
  maxHp?: number
}
