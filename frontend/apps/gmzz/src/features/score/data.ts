// Relative rather than the `@/` alias the older features use: the root
// `vitest.config.ts` defines no aliases (it cannot — each app owns its own `@`),
// and these transforms are the part of the page most worth testing.
import { dataUrl } from '../../lib/urls'

/**
 * A benchmark curve, split the way the client's formula is.
 *
 * `byLevel[i]` is role level `i + 1`, for levels 1..69, where the divinity
 * level provably cannot affect the result. `byDivinity[d]` is role level 70 at
 * divinity `d`. See `tools/apps/gmzz/score.py`.
 */
export type Curve = {
  byLevel: number[]
  byDivinity: number[]
}

export type Genus = {
  id: number
  name: string
  /** Client key: `Player` / `Equip` / `Relics` / `Bonds`. */
  module: string
  priority: number
  icon: string
}

export type Species = {
  id: number
  name: string
  genusId: number
  /** Client key, e.g. `Equip_Word`. */
  module: string
  priority: number
  /**
   * The client's own static columns. Emitted because they are its fields, but
   * they correspond to no level — the curves are what grades a player.
   */
  expectedScoreColumn: number
  maxScoreColumn: number
  expectedFormulaId: number
  maxFormulaId: number
  expected: Curve
  max: Curve
  materialItemIds: number[]
}

export type Band = { id: number; percentage: number; label: string }

export type Material = {
  itemId: number
  name: string
  quality: number
  icon: string
  description: string
}

export type Rating = {
  genus: Genus[]
  species: Species[]
  bands: Band[]
  materials: Material[]
  maxRoleLevel: number
  maxDivinityLevel: number
  /** The client's percentage formula, shipped so the page's maths is checkable. */
  percentFormula: string
}

export async function loadRating(): Promise<Rating> {
  const response = await fetch(dataUrl('score/rating.json'))
  if (!response.ok) throw new Error(`Unable to load Beyonder rating data (${response.status})`)
  const payload: unknown = await response.json()
  if (!payload || typeof payload !== 'object') throw new Error('Invalid Beyonder rating data')
  return payload as Rating
}

/**
 * The benchmark at a progression point.
 *
 * Divinity is only consulted once role level reaches the cap, which is exactly
 * how the client's ladder is written — its divinity branches sit behind
 * `elseif $1 < 70`. Both inputs are clamped: a divinity above the cap matches no
 * branch in the client and falls through to an unrelated default, so feeding it
 * one would produce a number the game never shows.
 */
export function benchmarkAt(curve: Curve, roleLevel: number, divinityLevel: number, maxRoleLevel: number): number {
  const level = clamp(roleLevel, 1, maxRoleLevel)
  if (level < maxRoleLevel) return curve.byLevel[level - 1] ?? 0
  return curve.byDivinity[clamp(divinityLevel, 0, curve.byDivinity.length - 1)] ?? 0
}

export function clamp(value: number, low: number, high: number): number {
  if (Number.isNaN(value)) return low
  return Math.min(high, Math.max(low, value))
}

/**
 * The client's completion percentage, as a fraction of 1.
 *
 * `Min(1, Min(1, score/expected) * 0.9 + Min(1, score/max) * 0.1)` — the
 * `Extraordinary_Score_Percent_Species` formula, shipped in the dataset so this
 * can be compared against its source. Note it is weighted 9:1 toward the
 * *expected* benchmark, so hitting expected already yields 90% plus whatever the
 * max term contributes; that is why the in-game bar moves fast early and crawls
 * at the end.
 */
export function completion(score: number, expected: number, max: number): number {
  if (!Number.isFinite(score) || score <= 0) return 0
  const hasExpected = expected > 0
  const hasMax = max > 0
  // A non-positive benchmark is not a bar you have cleared, it is a bar that is
  // missing. Letting its term count as 1 would score an *empty* item at 10% (or
  // 90%, if it were the expected side that went missing), which is worse than
  // saying nothing. So a missing side drops out and the other carries the whole
  // weight. The client's own formula would divide by zero here; it never does,
  // because no shipped curve contains a zero.
  if (!hasExpected && !hasMax) return 0
  if (!hasExpected) return Math.min(1, score / max)
  if (!hasMax) return Math.min(1, score / expected)
  return Math.min(1, Math.min(1, score / expected) * 0.9 + Math.min(1, score / max) * 0.1)
}

