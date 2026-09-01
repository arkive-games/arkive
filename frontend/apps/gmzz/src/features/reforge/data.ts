import { dataUrl } from '@/lib/urls'

/**
 * One stat family a grace is built from, and how many *extraordinary* affixes
 * of it the grace needs. `count: 0` is meaningful — see `combosOf`.
 */
export type GraceCondition = {
  count: number
  /** Client affix-group ids (the stat's entry in each of the two group tables). */
  groupIds: number[]
  /** Stat name, e.g. 攻击 / 技能增强. */
  stat: string
}

export type GraceUnlock =
  | { kind: 'seasonDay'; seasonId: number; day: number; raw: string }
  | { kind: 'equipment'; equipIds: number[]; count: number; raw: string }

export type Grace = {
  id: number
  /** Equipment slot id; join with `ReforgeSlot`. */
  slot: number
  name: string
  /** Sum of every condition's count — the headline requirement. */
  extraordinaryCount: number
  conditions: GraceCondition[]
  score: number
  tags: string[]
  prop1: [string, number][]
  prop2: [string, number][]
  /**
   * The client's two effect descriptions, under its own numbering.
   *
   * `brief2` is usually `brief1` worded for a healing build, but not always
   * (the 指环 two-affix rows describe an effect their own props do not produce),
   * so the pipeline does not name it. See `tools/apps/gmzz/reforge.py`.
   */
  brief1: string
  brief2: string
  passiveSkillIds: number[]
  unlock: GraceUnlock | null
  seasonIds: number[]
  /** Client asset name. No image ships for it yet — see the pipeline README. */
  icon: string
}

export type ReforgeSlot = {
  id: number
  name: string
  /** The reforge screen's own slot order (`OrderRandom`). */
  order: number
}

/**
 * One named grace, with every affix split that produces it.
 *
 * The client stores one row per split, so 征服宣言 is two rows: 攻击×3, and
 * 攻击×2 + 技能增强×1. They are the same grace to a player, so they are merged
 * here. Rows that share only the *name* are not merged: `残躯壁垒` is one text
 * id on 18 rows across five slots with different effects, and collapsing those
 * would invent a grace that does not exist.
 */
export type MergedGrace = {
  key: string
  slot: number
  name: string
  extraordinaryCount: number
  score: number
  tags: string[]
  brief1: string
  brief2: string
  unlock: GraceUnlock | null
  /** Every affix split, each as its own list of `{stat, count}` requirements. */
  combos: GraceCondition[][]
  ids: number[]
}

export async function loadReforge(): Promise<{ graces: Grace[]; slots: ReforgeSlot[] }> {
  const [graceResponse, slotResponse] = await Promise.all([
    fetch(dataUrl('reforge/graces.json')),
    fetch(dataUrl('reforge/slots.json')),
  ])
  if (!graceResponse.ok) throw new Error(`Unable to load reforge graces (${graceResponse.status})`)
  if (!slotResponse.ok) throw new Error(`Unable to load reforge slots (${slotResponse.status})`)
  const graces: unknown = await graceResponse.json()
  const slots: unknown = await slotResponse.json()
  if (!Array.isArray(graces) || !Array.isArray(slots)) throw new Error('Invalid reforge data')
  return { graces: graces as Grace[], slots: slots as ReforgeSlot[] }
}

/**
 * The conditions worth showing for one row.
 *
 * A `count: 0` condition means "and none of that family", which is how the
 * client distinguishes 攻击×3 from 攻击×2 + 技能增强×1 — both graces named
 * 征服宣言. Rendering the zero as a requirement would read as "0 attack needed",
 * so it is dropped from the label while still shaping the split it belongs to.
 */
export function combosOf(grace: Grace): GraceCondition[] {
  return grace.conditions.filter((condition) => condition.count > 0)
}

/** Stable label for one split, e.g. `攻击 x2 + 技能增强 x1`. */
export function comboKey(conditions: GraceCondition[]): string {
  return conditions.map((condition) => `${condition.stat}x${condition.count}`).join('+')
}

export function mergeGraces(graces: Grace[]): MergedGrace[] {
  const merged = new Map<string, MergedGrace>()
  for (const grace of graces) {
    // Effect text is part of the key, not just the name: same-name rows with
    // different effects are different graces.
    const key = `${grace.slot}|${grace.name}|${grace.extraordinaryCount}|${grace.brief1}`
    const combo = combosOf(grace)
    const existing = merged.get(key)
    if (existing) {
      const seen = new Set(existing.combos.map(comboKey))
      if (!seen.has(comboKey(combo))) existing.combos.push(combo)
      existing.ids.push(grace.id)
      continue
    }
    merged.set(key, {
      key,
      slot: grace.slot,
      name: grace.name,
      extraordinaryCount: grace.extraordinaryCount,
      score: grace.score,
      tags: grace.tags,
      brief1: grace.brief1,
      brief2: grace.brief2,
      unlock: grace.unlock,
      combos: [combo],
      ids: [grace.id],
    })
  }
  return [...merged.values()]
}

/** Extraordinary-affix requirements present in the data, ascending. */
export function affixCountsOf(graces: Grace[]): number[] {
  return [...new Set(graces.map((grace) => grace.extraordinaryCount))].sort((a, b) => a - b)
}
