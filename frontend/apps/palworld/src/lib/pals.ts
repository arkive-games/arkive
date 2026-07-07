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
