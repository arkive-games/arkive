import { dataUrl, RES_BASE } from './urls'

// --- data shapes (mirror items.json / buildings.json / technology.json) -------
// Emitted by tools/palworld/catalog.py. Ids share one space: item id ==
// recipe product id == material id; building id == UnlockBuildObjects entry.

export interface Material {
  item: string
  count: number
}
export interface Recipe {
  work: number
  unlockItemId?: string
  materials: Material[]
  /** Output quantity per craft; present only for batch recipes (>1, e.g. ammo,
   *  Money, medicine). Absent ⇒ 1. */
  productCount?: number
  /** Player EXP awarded per craft (CraftExpRate); absent when 0. */
  craftExp?: number
  /** Production buildings that can craft this item (building ids, in the
   *  game's build-menu order — base tier first). */
  craftedAt?: string[]
}
/** Timed buff a cooked dish grants when eaten (DT_StatusEffectFood): one or two
 *  effect types with magnitude, and the duration in seconds. */
export interface FoodBuff {
  effects: { type: string; value: number }[]
  time?: number
}
export interface FoodEffect {
  satiety?: number
  health?: number
  sanity?: number
  concentration?: number
}
export interface EquipStats {
  attack?: number
  defense?: number
  hp?: number
  shield?: number
  magicAttack?: number
  magicDefense?: number
  durability?: number
  magazine?: number
}

/** One acquisition channel of an item, emitted by
 *  tools/palworld/item_sources.py (+ merchants.py for the merchant kind).
 *  Kind-discriminated:
 *  - chest/fishing/supply/camp/oilrig: `area` names the region (labels.json
 *    `area` for game-localized islands/rigs, `bp.area.*` UI strings for the
 *    mainland biomes); `grade` is the chest tier, `chance` the best per-roll
 *    percentage (slot probability × weight share).
 *  - treasureMap: `item` is the treasure-map item id.
 *  - salvage: `rank` of the fishing junk spot.
 *  - raid: `pal` is the summoning-altar boss.
 *  - shrine: `count` of Ancient Shrines granting it.
 *  - merchant: `merchant` is the merchant id (→ merchants.json), `price` in
 *    `currency` (an item id).
 *  - arena: `rank` row name (bp.arenaRank.*), `repeat` for repeat-clear. */
export interface ItemSource {
  kind:
    | 'chest' | 'fishing' | 'salvage' | 'supply' | 'camp' | 'oilrig'
    | 'treasureMap' | 'raid' | 'shrine' | 'merchant' | 'arena'
  area?: string
  grade?: number
  chance?: number
  item?: string
  rank?: number | string
  pal?: string
  count?: number
  merchant?: string
  price?: number
  currency?: string
  repeat?: boolean
  /** Raid reward quantity range (present when >1). */
  min?: number
  max?: number
  /** Raid pick-one guaranteed reward (SuccessAnyOneItemList): you always get one
   *  item from the set, so no per-item `chance`. */
  anyOne?: boolean
}

/** @deprecated use {@link ItemSource} — kept as an alias during the rename. */
export type BlueprintSource = ItemSource

export interface ItemEntry {
  id: string
  typeA: string
  typeB: string
  /** Game's canonical inventory order — unique per item, language-independent. */
  sortId: number
  rarity: number
  rank: number
  weight: number
  price: number
  maxStack: number
  handcraft: boolean
  /** bLegalInGame=False dead data (deprecated dupes, debug rows) — never shown
   *  in the item list. Real bLegalInGame=False specials (effigies, main-quest
   *  Key Spheres) are whitelisted in the tools pipeline and arrive unflagged. */
  illegal?: boolean
  icon?: string
  element?: string
  food?: FoodEffect
  /** Timed buff granted when eaten (cooked dishes). */
  foodBuff?: FoodBuff
  /** Sanity drain per use (CorruptionFactor); absent when 0. */
  corruption?: number
  /** Item is restricted in PvP (bNotAvailableInPVP). */
  pvpBanned?: boolean
  /** Reusable consumable — not used up on use (bNotConsumed; the Lanterns). */
  notConsumed?: boolean
  equip?: EquipStats
  /** Active skill (Waza id) this item teaches a pal (skill cards). */
  grantsSkill?: string
  /** Passive skill ids this item grants when equipped (armor/accessories). */
  itemPassives?: string[]
  recipe?: Recipe
  /** Pals that drop this item; `isBoss` marks drops exclusive to the boss form. */
  droppedBy?: { id: string; isBoss?: boolean }[]
  partnerFor?: string[]
  usedInItems?: string[]
  usedInBuildings?: string[]
  unlockTech?: string[]
  /** Items whose recipe this item unlocks (inverse of recipe.unlockItemId). */
  unlocksCraft?: string[]
  /** Acquisition channels (chests / fishing / camps / merchants / raids /
   *  arena / shrines) — emitted for every item, not just blueprints. */
  sources?: ItemSource[]
  /** Blueprint with NO acquisition channel at all (also no pal drop, dungeon
   *  lottery or recycler output) — dead data as far as players are concerned. */
  noSource?: boolean
}

