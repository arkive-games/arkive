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

export interface Dataset {
  version: DataVersion
  dps: RoleCoefficients
  support: RoleCoefficients
  gear: GearByLevel
  cores: Record<string, CoreMeta>
  slots: { dps: ArkGridSlot[]; support: ArkGridSlot[] }
  arkPassive: ArkPassiveMeta
  bracelets: BraceletMeta
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

  const [version, dps, support, gear, cores, slots, arkPassive, bracelets, classes, names] =
    await Promise.all([
      json<DataVersion>('version.json'),
      json<RoleCoefficients>('battlepoint/dps.json'),
      json<RoleCoefficients>('battlepoint/support.json'),
      json<GearByLevel>('gear/item-levels.json'),
      json<Record<string, CoreMeta>>('arkgrid/cores.json'),
      json<{ dps: ArkGridSlot[]; support: ArkGridSlot[] }>('arkgrid/slots.json'),
      json<ArkPassiveMeta>('arkpassive/trees.json'),
      json<BraceletMeta>('bracelets/options.json'),
      json<PlayerClass[]>('classes.json'),
      json<Record<string, string>>(`locales/${locale}.json`),
    ])

  return { version, dps, support, gear, cores, slots, arkPassive, bracelets, classes, names }
}
