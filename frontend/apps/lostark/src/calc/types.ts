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
  /** Chosen (神选) weapon id -> amp. Keyed by `ItemEvolutionCommon.EstherOptionId`. */
  chosen_weapon_values: Record<string, number>
  /**
   * Combat-trait index (1-6) -> combat power per point, from BattlePoint Type 26
   * (`battlestat`).
   *
   * Short by design: three entries for a damage dealer (会心 / 专长 / 迅捷 at
   * 0.0003) and two for a support (专长 / 迅捷 at 0.0004). A trait absent from the
   * map earns nothing — the client grants no rate for 压制 / 忍耐 / 异化 to either
   * role, and none for 会心 to a support.
   */
  combat_stat_rates: Record<string, number>
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
  /** Bracelet line ids, from the client's ItemGradeOptionRandom; '' for empty. */
  braceletLines: string[]
  /** Five engraving slots. */
  engravings: EngravingSlot[]
  /**
   * Avatar option ids for the four stat-bearing slots, in `AvatarMeta.slots` order
   * (head / upper body / lower body / weapon); '' for an empty slot.
   *
   * An id is `<slot key>-<Item.Grade>` (`head-4`), which is what
   * `avatars/options.json` keys its main-stat amps by. It used to be a tier NAME
   * copied from the fan site; the client carries the same three amps on the item
   * itself, so the ids are now the client's own slot-and-grade pairs.
   */
  avatars: string[]
  /**
   * Combat-trait (战斗特性) totals, keyed by the client's trait index 1-6.
   *
   * These are the character's WHOLE totals, as the game's own panel shows them —
   * not a roster-only delta on top of an assumed base. BattlePoint Type 26 carries
   * a per-point rate and no base at all (`ValueC` is zero on all five rows), so the
   * fan site's fixed 2160 was its own convenience and is gone.
   */
  combatStats: Record<string, number>
  /**
   * @deprecated Superseded by {@link combatStats}; delete with the engine patch.
   *
   * Kept only so `engine.ts` and `App.tsx` still compile while they are owned
   * elsewhere. Nothing new should read it — a `roster` number is a delta on top of
   * the fan site's invented 2160 base, and `combatStats` is the real total.
   */
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
  /**
   * Engraving name as keyed in the fan-site amp tables; '' for an empty slot.
   *
   * It stays the display NAME rather than an id because the amp map is keyed by
   * name. The amps ARE client-sourced — BattlePoint Type 10, reached through
   * EFTable_AbilityMapping's reworked ability id, which is why an earlier search
   * for AbilityEngrave ids found nothing. The picker offers the 43 general
   * engravings; class engravings are excluded, the rework having made them class
   * identities.
   */
  name: string
  /**
   * Engraving grade 1-4 (基本 / 英雄 / 传说 / 遗物), 0 for none.
   *
   * This DOES score: it is a term of the growth code
   * `20*stone + 1 + 4*(grade-2) + level`, so it selects the amp cell. Only the
   * ladder grades 2/3/4 are valid — grade 1 aliases onto cells the UI cannot
   * select, which is why parseLoadout rejects it.
   */
  grade: number
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
