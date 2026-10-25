// Relative imports, like `score/data.ts`: the root vitest config has no `@` alias.
import type { Fellow, FellowRelation } from '../fellows/data'

/**
 * 人脉技能 — the carried connection skill's score.
 *
 * The client has no formula for it (`SkillScoreData` ships its `DeltaLv*`
 * columns stripped), so this is a shape fitted to in-game panel readings: 35 of
 * them across skill levels 25, 29, 30, 37 and 38, every one reproduced exactly.
 * The readings and the derivation are in `docs/gmzz-skill-scores.md`.
 *
 *     score = floor(base(L) × S / 40)
 *
 * - `base(L)` depends only on the shared skill level L (途径 = 秘偶 = 人脉 skill
 *   level, always equal): `floor(28.6 × (L + 9))` for gold connections and
 *   `floor(22 × (L + 9))` for purple. It is the score of a 0★ connection with
 *   no relation bonus. The gold form also lands on all 27 points of the client's
 *   own 人脉技能 max curve (5★ at a full quality-1 relation, S = 72).
 * - `S` depends only on the connection's star (0..5) and the quality and tier
 *   of the relation it plays in. It does not move with the skill level.
 *
 * Purple connections hold no relation effect in any relation, so their S is
 * always the no-relation one.
 */

/** Gold and purple, as `FellowData.Quality` writes them. */
export const GOLD_FELLOW = 5
export const PURPLE_FELLOW = 4

export const MAX_FELLOW_STAR = 5

/** `floor(k × (L + 9))`, k in tenths so the arithmetic stays integral. */
const BASE_PER_LEVEL_TENTHS: Record<number, number> = { [GOLD_FELLOW]: 286, [PURPLE_FELLOW]: 220 }

/** The skill-level offset every skill score carries: 途径, 秘偶 and 人脉 are all linear in `L + 9`. */
export const SKILL_LEVEL_OFFSET = 9

export function fellowBase(quality: number, skillLevel: number): number {
  const perLevel = BASE_PER_LEVEL_TENTHS[quality]
  if (perLevel === undefined) return 0
  return Math.floor((perLevel * (skillLevel + SKILL_LEVEL_OFFSET)) / 10)
}

/*
 * S is kept in twentieths: every fitted step (1.5, 2.25, 1.8 …) is a whole
 * number of them, so no float ever reaches a floor.
 *
 *   no relation / tier 0:  S = 40 + 4 × star
 *   quality 1, tier ≥ 1:   S = F1(star) − d1(star) × (star + 1 − tier)
 *   quality 2, tier ≥ 1:   S = F2(star) − 2 × d1(star) × (star + 1 − tier)
 *
 * F is the score at a full relation (tier = star + 1, the most a relation can
 * reach while this connection is its lowest member); d is what each tier short
 * of that costs. d2 = 2 × d1 is confirmed at 1★, 2★, 4★ and 5★.
 */
const S_SCALE = 20
const F1 = (star: number) => (42 + 6 * star) * S_SCALE
const F2: Record<number, number> = { 0: 900, 1: 1020, 2: 1200, 3: 1320, 4: 1500, 5: 1680 }
const D1: Record<number, number> = { 0: 0, 1: 30, 2: 40, 3: 45, 4: 36, 5: 40 }

/**
 * Cells no reading supports, in `star:quality:gap` form, where gap is how many
 * tiers short of full the relation is. 1★ at quality 1 below full uses a d1
 * inferred from quality 2; 3★ uses a d1 seen over a single step, which put
 * quality 2 below quality 1 at tier 1 — so the whole 3★ quality-2 row below
 * full is unconfirmed.
 */
function isEstimate(star: number, quality: number, gap: number): boolean {
  if (gap === 0) return false
  if (quality === 1) return star === 1 || (star === 3 && gap >= 2)
  return star === 3
}

export function clampStar(star: number): number {
  if (!Number.isFinite(star)) return 0
  return Math.min(MAX_FELLOW_STAR, Math.max(0, Math.trunc(star)))
}

export type FellowS = {
  /** S × 20. */
  scaled: number
  estimated: boolean
}

/** S for a star and a relation; quality outside 1..2 or tier 0 is the no-relation value. */
export function fellowS(star: number, relationQuality: number, tier: number): FellowS {
  const s = clampStar(star)
  if ((relationQuality !== 1 && relationQuality !== 2) || tier < 1) return { scaled: (40 + 4 * s) * S_SCALE, estimated: false }
  const gap = s + 1 - Math.min(Math.trunc(tier), s + 1)
  const d = D1[s] * (relationQuality === 2 ? 2 : 1)
  const full = relationQuality === 1 ? F1(s) : F2[s]
  return { scaled: full - d * gap, estimated: isEstimate(s, relationQuality, gap) }
}

export function fellowSkillScore(quality: number, star: number, relationQuality: number, tier: number, skillLevel: number) {
  const s = fellowS(star, relationQuality, tier)
  return { score: Math.floor((fellowBase(quality, skillLevel) * s.scaled) / (40 * S_SCALE)), estimated: s.estimated }
}

/* ---------------------------------------------------------- relations */

export type FellowEntry = {
  fellowId: number
  /** 0..5. An entry exists only for an owned connection. */
  star: number
}

/**
 * A relation's tier: the lowest star among all of its members, plus one. Any
 * member not owned leaves the relation unformed, tier 0. Purple members count
 * toward the minimum like any other.
 */
