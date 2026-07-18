import { dataUrl } from './urls'

// data-palworld/fishing.json (emitted by tools/palworld/fishing.py):
// DT_PalFishingSpotLotteryDataTable × DT_PalFishShadowDataTable + the bait
// modifiers from DT_FishingBaitItem.

/** One catchable fish at a spot: the pal a shadow resolves to, its draw share
 *  within the spot, catch-level band, day/night gate and minigame difficulty.
 *  `king`/`boss`/`rare` are the special-variant roll rates (%) when non-zero. */
export interface FishEntry {
  pal: string
  /** This catch is the alpha (BOSS_) variant of `pal`. */
  alpha?: boolean
  shadow: string
  /** Shadow size class (A–E). */
  size: string
  sharePct: number
  lvMin: number
  lvMax: number
  night?: boolean
  difficulty: number
  king?: number
  boss?: number
  rare?: number
  /** Item pool reeled in alongside the fish (field-lottery name). */
  itemLottery?: string
}

export interface FishingSpot {
  id: string
  /** Blueprint-sources area key (Grass, Sakurajima, …) — label via
   *  `items.areaLabels[area] ?? t('bp.area.'+area)`. */
  area?: string
  /** EPalFishingSpotDifficultyType tier (Easy/Normal/Hard). */
  spotDifficulty?: string
  fish: FishEntry[]
}

/** Minigame modifiers a bait item grants; only non-default values present
 *  (rates default ×1, percents 0). */
export interface FishingBait {
  item: string
  hitBar?: number
  missFight?: number
  successFight?: number
  attract?: number
  startProgress?: number
  palDropBonus?: number
  itemDropBonus?: number
}

export interface FishingFile {
  spots: FishingSpot[]
  baits: FishingBait[]
}

const j = async <T>(url: string): Promise<T> => {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${url}: ${r.status}`)
  return r.json() as Promise<T>
}

let cache: Promise<FishingFile> | null = null

/** Load (and cache) the fishing dataset (language-independent). */
export function loadFishing(): Promise<FishingFile> {
  if (!cache) cache = j<FishingFile>(dataUrl(`fishing.json`))
  return cache
}
