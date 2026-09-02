// Relative rather than the `@/` alias: the root `vitest.config.ts` defines no
// aliases (each app owns its own `@`), and this module's arithmetic is tested.
import { dataUrl } from '../../lib/urls'

export type Artifact = {
  id: number
  name: string
  /** 1 攻击, 2 防御, 3 特化 — also the slot it goes in. */
  groupId: number | null
  groupName: string | null
  /** Usage bucket: 1 副本, 2 竞技, 3 通用. */
  tag: number | null
  initialGrade: number | null
  icon: string | null
  description: string
  seasons: number[]
}

/** Grade ladder. **Lower grade is better** — 3 is the starting grade, 0 the best. */
export type GradeRung = { grade: number; mark: number; note: string }

export type Risk = { id: number | null; level: string; name: string; description: string }

export type ResonanceRung = {
  affixCount: number | null
  mark: number | null
  stats: [string, number][]
}

export type KnowledgeRung = {
  level: number | null
  k1: number | null
  /** The coefficient every relic number scales by. */
  k2: number | null
  roleLevelRequired: number | null
}

export type Material = {
  id: number
  name: string
  /** 1 fills 攻击/特化 artifacts, 2 fills 防御/特化. */
  type: number | null
  tc: number | null
  quality: number | null
  icon: string | null
  description: string
  /** Percent chance of rolling exactly N affixes, N = 1..6. Sums to 100. */
  affixCountWeights: number[]
  /** Selects the affix pool. NOT always equal to `tc`. */
  poolSet: number | null
}

export type PoolAffix = {
  id: number
  mark: number
  stat: string
  /** The table value. The game displays `floor(value * k2)`. */
  value: number
  groupId: number
  saturation: number | null
}

export type Relics = {
  artifacts: Artifact[]
  promotion: { ladder: GradeRung[]; bestGrade: number; worstGrade: number }
  risks: Risk[]
  /** season -> group tier (e.g. "103") -> ladder by affix count. */
  resonance: Record<string, Record<string, ResonanceRung[]>>
  knowledge: Record<string, KnowledgeRung[]>
  /** season -> stat key -> Mark per point. */
  worths: Record<string, Record<string, number>>
  materials: { items: Material[]; groups: Record<string, unknown>; affixPool: Record<string, Record<string, PoolAffix[]>> }
  constants: Record<string, unknown>
  groupNames: Record<string, string>
  scoreRule: string
}

export async function loadRelics(): Promise<Relics> {
  const response = await fetch(dataUrl('relics/relics.json'))
  if (!response.ok) throw new Error(`Unable to load relic data (${response.status})`)
  const payload: unknown = await response.json()
  if (!payload || typeof payload !== 'object') throw new Error('Invalid relic data')
  return payload as Relics
}

/** The current season's rows, falling back to the highest available. */
function forSeason<T>(bySeason: Record<string, T>, season: number | undefined): T | undefined {
  if (season != null && bySeason[String(season)]) return bySeason[String(season)]
  const keys = Object.keys(bySeason).sort((a, b) => Number(b) - Number(a))
  return keys.length > 0 ? bySeason[keys[0]] : undefined
}

export function knowledgeLadder(relics: Relics, season?: number): KnowledgeRung[] {
  return forSeason(relics.knowledge, season) ?? []
}

/** `k2` at a knowledge level. It is `0.1 + 0.02 * level`, but read the table. */
export function k2For(relics: Relics, level: number, season?: number): number {
  const ladder = knowledgeLadder(relics, season)
  const exact = ladder.find((rung) => rung.level === level)
  return exact?.k2 ?? ladder[0]?.k2 ?? 0
}

export function worthFor(relics: Relics, stat: string, season?: number): number {
  return forSeason(relics.worths, season)?.[stat] ?? 0
}

export function artifactsInGroup(relics: Relics, groupId: number): Artifact[] {
  return relics.artifacts.filter((a) => a.groupId === groupId).sort((a, b) => a.id - b.id)
}

export function gradeRung(relics: Relics, grade: number): GradeRung | undefined {
  return relics.promotion.ladder.find((rung) => rung.grade === grade)
}

/** Grades offered by the ladder, best (lowest) first. */
export function gradeOptions(relics: Relics): number[] {
  return relics.promotion.ladder.map((rung) => rung.grade).sort((a, b) => a - b)
}

/**
 * How many affixes a grade lets take effect.
 *
 * `MainAttributeTipsEntryNumber` is indexed by grade 0..3 and reads 6/6/5/4, and
 * the promote rows agree in prose ("3级封印物最多生效4条词条"). So a grade-3
 * artifact stops paying past four affixes however many the material rolled.
 */
export function effectiveAffixCap(relics: Relics, grade: number): number {
  const caps = relics.constants['MainAttributeTipsEntryNumber']
  if (Array.isArray(caps) && typeof caps[grade] === 'number') return caps[grade] as number
  return 6
}

/* -------------------------------------------------------------------- score */

/**
 * One chosen affix on a material: the pool row it came from.
 *
 * `affixId` is carried so a picker can key options by identity — two rungs of
 * one stat can share a `value`, so `{stat, value}` is not a unique handle.
 */
export type ChosenRelicAffix = { stat: string; value: number; mark: number; affixId?: number }

/**
 * The displayed value of a relic affix.
 *
 * The table value is a base; the game shows `floor(value * k2)`. A 攻击 word
 * whose table value is 490 reads +156 at k2 = 0.32.
 */
export function displayedValue(value: number, k2: number): number {
  return Math.floor(value * k2)
}