export function relationTier(relation: FellowRelation, stars: Map<number, number>): number {
  if (relation.members.length === 0) return 0
  let lowest = Infinity
  for (const member of relation.members) {
    const star = stars.get(member.fellowId)
    if (star === undefined) return 0
    lowest = Math.min(lowest, clampStar(star))
  }
  return lowest + 1
}

/** The relations that can boost a connection's skill: quality 1 or 2, with an effect for that member. */
export function boostingRelations(fellow: Fellow, relations: FellowRelation[]): FellowRelation[] {
  return relations.filter(
    (relation) =>
      (relation.quality === 1 || relation.quality === 2) &&
      relation.members.some((member) => member.fellowId === fellow.id && member.effectId !== null),
  )
}

export type FellowSkillResult = {
  fellow: Fellow
  star: number
  /** The relation scored with, or null when none boosts this connection. */
  relation: FellowRelation | null
  tier: number
  score: number
  estimated: boolean
}

function scoreWith(fellow: Fellow, star: number, relation: FellowRelation | null, stars: Map<number, number>, skillLevel: number): FellowSkillResult {
  const tier = relation ? relationTier(relation, stars) : 0
  const { score, estimated } = fellowSkillScore(fellow.quality, star, relation?.quality ?? 0, tier, skillLevel)
  return { fellow, star, relation, tier, score, estimated }
}

/**
 * Every way one owned connection can be scored, one per boosting relation,
 * best first. A connection no relation boosts gets a single relation-less row.
 */
export function fellowOptions(
  fellow: Fellow,
  relations: FellowRelation[],
  stars: Map<number, number>,
  skillLevel: number,
): FellowSkillResult[] {
  const star = stars.get(fellow.id)
  if (star === undefined) return []
  const boosting = boostingRelations(fellow, relations)
  // A relation at tier 0 is not formed and scores exactly as no relation, so it is not a choice.
  const formed = boosting.filter((relation) => relationTier(relation, stars) >= 1)
  if (formed.length === 0) return [scoreWith(fellow, star, null, stars, skillLevel)]
  return formed
    .map((relation) => scoreWith(fellow, star, relation, stars, skillLevel))
    .sort((a, b) => b.score - a.score || (a.relation?.order ?? 0) - (b.relation?.order ?? 0))
}

/**
 * The carried connection skill: the chosen connection if owned, otherwise the
 * best-scoring owned one; scored with the chosen relation if it still boosts
 * that connection, otherwise its best.
 */
export function carriedFellowSkill(
  entries: FellowEntry[],
  fellows: Fellow[],
  relations: FellowRelation[],
  chosenFellowId: number | null | undefined,
  chosenRelationId: number | null | undefined,
  skillLevel: number,
): FellowSkillResult | null {
  const stars = starMap(entries)
  const byId = new Map(fellows.map((fellow) => [fellow.id, fellow]))
  const best = (fellow: Fellow) => fellowOptions(fellow, relations, stars, skillLevel)
  const chosen = chosenFellowId == null ? undefined : byId.get(chosenFellowId)
  if (chosen && stars.has(chosen.id)) {
    const options = best(chosen)
    return options.find((option) => option.relation?.id === chosenRelationId) ?? options[0] ?? null
  }
  let top: FellowSkillResult | null = null
  for (const entry of entries) {
    const fellow = byId.get(entry.fellowId)
    if (!fellow) continue
    const option = best(fellow)[0]
    if (option && (!top || option.score > top.score)) top = option
  }
  return top
}

export function starMap(entries: FellowEntry[]): Map<number, number> {
  return new Map(entries.map((entry) => [entry.fellowId, clampStar(entry.star)]))
}

/* ---------------------------------------------------- history research */

/**
 * The research points the relations have earned: each relation pays
 * `researchRewards[grade]` for every grade it has reached, and tier t means
 * grades 0..t-1 (风闻 … 本相). Every relation counts, quality 0 included.
 *
 * This is not the whole total. All twelve relations at full pay 784, while the
 * top rank needs 1440, so research also comes from somewhere the client does not
 * describe; the page adds those points as a separate input.
 */
export function relationResearchPoints(relations: FellowRelation[], stars: Map<number, number>): number {
  let total = 0
  for (const relation of relations) {
    const tier = relationTier(relation, stars)
    for (const reward of relation.researchRewards ?? []) if (reward.grade < tier) total += reward.value
  }
  return total
}

/* ------------------------------------------------------- skill level cap */

/**
 * The skill level a point on the 人脉技能 max curve stands for. That curve is a
 * 5★ connection at a full quality-1 relation (S = 72) at the highest skill level
 * the season allows, so the level is found by searching for the one whose score
 * lands on it. Every point of the shipped curve resolves to exactly one level
 * (3 up to role level 39, 38 at divinity 22-23, 45 at divinity 30). The cap is
 * shared: 途径, 秘偶 and 人脉 skill levels are always equal. Null when no level fits.
 */
export function skillLevelCap(fellowMaxBenchmark: number, maxLevel = 75): number | null {
  for (let level = 1; level <= maxLevel; level++) {
    if (fellowSkillScore(GOLD_FELLOW, MAX_FELLOW_STAR, 1, MAX_FELLOW_STAR + 1, level).score === fellowMaxBenchmark) return level
  }
  return null
}
