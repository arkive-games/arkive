import { DATA_BASE } from './urls'

// --- data shapes (mirror dungeons.json, emitted by tools/palworld/dungeons.py) --
// Everything keys off a dungeon SpawnAreaId (`Grass001` … `Skyland001`), the
// same id the map's dungeon-portal markers carry (`MarkerRow.dungeonArea`).

/** One weighted item row inside a lottery slot. `grade` is the game's
 *  TreasureBoxGrade (1–6): the chest tier the item appears in (higher tiers
 *  are the locked chests). */
export interface LotteryItem {
  item: string
  weight: number
  min: number
  max: number
  grade: number
}
/** One lottery slot: rolled independently at `prob` %, then one item is
 *  weight-drawn from `items`. A chest yields one roll per slot. */
export interface LotterySlot {
  prob: number
  items: LotteryItem[]
}

/** One entry in a boss-room reward pool (weighted against its tier's peers). */
export interface RewardEntry {
  kind: 'chest' | 'egg' | 'cage' | 'pal' | 'skillFruit' | 'lotus' | 'pickup' | 'object'
  weight: number
  /** chest / skillFruit: lottery name into `DungeonsFile.lotteries`. */
  lottery?: string
  /** Spawned map-object id (e.g. TreasureBox_RequiredLongHold for junk piles). */
  object?: string
  /** egg: pool name into `DungeonsFile.eggPools`. */
  eggPool?: string
  /** cage: pool name into `DungeonsFile.cagePools`. */
  cagePool?: string
  /** pal (mimic ambush): the pals with level ranges. */
  pals?: { pal: string; lvMin: number; lvMax: number }[]
  /** lotus: weighted stat-lotus map objects. */
  objects?: { object: string; weight: number }[]
}
export interface RewardTier {
  tier: string
  entries: RewardEntry[]
}
export interface DungeonEnemy {
  pal: string
  lvMin: number
  lvMax: number
}
export interface DungeonEntry {
  id: string
  bonusExpRate: number
  /** Interior item spawners: `normal` = regular chests, `special` = the
   *  guaranteed technology-book chest. Values are lottery names. */
  chests?: { normal?: string; special?: string }
  bossRewards: RewardTier[]
  /** Enemy pools by spawn bucket: `normal` = interior spawns (incl. the
   *  aggressive Monster-rank sheet), `floor2`–`floor4` = the Terraria-collab
   *  dungeon's deeper floors, `midBoss` = the alpha mini-boss pool,
   *  `fishing` = interior fishing spots, `boss` = the boss room. */
  enemies?: {
    normal?: DungeonEnemy[]
    floor2?: DungeonEnemy[]
    floor3?: DungeonEnemy[]
    floor4?: DungeonEnemy[]
    midBoss?: DungeonEnemy[]
    fishing?: DungeonEnemy[]
    boss?: DungeonEnemy[]
  }
}
export interface DungeonsFile {
  dungeons: DungeonEntry[]
  lotteries: Record<string, LotterySlot[]>
  eggPools: Record<string, { pal: string; weight: number }[]>
  cagePools: Record<string, { pal: string; weight: number; lvMin: number; lvMax: number }[]>
}

export type DungeonText = Record<string, { name: string }>

export interface DungeonsBundle {
  file: DungeonsFile
  byId: Map<string, DungeonEntry>
  text: DungeonText
}

const j = async <T>(url: string): Promise<T> => {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${url}: ${r.status}`)
  return r.json() as Promise<T>
}

const cache = new Map<string, Promise<DungeonsBundle>>()

async function fetchDungeons(lng: string): Promise<DungeonsBundle> {
  const [file, text] = await Promise.all([
    j<DungeonsFile>(`${DATA_BASE}/dungeons.json`),
    j<DungeonText>(`${DATA_BASE}/locales/${lng}/dungeons.json`),
  ])
  return { file, byId: new Map(file.dungeons.map((d) => [d.id, d])), text }
}

/** Load (and cache per language) the dungeon loot dataset. */
export function loadDungeons(lng: string): Promise<DungeonsBundle> {
  let p = cache.get(lng)
  if (!p) {
    p = fetchDungeons(lng)
    cache.set(lng, p)
  }
  return p
}

// --- derived helpers -----------------------------------------------------------

/** Per-roll chance (%) of one item row in its slot: slot probability × the
 *  item's weight share. */
export function itemChance(slot: LotterySlot, item: LotteryItem): number {
  const total = slot.items.reduce((s, i) => s + i.weight, 0)
  return total > 0 ? (slot.prob * item.weight) / total : 0
}

/** Weight share (%) of one entry within a reward tier. */
export function entryShare(tier: RewardTier, entry: RewardEntry): number {
  const total = tier.entries.reduce((s, e) => s + e.weight, 0)
  return total > 0 ? (entry.weight / total) * 100 : 0
}

/** Format a chance for display: whole numbers plain, small chances 1–2 decimals. */
export function formatChance(pct: number): string {
  if (pct >= 10) return `${Math.round(pct * 10) / 10}`.replace(/\.0$/, '')
  if (pct >= 1) return (Math.round(pct * 10) / 10).toString()
  return (Math.round(pct * 100) / 100).toString()
}

/** Which lotteries a dungeon draws from, with a source tag (for the item
 *  reverse index and the detail sections). */
export function dungeonLotteries(d: DungeonEntry): { name: string; source: 'chest' | 'special' | 'boss' }[] {
  const out: { name: string; source: 'chest' | 'special' | 'boss' }[] = []
  if (d.chests?.normal) out.push({ name: d.chests.normal, source: 'chest' })
  if (d.chests?.special) out.push({ name: d.chests.special, source: 'special' })
  for (const t of d.bossRewards) {
    for (const e of t.entries) {
      if (e.lottery) out.push({ name: e.lottery, source: 'boss' })
    }
  }
  return out
}

/** Reverse index: item id → dungeons whose loot tables can drop it. */
export function dungeonsByItem(file: DungeonsFile): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()
  for (const d of file.dungeons) {
    const seen = new Set<string>()
    for (const { name } of dungeonLotteries(d)) {
      for (const slot of file.lotteries[name] ?? []) {
        for (const it of slot.items) seen.add(it.item)
      }
    }
    for (const item of seen) {
      let set = out.get(item)
      if (!set) out.set(item, (set = new Set()))
      set.add(d.id)
    }
  }
  return out
}
