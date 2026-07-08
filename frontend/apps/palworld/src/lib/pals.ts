import type { GameMapMeta } from '@gamemap/data-contract'
import { DATA_BASE } from './urls'

// --- enums (kept in sync with tools/palworld/encyclopedia.py) ----------------
export type Element =
  | 'Normal' | 'Fire' | 'Water' | 'Leaf' | 'Electricity'
  | 'Ice' | 'Earth' | 'Dark' | 'Dragon'
export type WorkType =
  | 'EmitFlame' | 'Watering' | 'Seeding' | 'GenerateElectricity' | 'Handcraft'
  | 'Collection' | 'Deforest' | 'Mining' | 'OilExtraction' | 'ProductMedicine'
  | 'Cool' | 'Transport' | 'MonsterFarm'

export const ELEMENTS: Element[] = [
  'Normal', 'Fire', 'Water', 'Leaf', 'Electricity', 'Ice', 'Earth', 'Dark', 'Dragon',
]
export const WORK_TYPES: WorkType[] = [
  'EmitFlame', 'Watering', 'Seeding', 'GenerateElectricity', 'Handcraft',
  'Collection', 'Deforest', 'Mining', 'OilExtraction', 'ProductMedicine',
  'Cool', 'Transport', 'MonsterFarm',
]

/** Wild encounter reaction (raw `AIResponse`, 遭遇反応). Ordered most→least
 *  hostile; the filter only shows values present in the loaded roster. */
export const REACTIONS = [
  'Warlike', 'Warlike_Anyway', 'Warlike_WithoutPlayer', 'Kill_All',
  'Escape_to_Battle', 'NotInterested', 'Escape', 'Friendly', 'Boss', 'None',
] as const
export type Reaction = (typeof REACTIONS)[number]

// --- data shapes (mirror pals.json / passives.json) --------------------------
export interface PalStats {
  hp: number; meleeAttack: number; shotAttack: number; defense: number
  craftSpeed: number; stamina: number; foodAmount: number; maxFullStomach: number
  captureRate: number; price: number; maleProbability: number
  walkSpeed: number; runSpeed: number; rideSprintSpeed: number; transportSpeed: number
}
export interface ActiveSkill {
  wazaId: string; level: number; element: string; category: string
  power: number; coolTime: number
  /** Attack range in raw world units (cm; ÷100 = metres). 0 when the skill has none. */
  minRange: number; maxRange: number
}
/** One buff effect of a partner skill: effect type, target, and per-rank values. */
export interface PartnerEffect { type: string; target: string; values: number[] }
/** Fixed metadata of an action-type partner skill (from DT_PartnerSkill). */
export interface PartnerAction {
  effectTime: number
  coolTime: number
  execCost: number
  idleCost: number
  toggle: boolean
  canChangeWeapon?: boolean
  canThrowPal?: boolean
}
/** A partner skill in one of three shapes (see tools/palworld/encyclopedia.py):
 *  - attack: `wazaId`/`element` + per-rank `rankValues` (power multiplier).
 *  - buff:   `effects` (each with per-rank `values`).
 *  - action: `action` metadata + optional per-rank `rankValues` / `coolTimeByRank`
 *            / `effectTimeByRank`.
 *  Any shape may carry `unlockItem`. The name always comes from the locale. */
export interface PartnerSkill {
  wazaId?: string
  element?: string
  rankValues?: number[]
  coolTimeByRank?: number[]
  effectTimeByRank?: number[]
  unlockItem?: string
  effects?: PartnerEffect[]
  action?: PartnerAction
}
export interface Drop { item: string; rate: number; min: number; max: number }

export interface PalEntry {
  id: string
  zukanIndex: number
  zukanIndexSuffix: string
  icon: string
  elements: Element[]
  genus: string
  size: string
  rarity: number
  nocturnal: boolean
  reaction: string
  stats: PalStats
  work: Partial<Record<WorkType, number>>
  bestWork: WorkType
  partnerSkill: PartnerSkill
  activeSkills: ActiveSkill[]
  passives: string[]
  drops: Drop[]
  /** True when the pal is obtained at the Summoning Altar (DT_PalRaidBoss). */
  summonable: boolean
  /** Materials + counts to craft this pal's summon item (only when summonable). */
  summonMaterials?: { item: string; count: number }[]
}

export interface PassiveEffect { type: string; value: number; target: string }
export interface Passive { id: string; rank: number; effects: PassiveEffect[] }