export interface BuildingEntry {
  id: string
  typeA: string
  typeB: string
  typeUI: string
  /** Game's build-menu position — unique within a typeA category only. */
  sortId: number
  work: number
  materials: Material[]
  energyType?: string
  /** Power consumed per second while working (ConsumeEnergySpeed); absent when 0. */
  energyDrain?: number
  /** Max installable in one base camp (InstallMaxNumInBaseCamp); absent when unlimited. */
  maxPerBase?: number
  /** Player EXP awarded on build (BuildExpRate); absent when 0. */
  buildExp?: number
  /** Can be recolored with the paint sprayer (bIsPaintable). */
  paintable?: boolean
  /** Placement restrictions: base-camp only / near-Palbox only / not in raid arenas. */
  baseOnly?: boolean
  hubOnly?: boolean
  noRaidArea?: boolean
  unlockTech?: string[]
  icon?: string
}

export interface TechEntry {
  id: string
  level: number
  cost: number
  isBoss: boolean
  unlockItems: string[]
  unlockBuildings: string[]
  /** Tower boss (EPalBossType value, e.g. `GrassBoss`) that must be defeated
   *  before this tech can be unlocked. */
  requireBoss?: string
  /** Prerequisite tech id that must be unlocked first. */
  requireTech?: string
  /** Lab research project id that must be completed first. */
  requireResearch?: string
  /** Pal that must be captured to unlock (partner-skill `SkillUnlock_*` techs). */
  requirePal?: string
  /** Fallback tile icon basename (`item_<id>` / `build_<id>`) for techs whose
   *  unlocked item/building is absent from the datasets. Set by the tools. */
  icon?: string
}

export interface QuestLocation {
  map: string
  x: number
  y: number
  z: number
}
export interface QuestEntry {
  id: string
  /** Main | Sub | Hidden — the quest log tab. */
  type: string
  /** Game quest-table order (stable, language-independent). */
  order: number
  rewardExp?: number
  rewardItems?: Material[]
  /** Quest ids that auto-start when this one completes (the chain). */
  nextQuests?: string[]
  location?: QuestLocation
}

// --- locale shapes -----------------------------------------------------------
export interface CatalogText {
  name: string
  description?: string
}

/** Localized tech text: adds the unlock-requirement names (the tower's
 *  boss-battle name for `requireBoss`, the lab research project's name for
 *  `requireResearch`). From locales/<lng>/technology.json. */
export interface TechText extends CatalogText {
  requireBossName?: string
  requireResearchName?: string
}

/** Localized quest text: {title, description?}. From locales/<lng>/quests.json. */
export interface QuestText {
  title: string
  description?: string
}

/** Localized category (typeA) labels: {typeA: label}. From locales/<lng>/labels.json. */
export type TypeLabels = Record<string, string>
interface LabelsFile {
  item: TypeLabels
  building: TypeLabels
  /** Building energy requirement (EPalEnergyType value -> localized name). */
  energy?: TypeLabels
  /** Blueprint-source areas with a game-localized world-map name (islands +
   *  oil rigs); mainland biomes fall back to the bp.area.* UI strings. */
  area?: TypeLabels
}

