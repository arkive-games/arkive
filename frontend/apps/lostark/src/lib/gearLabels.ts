/**
 * Display labels for the gear selectors.
 *
 * The dataset keys gear by `EFTable_ItemLevelOption.PrimaryKey`, a stat template
 * that many items share, and names it per class — see `tools/apps/lostark/items.py`
 * for the join. Two derivations happen here rather than in the pipeline, because
 * both depend on the resolved strings of whichever locale is loaded:
 *
 * - a **set label** is the common prefix of one series' five piece names
 *   (宿命决断头盔 / 上装 / 下装 / 手套 / 肩甲 -> 宿命决断). The client does not
 *   name these sets — `Item.SetIndex` is 0 for every one of them — so the label
 *   is derived from the piece names it ships, never invented.
 * - a template covering two series shows both, joined.
 */

import type { GearItems } from './data'

/** Longest common prefix of `values`, or '' when they share none. */
export function commonPrefix(values: string[]): string {
  if (values.length === 0) return ''
  let low = values[0]
  let high = values[0]
  for (const value of values) {
    if (value < low) low = value
    if (value > high) high = value
  }
  let size = 0
  while (size < low.length && size < high.length && low[size] === high[size]) size += 1
  return low.slice(0, size)
}

/** The label for one series: the shared prefix, or the head piece if there is none. */
export function seriesLabel(keys: string[], names: Record<string, string>): string {
  const resolved = keys.map((key) => names[key]).filter((name) => Boolean(name))
  if (resolved.length === 0) return ''
  const prefix = commonPrefix(resolved).trim()
  // Korean series names end in a space before the slot word, so the prefix is
  // clean once trimmed; a family that ever shared no prefix falls back to the
  // full name of its first piece rather than to nothing.
  return prefix || resolved[0]
}

const JOIN = ' · '

/**
 * Label for an armour set at one item level, for the class that wears it.
 *
 * Returns '' when the class cannot wear the group — the caller uses that to hide
 * the option, matching the game, which only ever shows you your own armour.
 */
export function armourSetLabel(
  items: GearItems | undefined,
  group: string,
  classId: number,
  names: Record<string, string>,
): string {
  const series = items?.sets[group]?.series[String(classId)]
  if (!series) return ''
  const labels = series.map((keys) => seriesLabel(keys, names)).filter(Boolean)
  return [...new Set(labels)].join(JOIN)
}

/** Label for a weapon template, for the selected class. */
export function weaponLabel(
  items: GearItems | undefined,
  template: string,
  classId: number,
  names: Record<string, string>,
): string {
  const keys = items?.weapons[template]?.names[String(classId)]
  if (!keys) return ''
  const labels = keys.map((key) => names[key]).filter(Boolean)
  return [...new Set(labels)].join(JOIN)
}

/**
 * The item-grade palette index for an `Item.Grade`.
 *
 * `index.css` carries four grade colours, sampled from the tooltip frames for
 * 英雄 / 传说 / 遗物 / 古代 = Grade 3..6. Esther (7) has no colour there, so it
 * renders in the default foreground rather than in a made-up one.
 */
export function gradePalette(grade: number | undefined): number | null {
  if (grade === undefined) return null
  const index = grade - 3
  return index >= 0 && index <= 3 ? index : null
}