// --- locale shapes -----------------------------------------------------------
export interface PalText {
  name: string
  description: string
  partnerSkill?: { name: string; desc?: string }
}
export interface SkillText { name: string; description?: string }
/** Item-name locale entry (catalog.py shape). We use only `name` in pal views. */
interface ItemText { name: string; description?: string }
export interface EnumsLocale {
  elements: Record<string, string>
  work: Record<string, string>
}

// --- loaders -----------------------------------------------------------------
const j = async <T>(url: string): Promise<T> => {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${url}: ${r.status}`)
  return r.json() as Promise<T>
}

export interface PalsBundle {
  pals: PalEntry[]
  byId: Map<string, PalEntry>
  /** palId -> localized name/description/partner-skill. */
  text: Record<string, PalText>
  passives: Passive[]
  passivesById: Map<string, Passive>
  passiveText: Record<string, SkillText>
  skills: Record<string, SkillText>
  /** itemId -> localized name (from the shared items locale; description omitted here). */
  items: Record<string, string>
  /** itemId -> icon asset name (only for items whose icon texture was exported). */
  itemIcon: Record<string, string>
  enums: EnumsLocale
  /** partner-skill effect type -> localized label (fallback lang -> en-US -> raw enum). */
  partnerEffects: Record<string, string>
  /** partner-skill effect target -> localized label (same fallback). */
  partnerTargets: Record<string, string>
}

const cache = new Map<string, Promise<PalsBundle>>()

async function fetchBundle(lng: string): Promise<PalsBundle> {
  const [palsFile, passivesFile, itemsFile, text, passiveText, skills, itemsLoc, enums, partnerEffects, partnerTargets] = await Promise.all([
    j<{ pals: PalEntry[] }>(`${DATA_BASE}/pals.json`),
    j<{ passives: Passive[] }>(`${DATA_BASE}/passives.json`),
    j<{ items: { id: string; icon?: string }[] }>(`${DATA_BASE}/items.json`),
    j<Record<string, PalText>>(`${DATA_BASE}/locales/${lng}/pals.json`),
    j<Record<string, SkillText>>(`${DATA_BASE}/locales/${lng}/passives.json`),
    j<Record<string, SkillText>>(`${DATA_BASE}/locales/${lng}/skills.json`),
    // Item names come from catalog.py's file, shape {id: {name, description?}};
    // we flatten it to {id: name} below since pal views only need the name.
    j<Record<string, ItemText>>(`${DATA_BASE}/locales/${lng}/items.json`),
    j<EnumsLocale>(`${DATA_BASE}/locales/${lng}/enums.json`),
    j<Record<string, string>>(`${DATA_BASE}/locales/${lng}/partnerEffects.json`),
    j<Record<string, string>>(`${DATA_BASE}/locales/${lng}/partnerTargets.json`),
  ])
  const itemIcon: Record<string, string> = {}
  for (const it of itemsFile.items) if (it.icon) itemIcon[it.id] = it.icon
  // Flatten catalog's {id: {name, description?}} to {id: name} for pal views.
  const items: Record<string, string> = {}
  for (const [id, v] of Object.entries(itemsLoc)) items[id] = v.name
  return {
    pals: palsFile.pals,
    byId: new Map(palsFile.pals.map((p) => [p.id, p])),
    text,
    passives: passivesFile.passives,
    passivesById: new Map(passivesFile.passives.map((p) => [p.id, p])),
    passiveText,
    skills,
    items,
    itemIcon,
    enums,
    partnerEffects,
    partnerTargets,
  }
}

/** Load (and cache per language) the full encyclopedia dataset. */
export function loadPals(lng: string): Promise<PalsBundle> {
  let p = cache.get(lng)
  if (!p) {
    p = fetchBundle(lng)
    cache.set(lng, p)
  }
  return p
}

// --- spawn markers (for the embedded per-pal map) ---------------------------
/**
 * A pal's spawn point on one map. `count` (>1) marks a pre-clustered point;
 * `level` is that spawn's localized level range (e.g. "Lv.1–3"), read from the
 * marker locale — the same string the main map shows.
 */
/** A spawn point's origin: a normal wild encounter, or a (field/alpha) boss. */
export type SpawnKind = 'wild' | 'boss'
export interface SpawnPoint { x: number; y: number; count?: number; level?: string; kind: SpawnKind }
export interface PalSpawns { map: GameMapMeta; points: SpawnPoint[] }

interface SpawnMarker { id: string; subtype: string; x: number; y: number; count?: number; pal?: string }

// Boss markers share one subtype per boss kind (not a pal id); they carry a
// `pal` field linking back to the catchable pal (emitted by tools/…/emit.py).
const BOSS_SUBTYPES = new Set(['fieldBoss', 'predator'])

/**
 * Every map on which `palId` appears, with that pal's spawn points. Reuses the
 * markers already in `markers/<map>.json`: wild encounters use the pal id as
 * `subtype`; alpha/field bosses use a boss `subtype` plus a `pal` field. Maps
 * with no points are omitted. Points are the data's pre-clustered markers
 * rendered individually (no further clustering). The per-marker label comes from
 * the `<lng>` marker locale — wild points use `description` (level range), boss
 * points use `name` (already "`<Name> Lv.<n>`"); missing locale ⇒ label omitted.
 */
export async function loadPalSpawns(palId: string, lng: string): Promise<PalSpawns[]> {
  const { maps } = await j<{ maps: GameMapMeta[] }>(`${DATA_BASE}/maps.json`)
  const per = await Promise.all(
    maps.map(async (map) => {
      const [{ markers }, loc] = await Promise.all([
        j<{ markers: SpawnMarker[] }>(`${DATA_BASE}/markers/${map.id}.json`),
        j<Record<string, { name?: string; description?: string }>>(
          `${DATA_BASE}/locales/${lng}/markers/${map.id}.json`,
        ).catch(() => ({}) as Record<string, { name?: string; description?: string }>),
      ])
      const points: SpawnPoint[] = []
      for (const m of markers) {
        const isBoss = BOSS_SUBTYPES.has(m.subtype) && m.pal === palId
        const isWild = m.subtype === palId
        if (!isBoss && !isWild) continue
        const label = loc[m.id]
        points.push({
          x: m.x,
          y: m.y,
          count: m.count,
          level: isBoss ? label?.name : label?.description,
          kind: isBoss ? 'boss' : 'wild',
        })
      }
      // Wild first, boss last, so boss markers render on top of overlapping wild ones.
      points.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'wild' ? -1 : 1))
      return { map, points }
    }),
  )
  return per.filter((p) => p.points.length > 0)
}

// Game locale text embeds pal-name placeholders like `<characterName id=|Anubis|/>`
// that the client is expected to substitute with the referenced pal's localized name.
const CHARACTER_NAME_RE = /<characterName\s+id=\|([^|]+)\|\s*\/>/g

/** Replace `<characterName id=|X|/>` placeholders with pal X's localized name. */
export function resolveCharacterNames(
  s: string | undefined,
  text: Record<string, PalText>,
): string {
  if (!s) return ''
  return s.replace(CHARACTER_NAME_RE, (_m, id: string) => text[id]?.name ?? id)
}

/** Localized name for a passive/active waza description with `{EffectValue1}`-style
 *  placeholders resolved from the passive's effect values. */
export function fillPassiveDesc(desc: string | undefined, passive: Passive | undefined): string {
  if (!desc) return ''
  if (!passive) return desc
  return desc.replace(/\{EffectValue(\d)\}/g, (_m, n: string) => {
    const eff = passive.effects[Number(n) - 1]
    return eff ? String(eff.value) : ''
  })
}

// Concise labels for the common passive effect types (see passives.json). The
// game ships no description text for ~21 stat-modifier passives, so we
// synthesize one from the effects. Element attack/resist and a few families are
// handled by pattern below; the long tail falls back to a humanized type name.
// Labels are English (the passive *name* stays localized); element names are
// localized via the enums locale.
const EFFECT_LABEL: Record<string, string> = {
  CraftSpeed: 'Work Speed',
  Defense: 'Defense',
  ShotAttack: 'Attack',
  MaxHP: 'Max HP',
  MoveSpeed: 'Move Speed',
  SwimSpeed: 'Swim Speed',
  LifeSteal: 'Life Steal',
  Mining: 'Mining',
  Logging: 'Logging',
  BreedSpeed: 'Breeding Speed',
  BreedSpeed_InBaseCamp: 'Ranch Breeding Speed',
  PalEggHatchingSpeed: 'Egg Hatching Speed',
  ActiveSkillCoolTime_Decrease: 'Skill Cooldown',
  PalSP_Increase: 'Partner Skill Gauge',
  FullStomatch_Decrease: 'Hunger Rate',
  Sanity_Decrease: 'Sanity Loss',
  ShopSellPrice_Money_Increase: 'Sell Price',
  ShopBuyPrice_Money_Increase: 'Buy Price',
  AutoHPRegeneRate: 'HP Regen',
  RideJumpCount_Increase: 'Ride Jumps',
  ExplosionResist: 'Explosion Resistance',
  Nocturnal: 'Nocturnal',
  NightOwl: 'Night Owl',
  NonKilling: 'Non-Lethal Captures',
  WorldTreeDecayImmunity: 'World Tree Decay Immunity',
  LeanBackInvalid_ForPassiveSkill: 'Flinch Immunity',
  KnockbackInvalid_ForPassiveSkill: 'Knockback Immunity',
  ReloadSpeedUp: 'Reload Speed',
  PlayerSP_DecreaseRate: 'Stamina Drain',
  SelfDeathAddItemDrop: 'Extra Drops on Death',
  WorkSuitabilityAddRank_MonsterFarm: 'Ranch Work Suitability',
}

/** Turn a raw effect `type` into a readable label when it has no curated entry. */
function humanizeEffectType(type: string): string {
  return type
    .replace(/_ForPassiveSkill$/, '')
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\w/, (c) => c.toUpperCase())
}

function effectTypeLabel(type: string, enums: EnumsLocale): string {
  const boost = /^ElementBoost_(\w+)$/.exec(type)
  if (boost) return `${enums.elements[boost[1]] ?? boost[1]} Attack`
  const resist = /^ElementResist_(\w+)$/.exec(type)
  if (resist) return `${enums.elements[resist[1]] ?? resist[1]} Resistance`
  const addl = /^ResistAdditionalEffect_(\w+)$/.exec(type)
  if (addl) return `${addl[1]} Resistance`
  return EFFECT_LABEL[type] ?? humanizeEffectType(type)
}

/**
 * Display description for a passive. Uses the game's localized text when present
 * (with `{EffectValue}` placeholders filled); otherwise synthesizes one from the
 * passive's effects (e.g. "Work Speed +75%, Flinch Immunity"). Effects with a
 * zero value (boolean flags like immunities) render as a bare label.
 */
/** Resolve one `<uiCommon id=|COMMON_…|/>` reference to display text. Work
 *  suitability refs reuse the localized work-enum label; the rest fall back to a
 *  small map / humanized id. */
function resolveUiCommon(key: string, enums: EnumsLocale): string {
  if (key === 'COMMON_STATUS_HP') return 'HP'
  if (key === 'COMMON_WORK_SUITABILITY_PALDEX') return 'Work Suitability'
  const work = /^COMMON_WORK_SUITABILITY_(\w+)$/.exec(key)
  if (work && enums.work[work[1]]) return enums.work[work[1]]
  return key.replace(/^COMMON_/, '').replace(/_/g, ' ')
}

/** Resolve `<uiCommon .../>` refs and normalize whitespace, KEEPING the colour /
 *  status tags (`<NumBlue_13>`, `<NumRed_13>`, `<Status_Up>`, `</>`) for the
 *  renderer (see PassiveText). */
function resolvePassiveTokens(s: string, bundle: PalsBundle): string {
  return s
    .replace(/<uiCommon id=\|([^|]+)\|\s*\/>/g, (_m, k: string) => resolveUiCommon(k, bundle.enums))
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

/** Strip all markup tags to plain text (for searching / accessible fallbacks). */
export function stripPassiveTags(s: string): string {
  return s.replace(/<[^>]*>/g, '').replace(/[ \t]+/g, ' ').trim()
}

/**
 * Display description for a passive. Uses the game's localized text when present
 * (with `{EffectValue}` filled, `<uiCommon/>` refs resolved, colour/status tags
 * kept for PassiveText to render); otherwise synthesizes one from the effects.
 */
export function passiveDescription(id: string, bundle: PalsBundle): string {
  const passive = bundle.passivesById.get(id)
  const real = fillPassiveDesc(bundle.passiveText[id]?.description, passive)
  if (real) return resolvePassiveTokens(real, bundle)
  if (!passive) return ''
  return passive.effects
    .map((e) => {
      const label = effectTypeLabel(e.type, bundle.enums)
      if (!e.value) return label
      const sign = e.value > 0 ? '+' : '−'
      return `${label} ${sign}${Math.abs(e.value)}%`
    })
    .join(', ')
}