// --- loaders -----------------------------------------------------------------
const j = async <T>(url: string): Promise<T> => {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${url}: ${r.status}`)
  return r.json() as Promise<T>
}

export interface ItemsBundle {
  items: ItemEntry[]
  byId: Map<string, ItemEntry>
  text: Record<string, CatalogText>
  typeLabels: TypeLabels
  /** Game-localized blueprint-source area names (islands + oil rigs). */
  areaLabels: TypeLabels
}
export interface BuildingsBundle {
  buildings: BuildingEntry[]
  byId: Map<string, BuildingEntry>
  text: Record<string, CatalogText>
  typeLabels: TypeLabels
  /** Localized energy-requirement names (e.g. Electric -> 雷). */
  energyLabels: TypeLabels
}
export interface TechBundle {
  techs: TechEntry[]
  byId: Map<string, TechEntry>
  text: Record<string, TechText>
}

export interface QuestsBundle {
  quests: QuestEntry[]
  byId: Map<string, QuestEntry>
  text: Record<string, QuestText>
}

const itemsCache = new Map<string, Promise<ItemsBundle>>()
const buildingsCache = new Map<string, Promise<BuildingsBundle>>()
const techCache = new Map<string, Promise<TechBundle>>()
const questsCache = new Map<string, Promise<QuestsBundle>>()

async function fetchItems(lng: string): Promise<ItemsBundle> {
  const [file, text, labels] = await Promise.all([
    j<{ items: ItemEntry[] }>(dataUrl(`items.json`)),
    j<Record<string, CatalogText>>(dataUrl(`locales/${lng}/items.json`)),
    j<LabelsFile>(dataUrl(`locales/${lng}/labels.json`)),
  ])
  // droppedBy was `string[]` before boss drops were split out; tolerate stale
  // deployed data by lifting bare ids into unflagged entries.
  for (const it of file.items) {
    if (it.droppedBy) {
      it.droppedBy = it.droppedBy.map((e) =>
        typeof e === 'string' ? { id: e } : e,
      )
    }
  }
  return {
    items: file.items,
    byId: new Map(file.items.map((i) => [i.id, i])),
    text,
    typeLabels: labels.item,
    areaLabels: labels.area ?? {},
  }
}

async function fetchBuildings(lng: string): Promise<BuildingsBundle> {
  const [file, text, labels] = await Promise.all([
    j<{ buildings: BuildingEntry[] }>(dataUrl(`buildings.json`)),
    j<Record<string, CatalogText>>(dataUrl(`locales/${lng}/buildings.json`)),
    j<LabelsFile>(dataUrl(`locales/${lng}/labels.json`)),
  ])
  return {
    buildings: file.buildings,
    byId: new Map(file.buildings.map((b) => [b.id, b])),
    text,
    typeLabels: labels.building,
    energyLabels: labels.energy ?? {},
  }
}

async function fetchTech(lng: string): Promise<TechBundle> {
  const [file, text] = await Promise.all([
    j<{ techs: TechEntry[] }>(dataUrl(`technology.json`)),
    j<Record<string, TechText>>(dataUrl(`locales/${lng}/technology.json`)),
  ])
  return { techs: file.techs, byId: new Map(file.techs.map((t) => [t.id, t])), text }
}

/** Load (and cache per language) the item encyclopedia dataset. */
export function loadItems(lng: string): Promise<ItemsBundle> {
  let p = itemsCache.get(lng)
  if (!p) {
    p = fetchItems(lng)
    itemsCache.set(lng, p)
  }
  return p
}

/** Load (and cache per language) the building encyclopedia dataset. */
export function loadBuildings(lng: string): Promise<BuildingsBundle> {
  let p = buildingsCache.get(lng)
  if (!p) {
    p = fetchBuildings(lng)
    buildingsCache.set(lng, p)
  }
  return p
}

/** Load (and cache per language) the technology dataset. */
export function loadTech(lng: string): Promise<TechBundle> {
  let p = techCache.get(lng)
  if (!p) {
    p = fetchTech(lng)
    techCache.set(lng, p)
  }
  return p
}

async function fetchQuests(lng: string): Promise<QuestsBundle> {
  const [file, text] = await Promise.all([
    j<{ quests: QuestEntry[] }>(dataUrl(`quests.json`)),
    j<Record<string, QuestText>>(dataUrl(`locales/${lng}/quests.json`)),
  ])
  return { quests: file.quests, byId: new Map(file.quests.map((q) => [q.id, q])), text }
}

/** Load (and cache per language) the quest log dataset. */
export function loadQuests(lng: string): Promise<QuestsBundle> {
  let p = questsCache.get(lng)
  if (!p) {
    p = fetchQuests(lng)
    questsCache.set(lng, p)
  }
  return p
}

// --- building icon -----------------------------------------------------------
/** Building icon (e.g. `build_Workbench`). Item icons live under the game's
 *  /Game/Others/InventoryItemIcon tree, which isn't in the current raw export. */
export const buildingIconUrl = (icon: string): string => `${RES_BASE}/icons/${icon}.webp`
