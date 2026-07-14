import type { WorkType } from './pals'

// Pal Essence Condenser work-suitability upgrades, reverse-engineered from
// Palworld-Win64-Shipping.exe 1.0 (UPalIndividualCharacterParameter::
// GetRankBasedWorkSuitabilityBonus). Each condenser star grants +1 to one
// suitability; the 4th star grants +1 to all. See
// docs/superpowers/specs/2026-07-14-palworld-condenser-suitability-ui-design.md.

/** The binary's fixed tie-break table (enum order). OilExtraction is absent:
 *  its level still counts when ranking distinct levels, but it can never be
 *  picked — only the 4th star raises it. */
const CONDENSE_PRIORITY: WorkType[] = [
  'EmitFlame', 'Watering', 'Seeding', 'GenerateElectricity', 'Handcraft',
  'Collection', 'Deforest', 'Mining', 'ProductMedicine',
  'Cool', 'Transport', 'MonsterFarm',
]

export interface StarUpgrade {
  star: 1 | 2 | 3 | 4
  from: number
  to: number
}

export interface CondenseEntry {
  base: number
  final: number
  stars: StarUpgrade[]
}

/** The suitability holding the k-th highest distinct level (k=0 is the top),
 *  ties broken by CONDENSE_PRIORITY; null when there is no k-th level or only
 *  OilExtraction holds it. */
function pick(levels: Map<WorkType, number>, k: number): WorkType | null {
  const distinct = [...new Set(levels.values())].sort((a, b) => b - a)
  if (k >= distinct.length) return null
  const target = distinct[k]
  return CONDENSE_PRIORITY.find((w) => levels.get(w) === target) ?? null
}

/** Simulate fully condensing a pal (4 stars): which star upgrades which work
 *  suitability, from the base levels and the species' BestWorkSuitability.
 *  Book (Applied Technique) bonuses are not modelled. */
export function simulateCondense(
  work: Partial<Record<WorkType, number>>,
  bestWork: WorkType,
): Map<WorkType, CondenseEntry> {
  const levels = new Map<WorkType, number>()
  for (const [w, lvl] of Object.entries(work) as [WorkType, number][]) {
    if (lvl > 0) levels.set(w, lvl)
  }
  const result = new Map<WorkType, CondenseEntry>()
  for (const [w, lvl] of levels) {
    result.set(w, { base: lvl, final: lvl, stars: [] })
  }
  if (levels.size === 0) return result

  // The game reads BestWorkSuitability from the pal's species row; every pal
  // has it set. Defensive fallback (mirrors the binary's DB fallback): the
  // highest-level suitability, ties broken by priority order.
  const best = levels.has(bestWork) ? bestWork : (pick(levels, 0) ?? bestWork)

  const bump = (w: WorkType, star: StarUpgrade['star']) => {
    const lvl = levels.get(w) ?? 0
    levels.set(w, lvl + 1)
    const entry = result.get(w)!
    entry.final = lvl + 1
    entry.stars.push({ star, from: lvl, to: lvl + 1 })
  }

  for (const star of [1, 2, 3] as const) {
    let target: WorkType | null
    if (levels.size === 1) {
      target = [...levels.keys()][0]
    } else if (star === 1) {
      target = best
    } else if (star === 2) {
      target = pick(levels, 1) ?? best
    } else {
      target =
        levels.size === 2 ? best : (pick(levels, 2) ?? pick(levels, 1) ?? best)
    }
    if (target) bump(target, star)
  }
  for (const w of levels.keys()) bump(w, 4)

  return result
}
