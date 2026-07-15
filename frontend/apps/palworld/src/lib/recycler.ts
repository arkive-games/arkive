import { DATA_BASE } from './urls'
import type { LotteryItem, LotterySlot } from './dungeons'

// --- data shapes (mirror recycler.json, emitted by tools/palworld/recycler.py) --
// The Ancient Civilization Relic Recycler consumes one World Tree relic and
// rolls an item lottery (same slot machinery as dungeon chests: each slot is
// an independent roll at `prob` %, then one item is weight-drawn).

export interface RecyclerRecipe {
  /** Input relic item id (WorldTreeRelic_01 … _05). */
  input: string
  /** RequiredWorkAmount to finish one conversion. */
  work: number
  slots: LotterySlot[]
}
export interface RecyclerFile {
  /** Building id the recipes belong to (AncientRelicRecycler). */
  building: string
  recipes: RecyclerRecipe[]
  /** Feeding this item speeds the conversion up by `multiplier`. */
  boost?: { item: string; multiplier: number }
}

const cache = new Map<string, Promise<RecyclerFile>>()

/** Load (and cache) the recycler dataset. Language-independent: item and
 *  building names come from the catalog bundles. */
export function loadRecycler(): Promise<RecyclerFile> {
  let p = cache.get('file')
  if (!p) {
    p = fetch(`${DATA_BASE}/recycler.json`).then((r) => {
      if (!r.ok) throw new Error(`recycler.json: ${r.status}`)
      return r.json() as Promise<RecyclerFile>
    })
    cache.set('file', p)
  }
  return p
}

// --- derived helpers -----------------------------------------------------------

/** Several slots of one recipe share an identical item pool (e.g. five
 *  awakening-gem bonus rolls at halving chances). A group merges them: the
 *  shared pool plus the per-roll probabilities. */
export interface SlotGroup {
  /** Pool identity — same pool (item ids + weights) → same key across tiers,
   *  so the building page can align groups into comparison-table rows. */
  key: string
  /** One entry per merged slot, in slot order. */
  rolls: number[]
  items: LotteryItem[]
}

/** Pool identity of a slot: item ids + weights (counts vary by tier and stay
 *  out so e.g. "wood ×1–3" and "wood ×9–11" land on the same table row). */
export function slotPoolKey(slot: LotterySlot): string {
  return slot.items.map((i) => `${i.item}:${i.weight}`).join('|')
}

/** Merge a recipe's slots into pool groups, preserving slot order. */
export function groupSlots(slots: LotterySlot[]): SlotGroup[] {
  const byKey = new Map<string, SlotGroup>()
  for (const slot of slots) {
    const key = slotPoolKey(slot)
    let g = byKey.get(key)
    if (!g) byKey.set(key, (g = { key, rolls: [], items: slot.items }))
    g.rolls.push(slot.prob)
  }
  return [...byKey.values()]
}

/** Chance (%) that at least one of a group's independent rolls hits. */
export function anyRollChance(rolls: number[]): number {
  let miss = 1
  for (const p of rolls) miss *= 1 - p / 100
  return (1 - miss) * 100
}

/** Combined count range over a group's rolls (all-hit upper bound, single-hit
 *  lower bound) — only meaningful for guaranteed single-roll pools; used to
 *  render "×1–3" next to 100% cells. */
export function groupCountRange(g: SlotGroup): { min: number; max: number } {
  const min = Math.min(...g.items.map((i) => i.min))
  const max = Math.max(...g.items.map((i) => i.max))
  return { min, max }
}
