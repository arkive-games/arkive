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

/** Pal body size (raw `EPalSizeType` codes, smallest→largest). The game ships no
 *  localized names for these; the codes are shown as-is in every language. */
export const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL'] as const

// --- data shapes (mirror pals.json / passives.json) --------------------------
export interface PalStats {
  hp: number; meleeAttack: number; shotAttack: number; defense: number
  craftSpeed: number; stamina: number; foodAmount: number; maxFullStomach: number
  captureRate: number; price: number; maleProbability: number
  slowWalkSpeed: number
  walkSpeed: number; runSpeed: number; rideSprintSpeed: number; transportSpeed: number
  swimSpeed: number
}
export interface ActiveSkill {
  wazaId: string; level: number; element: string; category: string
  power: number; coolTime: number
  /** Attack range in raw world units (cm; ÷100 = metres). 0 when the skill has none. */
  minRange: number; maxRange: number
  /** Rarity tier from DT_WazaDataTable (`Weak`/`Medium`/`Strong`), or `None`.
   *  A tier doubles as the Skill-Fruit marker: the fruit farm's lottery draws by
   *  element × rarity, so exactly the tiered skills are obtainable from a fruit;
   *  `None` skills are learned by leveling only. See {@link isSkillFruitSkill}. */
  strength?: string
}

/** True when an active skill is obtainable from a Skill Fruit (it carries a
 *  Weak/Medium/Strong rarity tier). `None`/absent ⇒ default (level-learned) only. */
export function isSkillFruitSkill(strength: string | undefined): boolean {
  return strength === 'Weak' || strength === 'Medium' || strength === 'Strong'
}
/** One buff effect of a partner skill: effect type, target, and per-rank values. */
export interface PartnerEffect { type: string; target: string; values: number[] }
/** Fixed metadata of an action-type partner skill (from DT_PartnerSkill).
 *  `name` is the raw SkillName key (e.g. `SearchMine`); `triggerType` is set
 *  only for auto-triggered skills (`OpenTreasure`/`PalRevive`/`PlayerRevive`). */
export interface PartnerAction {
  name?: string
  effectTime: number
  coolTime: number
  execCost: number
  idleCost: number
  toggle: boolean
  canChangeWeapon?: boolean
  canThrowPal?: boolean
  triggerType?: string
}
/** One weighted entry of a ranch (Pal Ranch) production lottery: the produced
 *  item, its weight within the rank's pool, and the per-drop count range. */
export interface FarmItem { item: string; weight: number; min: number; max: number }
/** A partner skill in one of three shapes (see tools/palworld/encyclopedia.py):
 *  - attack: `wazaId`/`element`/`power` + per-rank `rankValues` (multiplier).
 *  - buff:   `effects` (each with per-rank `values`).
 *  - action: `action` metadata + optional per-rank `rankValues` / `coolTimeByRank`
 *            / `effectTimeByRank`.
 *  Any shape may carry `unlockItem` + its `gear` kind (`Saddle` = mount,
 *  `Gloves` = glider, else a held weapon/tool) and `farm` (ranch production,
 *  `farm[rank-1]` = that partner-skill rank's weighted item pool).
 *  The name always comes from the locale. */
export interface PartnerSkill {
  wazaId?: string
  element?: string
  power?: number
  rankValues?: number[]
  coolTimeByRank?: number[]
  effectTimeByRank?: number[]
  unlockItem?: string
  gear?: string
  farm?: FarmItem[][]
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
  /** Item id of the egg this pal hatches from (`PalEgg_<Family>_<tier>`;
   *  primary-element family + rarity tier, from BP_PalGameSetting). */
  egg: string
  nocturnal: boolean
  reaction: string
  stats: PalStats
  work: Partial<Record<WorkType, number>>
  bestWork: WorkType
  partnerSkill: PartnerSkill
  activeSkills: ActiveSkill[]
  passives: string[]
  drops: Drop[]
  /** Kill drops of the boss form (BOSS_<id> row in DT_PalDropItem); absent when
   *  the pal has no boss variant with non-zero drop rates. */
  bossDrops?: Drop[]
  /** True when the pal is obtained at the Summoning Altar (DT_PalRaidBoss). */
  summonable: boolean
  /** Materials + counts to craft this pal's summon item (only when summonable). */
  summonMaterials?: { item: string; count: number }[]
}

