import { DATA_BASE, RES_BASE } from './urls'

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
  /** Production buildings that can craft this item (building ids, base tier first). */
  craftedAt?: string[]
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
  icon?: string
  element?: string
  food?: FoodEffect
  equip?: EquipStats
  recipe?: Recipe
  droppedBy?: string[]
  partnerFor?: string[]
  usedInItems?: string[]
  usedInBuildings?: string[]
  unlockTech?: string[]
}

export interface BuildingEntry {
  id: string
  typeA: string
  typeB: string
  typeUI: string
  rank: number
  work: number
  materials: Material[]
  energyType?: string
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
  requireBoss?: string
  requireTech?: string
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
}
export interface BuildingsBundle {
  buildings: BuildingEntry[]
  byId: Map<string, BuildingEntry>
  text: Record<string, CatalogText>
  typeLabels: TypeLabels
}
export interface TechBundle {
  techs: TechEntry[]
  byId: Map<string, TechEntry>
  text: Record<string, CatalogText>
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
    j<{ items: ItemEntry[] }>(`${DATA_BASE}/items.json`),
    j<Record<string, CatalogText>>(`${DATA_BASE}/locales/${lng}/items.json`),
    j<LabelsFile>(`${DATA_BASE}/locales/${lng}/labels.json`),
  ])
  return {
    items: file.items,
    byId: new Map(file.items.map((i) => [i.id, i])),
    text,
    typeLabels: labels.item,
  }
}

async function fetchBuildings(lng: string): Promise<BuildingsBundle> {
  const [file, text, labels] = await Promise.all([
    j<{ buildings: BuildingEntry[] }>(`${DATA_BASE}/buildings.json`),
    j<Record<string, CatalogText>>(`${DATA_BASE}/locales/${lng}/buildings.json`),
    j<LabelsFile>(`${DATA_BASE}/locales/${lng}/labels.json`),
  ])
  return {
    buildings: file.buildings,
    byId: new Map(file.buildings.map((b) => [b.id, b])),
    text,
    typeLabels: labels.building,
  }
}

async function fetchTech(lng: string): Promise<TechBundle> {
  const [file, text] = await Promise.all([
    j<{ techs: TechEntry[] }>(`${DATA_BASE}/technology.json`),
    j<Record<string, CatalogText>>(`${DATA_BASE}/locales/${lng}/technology.json`),
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
    j<{ quests: QuestEntry[] }>(`${DATA_BASE}/quests.json`),
    j<Record<string, QuestText>>(`${DATA_BASE}/locales/${lng}/quests.json`),
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
