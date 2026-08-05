import type { GearByLevel, RoleCoefficients } from '@/calc/types'

const DATA_BASE = import.meta.env.VITE_DATA_BASE_URL ?? '/data'

let dataVersion: string | undefined

/** URL of a data-artifact file, cache-busted by the artifact version. */
export function dataUrl(path: string): string {
  const url = `${DATA_BASE}/${path}`
  return dataVersion ? `${url}?v=${dataVersion}` : url
}

async function json<T>(path: string): Promise<T> {
  const r = await fetch(dataUrl(path))
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`)
  return (await r.json()) as T
}

export interface DataVersion {
  source: string
  generatedAt: string
  locales: string[]
  counts: { itemLevels: number; arkCores: number; localeKeys: number }
  droppedArkCoreValues: Record<string, number>
}

export interface CoreMeta {
  group_id: number
  grade: number
  gem_slot_point: number
  category_key: string
  name_key: string
  /** Option index (1-6) -> activated-point threshold that unlocks it. */
  option_points: Record<string, number>
}

export interface PlayerSubclass {
  ability_id: number
  name_key: string
  /** Support sub-classes take the heal component. */
  role: 'dps' | 'support'
}

export interface PlayerClass {
  id: number
  base_class: number
  internal_name: string
  name_key: string | null
  subclasses: PlayerSubclass[]
}

export interface ArkGridGrade {
  core_id: string
  /** GameMsg key for the grade name (英雄 / 传说 / 遗物 / 古代). */
  name_key: string
  /** Option index (1-6) -> activated-point threshold. Irregular by design. */
  points: Record<string, number>
  /** Option index -> GameMsg key of the resolved effect description. */
  options: Record<string, string>
  /** False for utility variants with no BattlePoint row; their amp is zero. */
  scores: boolean
}

export interface ArkGridVariant {
  name_key: string
  grades: Record<string, ArkGridGrade>
}

export interface ArkGridSlot {
  key: string
  name_key: string
  /** Frame index in the EFUI_ICONATLAS_* sprite sheet (96-101). */
  icon_index: number | null
  /** Chaos slots are shared across classes and keyed "0". */
  class_agnostic: boolean
  /** Class id (or "0") -> the six cores that class can equip here. */
  by_class: Record<string, ArkGridVariant[]>
}

/**
 * One of the three Ark Passive trees.
 *
 * `rank_scores` / `level_scores` are stated rather than inferred: BattlePoint
 * Type 8 keys off the evolution rank and Type 9 off the leap level, and
 * Enlightenment has neither, so the cards must not offer all three the same
 * dials.
 */
export interface ArkPassiveTree {
  key: 'evolution' | 'enlightenment' | 'leap'
  group: number
  name_key: string
  karma_name_key: string
  /** The client's own colour for this tree, from `tip.name.karma_<tree>01`. */
  colour: string
  /** Medallion tiers available on the `use_12` sheet. */
  tiers: number
  rank_scores: boolean
  level_scores: boolean
}

export interface ArkPassiveMeta {
  trees: ArkPassiveTree[]
  uiKeys: Record<string, string>
}

/**
 * One selectable bracelet option line, from `ItemGradeOptionRandom` filtered to
 * the `sys.bracelet.*` groups.
 *
 * `amp` is 0 for the many lines that grant no combat power (utility rolls).
 * `name_key` is null for the eight stat ids the client resolves in code rather
 * than in any table — those ship unnamed instead of with an invented label.
 */
export interface BraceletLine {
  id: string
  group_key: 'basic' | 'combat_trait' | 'engraving' | 'special'
  /** ItemGradeOptionRandom.Type: 2 stat, 3 ability, 4 combat effect, 54/59 amplify. */
  option_type: number
  stat: number | null
  effect_id: string | null
  /** Percent x 100 for rate lines; flat otherwise. */
  value: number
  /** BraceletOptionGrade values seen; NOT unique per line. */
  grades: number[]
  /** Bracelet tiers (3, 4) whose pools offer this line. */
  tiers: number[]
  name_key: string | null
  amp: { dps: number; support: number }
}

export interface BraceletMeta {
  groups: { key: string; name_key: string }[]
  /** The three groups every shipped bracelet pool offers. */
  columns: string[]
  uiKeys: Record<string, string>
  lines: BraceletLine[]
  unnamedStats: number[]
}

/**
 * One engraving, from `AbilityEngrave` joined to `Ability`.
 *
 * The join is authoritative, NOT `Ability.IsEngraveAbility` — that flag is true
 * for 163 ids, 68 of which have no `AbilityEngrave` row (retired engravings).
 *
 * `icon_slug` is the file name under `public/engravings/`, or null for the seven
 * whose atlas group ships no texture at all — render a placeholder rather than
 * requesting a file that does not exist.
 *
 * `role` is null for general engravings: the client marks no engraving as damage
 * or support, so only class engravings inherit one from their sub-class.
 */
export interface Engraving {
  slug: string
  /** AbilityEngrave.Type: 1 general (five levels), 2 class (four levels). */
  type: 1 | 2
  class_id: number | null
  name_key: string
  /** Four of these still hold unresolved template directives; check before showing. */
  desc_key: string | null
  icon: string
  icon_index: number
  icon_slug: string | null
  /** Level ("1".."5") -> engraving points it costs. */
  levels: Record<string, number>
  /**
   * Always null now that the roster is general engravings only — the client
   * marks no general engraving as damage or support. Which channel one scores
   * through is decided by whether it has a dps or support amp grid.
   */
  role: 'dps' | 'support' | null
  /** The reworked ("S3") ability id the amps are keyed by. */
  reworked_id: string | null
  /**
   * Combat power per growth code, from BattlePoint Type 10.
   *
   * Empty per role where the game grants none — a defensive engraving scores
   * nothing, and that is data rather than a gap. The grid is exactly additive
   * over its stone and book axes.
   */
  amp: { dps: Record<string, number>; support: Record<string, number> }
  /** The support heal channel, BattlePoint Type 11; only 妙手回春 has one. */
  heal_amp: { dps: Record<string, number>; support: Record<string, number> }
}

export interface EngravingGrade {
  grade: number
  key: 'basic' | 'epic' | 'legend' | 'relic'
  name_key: string
}

export interface EngravingMeta {
  grades: EngravingGrade[]
  /** Grade number -> GameMsg key wrapping a name in that grade's colour. */
  gradeColourKeys: Record<string, string>
  uiKeys: Record<string, string>
  engravings: Record<string, Engraving>
  /** Book grades on the growth ladder, in order: 2 epic, 3 legend, 4 relic. */
  bookGrades: number[]
  bookMaxLevel: number
  stoneMaxLevel: number
  channels: Record<string, string>
  /** The four penalty engravings a stone can carve. */
  stonePenalties: {
    ability_id: string
    slug: string
    name_key: string
    amp: { dps: Record<string, number>; support: Record<string, number> }
  }[]
  /**
   * Flat bonus once total stone levels reach `threshold`.
   *
   * A RAW STAT, not an amp: the client grants stat 150, which has no name in any
   * table and no BattlePoint Type keyed to it. The fan site claims 0.015 combat
   * power for it; that is uncorroborated, so it is not scored here.
   */
  stoneLevelBonus: {
    threshold: number
    option_id: string
    by_grade: Record<string, { option_type: number; stat: number; value: number }>
  }
}

/**
 * The growth code an (stone, grade, level) triple maps to.
 *
 * `code = 20 * stone + 1 + 4 * (grade - 2) + level`, with grade 2/3/4 =
 * epic/legend/relic. Spelled out by the client's own Comment2 notes on the
 * BattlePoint rows.
 */
export function growthCode(stone: number, grade: number, level: number): number {
  return 20 * stone + 1 + 4 * (grade - 2) + level
}

export interface Dataset {
  version: DataVersion
  dps: RoleCoefficients
  support: RoleCoefficients
  gear: GearByLevel
  cores: Record<string, CoreMeta>
  slots: { dps: ArkGridSlot[]; support: ArkGridSlot[] }
  arkPassive: ArkPassiveMeta
  bracelets: BraceletMeta
  engravings: EngravingMeta
  classes: PlayerClass[]
  names: Record<string, string>
}

/**
 * Load everything the calculator needs.
 *
 * `version.json` is fetched first and un-cached so the rest can be cache-busted
 * by its stamp; if it is missing the other URLs stay bare, which still works,
 * just without long-term caching.
 */
export async function loadDataset(locale = 'zh-CN'): Promise<Dataset> {
  try {
    const r = await fetch(`${DATA_BASE}/version.json`, { cache: 'no-cache' })
    if (r.ok) {
      const body = (await r.json()) as { generatedAt?: unknown }
      if (typeof body.generatedAt === 'string') dataVersion = body.generatedAt
    }
  } catch {
    /* unversioned artifact or unreachable — fall back to bare URLs */
  }

  const [
    version,
    dps,
    support,
    gear,
    cores,
    slots,
    arkPassive,
    bracelets,
    engravings,
    classes,
    names,
  ] = await Promise.all([
      json<DataVersion>('version.json'),
      json<RoleCoefficients>('battlepoint/dps.json'),
      json<RoleCoefficients>('battlepoint/support.json'),
      json<GearByLevel>('gear/item-levels.json'),
      json<Record<string, CoreMeta>>('arkgrid/cores.json'),
      json<{ dps: ArkGridSlot[]; support: ArkGridSlot[] }>('arkgrid/slots.json'),
      json<ArkPassiveMeta>('arkpassive/trees.json'),
      json<BraceletMeta>('bracelets/options.json'),
      json<EngravingMeta>('engravings/list.json'),
      json<PlayerClass[]>('classes.json'),
      json<Record<string, string>>(`locales/${locale}.json`),
    ])

  return {
    version,
    dps,
    support,
    gear,
    cores,
    slots,
    arkPassive,
    bracelets,
    engravings,
    classes,
    names,
  }
}