export interface PassiveEffect { type: string; value: number; target: string }
/** `mutation` marks a mutation-pool passive (game `AddMutationPal`): exclusive to
 *  mutated Pals or grafted via a disposable implant at the Operating Table. */
export interface Passive { id: string; rank: number; effects: PassiveEffect[]; mutation?: boolean }

/** Filter facets emitted by the pipeline: only the values actually present in the
 *  roster (canonical order), so the Paldeck filters hide chips with no pals. */
export interface PalFacets {
  elements: Element[]
  works: WorkType[]
  reactions: string[]
  nocturnal: boolean
}

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
  /** Filter facets present in the roster (from the pipeline). */
  filters: PalFacets
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
  /** itemId -> position in items.json, which is emitted in the game's
   *  inventory order (SortId) — a language-independent sort key. */
  itemOrder: Record<string, number>
  enums: EnumsLocale
  /** partner-skill effect type -> localized label (fallback lang -> en-US -> raw enum). */
  partnerEffects: Record<string, string>
  /** partner-skill effect target -> localized label (same fallback). */
  partnerTargets: Record<string, string>
}

const cache = new Map<string, Promise<PalsBundle>>()

async function fetchBundle(lng: string): Promise<PalsBundle> {
  const [palsFile, passivesFile, itemsFile, text, passiveText, skills, itemsLoc, enums, partnerEffects, partnerTargets] = await Promise.all([
    j<{ pals: PalEntry[]; filters: PalFacets }>(`${DATA_BASE}/pals.json`),
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
  const itemOrder: Record<string, number> = {}
  itemsFile.items.forEach((it, i) => {
    if (it.icon) itemIcon[it.id] = it.icon
    itemOrder[it.id] = i
  })
  // Flatten catalog's {id: {name, description?}} to {id: name} for pal views.
  const items: Record<string, string> = {}
  for (const [id, v] of Object.entries(itemsLoc)) items[id] = v.name
  return {
    pals: palsFile.pals,
    byId: new Map(palsFile.pals.map((p) => [p.id, p])),
    filters: palsFile.filters,
    text,
    passives: passivesFile.passives,
    passivesById: new Map(passivesFile.passives.map((p) => [p.id, p])),
    passiveText,
    skills,
    items,
    itemIcon,
    itemOrder,
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

// --- spawn points (for the embedded per-pal map) -----------------------------
/**
 * A pal's exact spawn point on one map; `level` is a preformatted level label
 * (e.g. "Lv.1–3", or "Lv.7" for bosses).
 */
/** A spawn point's origin: a normal wild encounter, or a (field/alpha) boss. */
export type SpawnKind = 'wild' | 'boss'
/** `night` marks a night-restricted point (spawner OnlyTime=Night) — the pal
 *  appears there only at night. */
export interface SpawnPoint { x: number; y: number; level?: string; kind: SpawnKind; night?: boolean }
export interface PalSpawns { map: GameMapMeta; points: SpawnPoint[] }

// spawns/<palId>.json (emitted by tools/…/emit.py): the pal's pre-cluster
// placements plus fieldBoss/predator points, keyed by map id.
interface SpawnFile {
  maps: Record<
    string,
    {
      points?: { x: number; y: number; z: number; lvMin: number; lvMax: number; nightOnly?: boolean }[]
      bosses?: { x: number; y: number; z: number; kind: string; level?: number; nightOnly?: boolean }[]
    }
  >
}

/**
 * Every map on which `palId` appears, with that pal's exact spawn positions
 * from `spawns/<palId>.json` (unclustered — the main map's markers stay
 * clustered, this file carries the raw placements). Maps with no points are
 * omitted; a missing file (404) means the pal never spawns. Level labels are
 * formatted here from the numeric band — no locale fetch needed.
 */
export async function loadPalSpawns(palId: string): Promise<PalSpawns[]> {
  const [{ maps }, file] = await Promise.all([
    j<{ maps: GameMapMeta[] }>(`${DATA_BASE}/maps.json`),
    j<SpawnFile>(`${DATA_BASE}/spawns/${palId}.json`).catch(() => null),
  ])
  if (!file) return []
  const out: PalSpawns[] = []
  for (const map of maps) {
    const m = file.maps[map.id]
    if (!m) continue
    const points: SpawnPoint[] = (m.points ?? []).map((p) => ({
      x: p.x,
      y: p.y,
      kind: 'wild' as const,
      level: p.lvMin === p.lvMax ? `Lv.${p.lvMin}` : `Lv.${p.lvMin}–${p.lvMax}`,
      night: p.nightOnly,
    }))
    // Boss points last, so they render on top of overlapping wild ones.
    for (const b of m.bosses ?? []) {
      points.push({
        x: b.x,
        y: b.y,
        kind: 'boss',
        level: b.level ? `Lv.${b.level}` : undefined,
        night: b.nightOnly,
      })
    }
    if (points.length > 0) out.push({ map, points })
  }
  return out
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

// --- active-skill catalog (Active Skills list + per-skill detail pages) ------
/** A pal that learns an active skill by leveling, and the level it learns it at. */
export interface ActiveSkillPalRef { id: string; name: string; icon: string; level: number }
/** One distinct active skill: element-invariant metadata, its Skill-Fruit flag,
 *  and every pal that learns it (level-sorted). */
export interface ActiveSkillEntry {
  wazaId: string
  name: string
  description: string
  element: Element
  /** Melee vs. ranged (everything non-`Melee`). */
  melee: boolean
  power: number
  coolTime: number
  minRange: number
  maxRange: number
  isFruit: boolean
  pals: ActiveSkillPalRef[]
}

/** Build the deduped active-skill catalog from a loaded bundle. Skill metadata
 *  is element-invariant, so it's taken from the first occurrence; the learn
 *  `level` varies per pal and lives on each pal ref. */
export function buildActiveSkills(bundle: PalsBundle): ActiveSkillEntry[] {
  const byId = new Map<string, ActiveSkillEntry>()
  for (const p of bundle.pals) {
    const palName = bundle.text[p.id]?.name ?? p.id
    for (const s of p.activeSkills) {
      let e = byId.get(s.wazaId)
      if (!e) {
        e = {
          wazaId: s.wazaId,
          // Localized name; empty when the skill has no L10N entry (some
          // boss/unreleased skills). Callers surface the raw `wazaId` instead.
          name: bundle.skills[s.wazaId]?.name ?? '',
          description: resolveCharacterNames(bundle.skills[s.wazaId]?.description, bundle.text),
          element: s.element as Element,
          melee: s.category === 'Melee',
          power: s.power,
          coolTime: s.coolTime,
          minRange: s.minRange,
          maxRange: s.maxRange,
          isFruit: isSkillFruitSkill(s.strength),
          pals: [],
        }
        byId.set(s.wazaId, e)
      }
      e.pals.push({ id: p.id, name: palName, icon: p.icon, level: s.level })
    }
  }
  for (const e of byId.values()) e.pals.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
  return [...byId.values()]
}

// --- partner-skill catalog (Partner Skills index page) ------------------------
/** Data shape of a partner skill (which raw fields drive it). `gear` covers
 *  unlock-item-only skills (plain mounts/gliders with no stats of their own). */
export type PartnerShape = 'attack' | 'buff' | 'action' | 'gear'
/** Coarse filter categories; a skill can be in several (like passives). */
export type PartnerCategory =
  | 'mount' | 'glider' | 'weapon' | 'ranch' | 'attack'
  | 'combat' | 'move' | 'work' | 'utility'
/** Fixed display/filter order. */
export const PARTNER_CATEGORIES: PartnerCategory[] = [
  'mount', 'glider', 'weapon', 'ranch', 'attack', 'combat', 'move', 'work', 'utility',
]

// Gear kind (SkillUnlock item icon) → category. Saddle = rideable mount,
// Gloves = glider; every other kind is a held/worn weapon or tool.
const GEAR_CATEGORY: Record<string, PartnerCategory> = {
  Saddle: 'mount',
  Gloves: 'glider',
}

/** Category of a partner-skill gear kind (`mount`/`glider`/`weapon`), or
 *  undefined when the skill has no gear. Shared with the pal detail badge. */
export function gearCategory(gear: string | undefined): PartnerCategory | undefined {
  if (!gear) return undefined
  return GEAR_CATEGORY[gear] ?? 'weapon'
}

// Buff effect type → category. Prefix families are handled in
// partnerEffectCategory; the long tail (element boosts, damage/shield/ailment
// modifiers) defaults to 'combat'.
const PARTNER_EFFECT_CATEGORY: Record<string, PartnerCategory> = {
  // movement / carrying
  MoveSpeed: 'move', MoveSpeed_Grass: 'move', MoveSpeed_Ground: 'move', MoveSpeed_Snow: 'move',
  ClimbMoveSpeedRate: 'move', SwimSpeed: 'move', AirDash: 'move',
  JumpPower_Increase: 'move', JumpCount_Increase: 'move', LowGravity: 'move',
  FallDamageRate: 'move', MaxInventoryWeight: 'move', ItemWeightReduction: 'move',
  // work / gathering / base
  Mining: 'work', Logging: 'work', CraftSpeed: 'work', CollectItemDrop: 'work',
  EquipmentDurabilityRate: 'work', MeatCutAddItemDrop: 'work', GainItemDrop: 'work',
  FarmCropGrowupSpeed: 'work', FarmCropHarvestNumRate: 'work',
  BreedSpeed_InBaseCamp: 'work', PalEggHatchingSpeed: 'work',
  EggAlphaConversion: 'work', EggObtainExtraEgg: 'work', PalExp_Increase: 'work',
  FullStomatch_Decrease: 'work', Regene_Stomatch_Hungriest: 'work',
  Sanity_Decrease: 'work', ItemCorruptionSpeedRate: 'work',
  // capture / environment / misc utility
  CaptureLevel_SneakBonus: 'utility', SphereRecovery: 'utility',
  SyncroPassiveWhenCapture: 'utility', EnemySightDetectionRate: 'utility',
  TemperatureResist_Cold: 'utility', TemperatureResist_Heat: 'utility',
  InvalidToxicGas: 'utility', LavaDamageInvalid: 'utility',
  PartnerSkillCoolTime_Decrease: 'utility',
}

function partnerEffectCategory(type: string): PartnerCategory {
  if (type.startsWith('Fishing') || type.startsWith('WorkSuitabilityAddRank_')) return 'work'
  if (type.startsWith('CaptureLevelUpIfTarget_')) return 'utility'
  return PARTNER_EFFECT_CATEGORY[type] ?? 'combat'
}

// Action SkillName → category: ride weapons and held guns are 'weapon';
// heal/search/revive/vision helpers are 'utility'; sled/jump movement aids are
// 'move'; the rest (StatusUp*, Berserk, Shiled, …) buff the fight.
function partnerActionCategory(name: string): PartnerCategory {
  if (/^(UniqueRide|AssaultRifle|Shotgun|Grenade|Launcher|RocketLauncher|Minigun|Flamethrower|SwordCutlassfish|OnHeadShoot|SpinningShell)/.test(name)) return 'weapon'
  if (/^(Heal|Search|NightVision|NightRunner|Stealth|OpenTreasure|Revive|ReturnToBaseCamp)/.test(name)) return 'utility'
  if (/^(Toboggan|JumpFrog)/.test(name)) return 'move'
  return 'combat'
}

/** One partner skill (1:1 with its pal — entries link to the pal detail page). */
export interface PartnerSkillEntry {
  palId: string
  palName: string
  palIcon: string
  zukanIndex: number
  zukanIndexSuffix: string
  name: string
  description: string
  shape: PartnerShape
  element?: Element
  power?: number
  categories: PartnerCategory[]
}

/** Build the partner-skill index from a loaded bundle: every pal with a
 *  localized partner-skill name, with derived shape + filter categories. */
export function buildPartnerSkills(bundle: PalsBundle): PartnerSkillEntry[] {
  const out: PartnerSkillEntry[] = []
  for (const p of bundle.pals) {
    const text = bundle.text[p.id]
    const name = text?.partnerSkill?.name
    if (!name) continue
    const ps = p.partnerSkill
    const shape: PartnerShape = ps.wazaId
      ? 'attack'
      : ps.effects?.length
        ? 'buff'
        : ps.action
          ? 'action'
          : 'gear'
    const cats = new Set<PartnerCategory>()
    const gc = gearCategory(ps.gear)
    if (gc) cats.add(gc)
    if (ps.farm?.length) cats.add('ranch')
    if (shape === 'attack') cats.add('attack')
    for (const e of ps.effects ?? []) cats.add(partnerEffectCategory(e.type))
    if (ps.action?.name) cats.add(partnerActionCategory(ps.action.name))
    const description =
      resolveCharacterNames(text?.partnerSkill?.desc, bundle.text) ||
      (ps.wazaId ? resolveCharacterNames(bundle.skills[ps.wazaId]?.description, bundle.text) : '')
    out.push({
      palId: p.id,
      palName: text?.name ?? p.id,
      palIcon: p.icon,
      zukanIndex: p.zukanIndex,
      zukanIndexSuffix: p.zukanIndexSuffix,
      name,
      description,
      shape,
      element: ps.element as Element | undefined,
      power: ps.power,
      categories: PARTNER_CATEGORIES.filter((c) => cats.has(c)),
    })
  }
  return out
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

// --- effect categories (for the Passive Skills page filter) ------------------
export type PassiveCategory = 'attack' | 'defense' | 'work' | 'move' | 'utility'
/** Fixed display/filter order. */
export const PASSIVE_CATEGORIES: PassiveCategory[] = ['attack', 'defense', 'work', 'move', 'utility']

const EFFECT_CATEGORY: Record<string, PassiveCategory> = {
  ShotAttack: 'attack',
  LifeSteal: 'attack',
  Defense: 'defense',
  MaxHP: 'defense',
  AutoHPRegeneRate: 'defense',
  ExplosionResist: 'defense',
  LeanBackInvalid_ForPassiveSkill: 'defense',
  KnockbackInvalid_ForPassiveSkill: 'defense',
  CraftSpeed: 'work',
  Mining: 'work',
  Logging: 'work',
  BreedSpeed: 'work',
  BreedSpeed_InBaseCamp: 'work',
  PalEggHatchingSpeed: 'work',
  MoveSpeed: 'move',
  SwimSpeed: 'move',
  RideJumpCount_Increase: 'move',
  PlayerSP_DecreaseRate: 'move', // player stamina → mobility
}

/** Coarse category for one effect `type` (handles element/work prefixes). */
function effectCategory(type: string): PassiveCategory {
  if (type.startsWith('ElementBoost_')) return 'attack'
  if (type.startsWith('ElementResist_') || type.startsWith('ResistAdditionalEffect_')) return 'defense'
  if (type.startsWith('WorkSuitabilityAddRank_')) return 'work'
  return EFFECT_CATEGORY[type] ?? 'utility'
}

/** The set of categories a passive touches, in fixed order. Debuffs (negative
 *  rank) and unranked/text-only passives are left uncategorized (empty). */
export function passiveCategories(id: string, bundle: PalsBundle): PassiveCategory[] {
  const passive = bundle.passivesById.get(id)
  if (!passive || passive.rank <= 0) return []
  const set = new Set<PassiveCategory>()
  for (const e of passive.effects) set.add(effectCategory(e.type))
  return PASSIVE_CATEGORIES.filter((c) => set.has(c))
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

function commonPrefix(strs: string[]): string {
  if (!strs.length) return ''
  let p = strs[0]
  for (const s of strs.slice(1)) {
    let k = 0
    while (k < p.length && k < s.length && p[k] === s[k]) k++
    p = p.slice(0, k)
    if (!p) break
  }
  return p
}
function commonSuffix(strs: string[]): string {
  if (!strs.length) return ''
  let p = strs[0]
  for (const s of strs.slice(1)) {
    let k = 0
    while (k < p.length && k < s.length && p[p.length - 1 - k] === s[s.length - 1 - k]) k++
    p = p.slice(p.length - k)
    if (!p) break
  }
  return p
}

// The game's partner-effect labels bake in a direction decoration ("Defense Up",
// "防御力提升", "Tăng phòng thủ", "Защита +"). For passives that can be negative
// this reads wrong ("Defense Up −20%"), so we strip that decoration to a bare
// stat name and let the signed value convey direction. The decoration is derived
// per-language as the shared prefix/suffix of several always-directional stat
// labels — no hard-coded word lists. Cached per bundle.
const AFFIX_CACHE = new WeakMap<PalsBundle, { prefix: string; suffix: string }>()
function statAffixes(bundle: PalsBundle): { prefix: string; suffix: string } {
  let a = AFFIX_CACHE.get(bundle)
  if (!a) {
    const samples = ['CraftSpeed', 'Defense', 'ShotAttack', 'MoveSpeed']
      .map((t) => bundle.partnerEffects[t])
      .filter(Boolean)
    a = { prefix: commonPrefix(samples), suffix: commonSuffix(samples) }
    AFFIX_CACHE.set(bundle, a)
  }
  return a
}
function bareStatLabel(label: string, bundle: PalsBundle): string {
  const { prefix, suffix } = statAffixes(bundle)
  let s = label
  if (prefix && s.startsWith(prefix)) s = s.slice(prefix.length)
  if (suffix && s.endsWith(suffix)) s = s.slice(0, s.length - suffix.length)
  return s.trim() || label
}

function effectTypeLabel(type: string, bundle: PalsBundle): string {
  // Prefer the game's own localized label (partner-skill effect names share the
  // passive effect-type enum) so synthesized text is localized, not English —
  // stripping the baked-in "up/increase" decoration so negatives read right.
  const inGame = bundle.partnerEffects[type]
  if (inGame) return bareStatLabel(inGame, bundle)
  const boost = /^ElementBoost_(\w+)$/.exec(type)
  if (boost) return `${bundle.enums.elements[boost[1]] ?? boost[1]} Attack`
  const resist = /^ElementResist_(\w+)$/.exec(type)
  if (resist) return `${bundle.enums.elements[resist[1]] ?? resist[1]} Resistance`
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
/** The localized bare "work suitability/aptitude" word, derived from the game's
 *  own `WorkSuitabilityAddRank_<Work>` partner-effect labels (shared suffix minus
 *  the "up" decoration) so it stays in-language without a hard-coded map. */
function suitabilityWord(bundle: PalsBundle): string {
  const entries = Object.entries(bundle.partnerEffects)
    .filter(([k]) => k.startsWith('WorkSuitabilityAddRank_'))
    .map(([, v]) => v)
  if (entries.length < 2) return 'Work Suitability'
  let s = commonSuffix(entries)
  const up = statAffixes(bundle).suffix
  if (up && s.endsWith(up)) s = s.slice(0, s.length - up.length)
  return s.trim() || 'Work Suitability'
}

function resolveUiCommon(key: string, bundle: PalsBundle): string {
  if (key === 'COMMON_STATUS_HP') return 'HP'
  if (key === 'COMMON_WORK_SUITABILITY_PALDEX') return suitabilityWord(bundle)
  const work = /^COMMON_WORK_SUITABILITY_(\w+)$/.exec(key)
  if (work && bundle.enums.work[work[1]]) return bundle.enums.work[work[1]]
  return key.replace(/^COMMON_/, '').replace(/_/g, ' ')
}

/** Resolve `<uiCommon .../>` refs and normalize whitespace, KEEPING the colour /
 *  status tags (`<NumBlue_13>`, `<NumRed_13>`, `<Status_Up>`, `</>`) for the
 *  renderer (see PassiveText). */
function resolvePassiveTokens(s: string, bundle: PalsBundle): string {
  return s
    .replace(/<uiCommon id=\|([^|]+)\|\s*\/>/g, (_m, k: string) => resolveUiCommon(k, bundle))
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
      const label = effectTypeLabel(e.type, bundle)
      if (!e.value) return label
      const sign = e.value > 0 ? '+' : '−'
      return `${label} ${sign}${Math.abs(e.value)}%`
    })
    // One effect per line (the card renders with `whitespace-pre-line`).
    .join('\n')
}
