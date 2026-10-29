import { dataUrl, RES_BASE } from './urls'

/** `[itemId, count]` pairs, as the upgrade tables list their costs. */
export type Materials = [string, number][]

export interface Weapon {
  id: string
  type: string
  rarity: string
  icon: string
  render?: string
  /** Base values of the attributes named in the text file's `stats`. */
  stats: number[]
  /** One entry per upgrade: `[attack multiplier, dust, materials]`. */
  levels: [number, number, Materials][]
  soul: { dust: number; materials: Materials } | null
}

export interface WeaponText {
  name: string
  flavor?: string
  desc?: string
  intro?: string
  stats?: string[]
  /** `[title, rich text]` per move. */
  moves?: [string, string][]
  /** `[title, rich text]` per effect Soul Tempering adds. */
  soul?: [string, string][]
}

export interface Accessory {
  id: string
  type: string
  icon: string
  picture?: string
  /** Polishing steps: `[dust, materials]`. */
  refine: [number, Materials][]
  /** The repeatable late-game polishing steps: `[dust, materials]`. */
  cycle: [number, Materials][]
  buy: number | null
}

export interface AccessoryText {
  name: string
  desc?: string
  lore?: string
  intro?: string
  base?: string
  /** `[step name, effect]` per polishing step. */
  refine?: [string, string][]
  cycle?: string[]
}

export interface Medicine {
  id: string
  type: string
  rarity: string
  icon: string
  uses: number
  /** `[dust, materials, uses]` per upgrade. */
  levels: [number, Materials, number][]
  buy: number | null
}

export interface MedicineText {
  name: string
  desc?: string
  effect?: string
  levels?: string[]
}

export interface Item {
  id: string
  category: string
  rarity: string
  icon: string
  picture?: string
  sell: number | null
  order: number
  /** Page count, for books. */
  pages: number | null
}

export interface ItemText {
  name: string
  desc?: string
  lore?: string
  use?: string
  pages?: string[]
}

export interface Enemy {
  id: string
  map: string
  order: number
  type: string
  boss: boolean
  icon: string
  picture?: string
  bust?: string
}

export interface EnemyText {
  name: string
  desc?: string
}

export interface SkillNode {
  id: string
  branch: string
  /** For the Banyan nodes that bridge two branches: above or below them. */
  row: 'top' | 'bottom' | null
  column: number
  parents: string[]
  ultimate: boolean
  maxLevel: number
  dust: number
  materials: Materials
  icon: string
}

export interface SkillText {
  name: string
  desc?: string
}

/** The game's own words for categories, rarities, areas and button prompts. */
export type Labels = Record<
  'weaponType' | 'edgeType' | 'accessoryType' | 'medicineType' | 'rarity' | 'enemyType' | 'itemCategory'
  | 'skillBranch' | 'section' | 'map' | 'prompt',
  Record<string, string>
>

interface Datasets {
  weapons: [Weapon, WeaponText]
  phantomEdges: [Weapon, WeaponText]
  accessories: [Accessory, AccessoryText]
  medicines: [Medicine, MedicineText]
  items: [Item, ItemText]
  enemies: [Enemy, EnemyText]
  skills: [SkillNode, SkillText]
}
export type DatasetName = keyof Datasets

export interface Dataset<N extends DatasetName> {
  rows: Datasets[N][0][]
  byId: Map<string, Datasets[N][0]>
  text: Record<string, Datasets[N][1]>
}

const j = async <T,>(url: string): Promise<T> => {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${url}: ${r.status}`)
  return r.json() as Promise<T>
}

const cache = new Map<string, Promise<unknown>>()
function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  let p = cache.get(key) as Promise<T> | undefined
  if (!p) {
    p = load()
    // A failed fetch must not poison the cache for the rest of the visit.
    p.catch(() => cache.delete(key))
    cache.set(key, p)
  }
  return p
}

export function loadDataset<N extends DatasetName>(name: N, lng: string): Promise<Dataset<N>> {
  return cached(`${name}:${lng}`, async () => {
    const [file, text] = await Promise.all([
      cached(name, () => j<Record<N, Datasets[N][0][]>>(dataUrl(`wiki/${name}.json`))),
      j<Record<string, Datasets[N][1]>>(dataUrl(`locales/${lng}/wiki/${name}.json`)),
    ])
    const rows = file[name]
    return { rows, byId: new Map(rows.map((r) => [r.id, r])), text }
  })
}

export function loadLabels(lng: string): Promise<Labels> {
  return cached(`labels:${lng}`, () => j<Labels>(dataUrl(`locales/${lng}/wiki/labels.json`)))
}

/** URL of a wiki image (texture name without extension). */
export function wikiImage(name: string): string {
  return `${RES_BASE}/wiki/${name}.webp`
}

/** Rarity order, lowest first; the game's colours for each live in the components. */
export const RARITIES = ['Common', 'Rare', 'Epic', 'Legendary'] as const