/**
 * The band a completion fraction falls in — the lowest whose threshold it meets.
 *
 * Rounds first, so the band always agrees with the percentage displayed beside
 * it. Banding on the raw fraction instead puts 99.06% in the 登峰造极 band while
 * the label next to it reads "99%", which looks like a bug even though both
 * numbers are right.
 */
export function bandFor(bands: Band[], percent: number): Band | undefined {
  const value = Math.round(percent * 100)
  return bands.find((band) => value <= band.percentage) ?? bands[bands.length - 1]
}

export type SpeciesResult = {
  species: Species
  score: number
  expected: number
  max: number
  /** Fraction of 1. */
  percent: number
  band: Band | undefined
  /** Points still needed to reach the expected benchmark; 0 once met. */
  toExpected: number
  /** Points still needed to reach the max benchmark; 0 once met. */
  toMax: number
}

export type GenusResult = {
  genus: Genus
  items: SpeciesResult[]
  score: number
  expected: number
  max: number
  percent: number
}

export type RatingResult = {
  groups: GenusResult[]
  score: number
  expected: number
  max: number
  /** Overall completion — see `aggregatePercent`. */
  percent: number
}

/**
 * Completion across several items.
 *
 * **This aggregation is ours, not the client's.** The shipped formula is named
 * `Extraordinary_Score_Percent_Species` and is defined for one species; nothing
 * in the package says how the panel rolls items up.
 *
 * So it averages each item's own clamped percentage rather than dividing summed
 * score by summed benchmark. Both are defensible, but the summed form lets
 * overflow carry: an item at ten times its benchmark would drag a neglected one
 * up with it, because the sum is compared against the sum. Each item is scored
 * on its own in game, so the average is the reading that cannot flatter.
 */
export function aggregatePercent(items: { percent: number }[]): number {
  if (items.length === 0) return 0
  return items.reduce((total, item) => total + item.percent, 0) / items.length
}

export function evaluate(
  rating: Rating,
  roleLevel: number,
  divinityLevel: number,
  scores: Record<number, number>,
): RatingResult {
  const groups: GenusResult[] = []
  for (const genus of [...rating.genus].sort((a, b) => a.priority - b.priority)) {
    const items = rating.species
      .filter((s) => s.genusId === genus.id)
      .sort((a, b) => a.priority - b.priority)
      .map((species) => {
        const score = Math.max(0, scores[species.id] ?? 0)
        const expected = benchmarkAt(species.expected, roleLevel, divinityLevel, rating.maxRoleLevel)
        const max = benchmarkAt(species.max, roleLevel, divinityLevel, rating.maxRoleLevel)
        const percent = completion(score, expected, max)
        return {
          species,
          score,
          expected,
          max,
          percent,
          band: bandFor(rating.bands, percent),
          toExpected: Math.max(0, expected - score),
          toMax: Math.max(0, max - score),
        }
      })
    groups.push({
      genus,
      items,
      // Totals are plain sums — those are raw points, and the game's own rating
      // is a sum of them. Only the percentage needs the careful treatment.
      score: sum(items.map((i) => i.score)),
      expected: sum(items.map((i) => i.expected)),
      max: sum(items.map((i) => i.max)),
      percent: aggregatePercent(items),
    })
  }

  return {
    groups,
    score: sum(groups.map((g) => g.score)),
    expected: sum(groups.map((g) => g.expected)),
    max: sum(groups.map((g) => g.max)),
    percent: aggregatePercent(groups.flatMap((g) => g.items)),
  }
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

/**
 * Items ranked by how many points are left before their expected benchmark.
 *
 * The panel's own advice is "raise whatever is furthest behind", and since every
 * item feeds one total, the gap to expected is the honest ordering — a large gap
 * on a small item is still the cheaper point than a small gap on a large one.
 */
export function headroom(result: RatingResult): SpeciesResult[] {
  return result.groups
    .flatMap((group) => group.items)
    .filter((item) => item.toExpected > 0)
    .sort((a, b) => b.toExpected - a.toExpected)
}

export function materialsFor(rating: Rating, species: Species): Material[] {
  return species.materialItemIds
    .map((id) => rating.materials.find((m) => m.itemId === id))
    .filter((m): m is Material => m !== undefined)
}