/**
 * A material's score: `floor(k2 * sum(mark))`.
 *
 * **Sum first, then floor once.** Flooring each affix and summing gives 1268 or
 * 1270 where the game shows 1269, so the order is part of the rule — it ships in
 * the dataset as `scoreRule` for exactly that reason.
 */
export function materialScore(affixes: ChosenRelicAffix[], k2: number): number {
  const total = affixes.reduce((sum, affix) => sum + affix.mark, 0)
  return Math.floor(k2 * total)
}

/** Mark for a stat amount, from the season's worth table. */
export function markForStat(relics: Relics, stat: string, value: number, season?: number): number {
  return Math.round(value * worthFor(relics, stat, season))
}

export type RelicSlotState = {
  /** 1 攻击, 2 防御, 3 特化. */
  groupId: number
  artifactId: number | null
  grade: number
  /**
   * The socketed material. It selects the affix pool, so the slot is not
   * self-describing without it — the scorer ignores it, but the UI needs it on
   * the same state object rather than in a parallel one.
   */
  materialId: number | null
  /** Affixes across the material(s) socketed into this artifact. */
  affixes: ChosenRelicAffix[]
}

export type RelicSlotResult = {
  state: RelicSlotState
  artifact: Artifact | null
  /** 封印物装配 — the grade ladder's mark. */
  assemblyScore: number
  /** 非凡共鸣 — from the resonance ladder at the effective affix count. */
  resonanceScore: number
  resonanceStats: [string, number][]
  /** 封印物词条 — floor(k2 * sum(mark)). */
  affixScore: number
  /** Affixes beyond the grade's cap, which pay nothing. */
  cappedOut: number
  total: number
}

/**
 * The resonance tier key for an artifact at a grade.
 *
 * `Group` in the resonance table is the group id and a grade tier concatenated:
 * 101/102/103 are attack at tier 1/2/3. The tier is the *effective* grade,
 * clamped to 1..3 because grade 0 shares grade 1's tier.
 */
export function resonanceKey(groupId: number, grade: number): string {
  // `groupId * 100 + tier`, not string concatenation: the real group ids are
  // 1/2/3, so concatenating gives "13" where the table is keyed "103" and every
  // lookup misses — which reads as 非凡共鸣 being worth zero rather than as an
  // error. Grade 0 shares grade 1's tier.
  return String(groupId * 100 + Math.min(3, Math.max(1, grade)))
}

export function evaluateRelicSlot(
  relics: Relics,
  state: RelicSlotState,
  knowledgeLevel: number,
  season?: number,
): RelicSlotResult {
  const artifact = relics.artifacts.find((a) => a.id === state.artifactId) ?? null
  const k2 = k2For(relics, knowledgeLevel, season)

  const assemblyScore = gradeRung(relics, state.grade)?.mark ?? 0

  const cap = effectiveAffixCap(relics, state.grade)
  const effective = state.affixes.slice(0, cap)
  const cappedOut = Math.max(0, state.affixes.length - cap)

  const ladder = forSeason(relics.resonance, season)?.[resonanceKey(state.groupId, state.grade)] ?? []
  const rung = ladder.find((r) => r.affixCount === effective.length)
  const resonanceScore = rung?.mark ?? 0
  const resonanceStats = rung?.stats ?? []

  const affixScore = materialScore(effective, k2)

  return {
    state,
    artifact,
    assemblyScore,
    resonanceScore,
    resonanceStats,
    affixScore,
    cappedOut,
    total: assemblyScore + resonanceScore + affixScore,
  }
}

export function newRelicSlot(groupId: number, worstGrade: number): RelicSlotState {
  return { groupId, artifactId: null, grade: worstGrade, materialId: null, affixes: [] }
}

/**
 * The most affixes a material can roll, from the dataset rather than a literal.
 *
 * `XMatMaxWordNum` in the client's own constants; `effectiveAffixCap` then
 * narrows it by the artifact's grade.
 */
export function maxAffixes(relics: Relics): number {
  const max = relics.constants['XMatMaxWordNum']
  return typeof max === 'number' ? max : 6
}

/** The season this dataset scores — the highest one present. */
export function currentSeason(relics: Relics): number | undefined {
  const keys = Object.keys(relics.worths).map(Number).filter((n) => !Number.isNaN(n))
  return keys.length > 0 ? Math.max(...keys) : undefined
}

/** The affix pool a material draws from, flattened across rarity tags. */
export function poolFor(relics: Relics, poolSet: number | null): PoolAffix[] {
  if (poolSet == null) return []
  const tags = relics.materials.affixPool[String(poolSet)]
  if (!tags) return []
  return Object.values(tags).flat()
}

/** Distinct stats in a pool, in first-seen order. */
export function poolStats(pool: PoolAffix[]): string[] {
  return [...new Set(pool.map((affix) => affix.stat))]
}

/** The rungs a stat offers in a pool, richest first. */
export function poolRungs(pool: PoolAffix[], stat: string): PoolAffix[] {
  return pool.filter((affix) => affix.stat === stat).sort((a, b) => b.mark - a.mark)
}

export function materialsForGroup(relics: Relics, groupId: number): Material[] {
  // 特化 (3) takes both material types; 攻击 (1) takes type 1, 防御 (2) type 2.
  return relics.materials.items
    .filter((m) => (groupId === 3 ? true : m.type === groupId))
    // Stable order, so the default pick is not "whichever row came first".
    .sort((a, b) => (b.quality ?? 0) - (a.quality ?? 0) || a.id - b.id)
}
