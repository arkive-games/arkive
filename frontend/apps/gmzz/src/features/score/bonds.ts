// Relative imports, like `score/data.ts`: the root vitest config has no `@` alias.
import type { HistoryResearchRank } from '../fellows/data'
import { clampStar, type FellowEntry } from './fellowSkill'
import type { PartnerAttribute, PartnerScoring, SecretPartner } from '../secretpartners/data'

/**
 * The 非凡人物 group's two derivable items.
 *
 * Of the group's four species only two can be computed from the package:
 *
 * - **秘偶属性** is the one bonds score the client computes itself. The 支配 page
 *   previews the change a slot assignment would make, and its arithmetic
 *   (`CalcDominateTalentMarkScore` in `SecretPartner_Dominate_Page.lua`) is: for
 *   every owned puppet, the sum of its `Prop_Talent` ladders' Marks at its stage,
 *   weighted by `SECRET_PARTNER_IN_DOMINATE_RATE` when it holds a dominate slot
 *   and `SECRET_PARTNER_NON_DOMINATE_RATE` otherwise; the whole thing rounded
 *   half up. Only the attribute talents count — the workshop and travel perks in
 *   the `Talent` column carry no Mark there.
 * - **历史研究**'s score is the `Mark` of the research rank the player has reached.
 *   Nothing in the client says so in code (the rank page only shows research
 *   points), but the species' own benchmark curves land exactly on the Marks of
 *   ranks 8 and 17, which they would not do for any other quantity.
 *
 * 秘偶技能 and 人脉技能 have no client formula either (`SkillScoreData` ships its
 * per-level columns stripped), but both shapes were fitted from in-game panel
 * readings — see `puppetSkillScore` and `fellowSkill.ts`, and
 * `docs/gmzz-skill-scores.md` for every reading.
 */

export type PuppetEntry = {
  partnerId: number
  /**
   * The puppet's level, 0..`PartnerScoring.maxStar`; 0 means not owned. Named
   * `stage` because that is what stored drafts already call it.
   */
  stage: number
  /** Deployed (上阵, the client's 支配). */
  dominated: boolean
}

export type BondsDraft = {
  puppets: PuppetEntry[]
  /** Deploy slots the player has unlocked; null until set, when `DEFAULT_DEPLOY_SLOTS` applies. */
  dominateSlots: number | null
  /**
   * `HistoryResearchRank.id` from when the rank was picked by hand. No longer
   * read — the rank now follows from the research points — but kept so stored
   * drafts still validate.
   */
  historyRankId: number | null
  /** Research points from sources other than relations; absent or null is 0. */
  historyExtraPoints?: number | null
  /** The puppet whose skill is carried; absent or null picks the best-scoring owned one. */
  skillPartnerId?: number | null
  /**
   * The skill level, absent or null meaning `CALIBRATED_SKILL_LEVEL`. Named for
   * the puppet skill it was introduced with, but 途径, 秘偶 and 人脉 skill levels
   * are always equal, so the connection skill reads it too.
   */
  puppetSkillLevel?: number | null
  /** Owned connections and their stars; absent means none owned. */
  fellows?: FellowEntry[]
  /** The connection whose skill is carried; absent or null picks the best-scoring owned one. */
  fellowSkillId?: number | null
  /** The relation the carried skill is scored with; absent, null or stale picks its best. */
  fellowRelationId?: number | null
}

/**
 * Deploy slots the current season opens, read off the in-game panel. Only a
 * default: the slot input still goes up to `maxDominateSlots`. The client's
 * `initialDominateSlots` (1) is the first season's, and which season opens which
 * slot lives in `SecretPartnerDominateData`, keyed by a season the page cannot know.
 */
export const DEFAULT_DEPLOY_SLOTS = 3

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isPuppetEntry(value: unknown): value is PuppetEntry {
  return (
    isRecord(value) &&
    isFiniteNumber(value.partnerId) &&
    isFiniteNumber(value.stage) &&
    typeof value.dominated === 'boolean'
  )
}

function isOptionalNumber(value: unknown): boolean {
  return value === undefined || value === null || isFiniteNumber(value)
}

function isFellowEntry(value: unknown): value is FellowEntry {
  return isRecord(value) && isFiniteNumber(value.fellowId) && isFiniteNumber(value.star) && clampStar(value.star) === value.star
}

export function isBondsDraft(value: unknown): value is BondsDraft {
  return (
    isRecord(value) &&
    Array.isArray(value.puppets) &&
    value.puppets.every(isPuppetEntry) &&
    (value.dominateSlots === null || isFiniteNumber(value.dominateSlots)) &&
    (value.historyRankId === null || isFiniteNumber(value.historyRankId)) &&
    (value.skillPartnerId === undefined || value.skillPartnerId === null || isFiniteNumber(value.skillPartnerId)) &&
    isOptionalNumber(value.puppetSkillLevel) &&
    (value.fellows === undefined || (Array.isArray(value.fellows) && value.fellows.every(isFellowEntry))) &&
    isOptionalNumber(value.fellowSkillId) &&
    isOptionalNumber(value.historyExtraPoints) &&
    isOptionalNumber(value.fellowRelationId)
  )
}

export function emptyBondsDraft(): BondsDraft {
  return { puppets: [], dominateSlots: null, historyRankId: null }
}

/** The client's `math.floor(x + 0.5)`, which is not `Math.round` for negative halves — not that a Mark sum is ever negative. */
export function roundHalfUp(value: number): number {
  return Math.floor(value + 0.5)
}

/** A puppet level, 0 (not owned) to the table's maximum. */
export function clampStage(stage: number, scoring: PartnerScoring): number {
  if (!Number.isFinite(stage)) return 0
  return Math.min(scoring.maxStar, Math.max(0, Math.trunc(stage)))
}

export function clampSlots(slots: number | null, scoring: PartnerScoring): number {
  if (slots === null || !Number.isFinite(slots)) return Math.min(DEFAULT_DEPLOY_SLOTS, scoring.maxDominateSlots)
  return Math.min(scoring.maxDominateSlots, Math.max(0, Math.trunc(slots)))
}

/** Whether the dataset carries a Mark for every attribute at every stage — a puppet without one cannot be scored. */
export function hasMarks(partner: SecretPartner): boolean {
  return (
    partner.attributes.length > 0 &&
    partner.attributes.every((attribute) => attribute.marks !== undefined && attribute.marks.length === attribute.values.length)
  )
}

/** The Marks of one puppet's attribute talents at a stage, summed. Zero when the dataset has no ladder. */
export function talentMark(partner: SecretPartner, stage: number): number {
  if (!hasMarks(partner)) return 0
  return partner.attributes.reduce((total, attribute) => total + (attribute.marks?.[stage - 1] ?? 0), 0)
}

export type PuppetResult = {
  entry: PuppetEntry
  partner: SecretPartner
  /** The Mark sum before the rate. */
  mark: number
  /** True when the puppet actually counts as dominated — see `evaluatePuppets`. */
  dominated: boolean
  rate: number
  /** `mark × rate`, unrounded; the rounding is applied to the total, as the client does. */
  score: number
}

export type PuppetsResult = {
  rows: PuppetResult[]
  slots: number
  /** How many of the slots are filled. */
  dominated: number
  /** The 秘偶属性 figure. */
  total: number
}

/**
 * Every owned puppet scored, and the total the panel would show.
 *
 * Deploy is honoured in list order up to the slot count: a draft stored with
 * more deployed puppets than slots (the player lowered the count afterwards)
 * downgrades the later ones rather than crediting a slot that does not exist.
 * Entries at level 0 (not owned) and entries whose puppet is no longer in the
 * dataset are dropped.
 */
export function evaluatePuppets(
  entries: PuppetEntry[],
  partners: SecretPartner[],
  scoring: PartnerScoring,
  dominateSlots: number | null,
): PuppetsResult {
  const slots = clampSlots(dominateSlots, scoring)
  const byId = new Map(partners.map((partner) => [partner.id, partner]))
  let dominated = 0
  const rows: PuppetResult[] = []
  for (const entry of entries) {
    const partner = byId.get(entry.partnerId)
    if (!partner) continue
    const stage = clampStage(entry.stage, scoring)
    if (stage < 1) continue
    const holdsSlot = entry.dominated && dominated < slots
    if (holdsSlot) dominated += 1
    const rate = holdsSlot ? scoring.inDominateRate : scoring.nonDominateRate
    const mark = talentMark(partner, stage)
    rows.push({ entry, partner, mark, dominated: holdsSlot, rate, score: mark * rate })
  }
  return {
    rows,
    slots,
    dominated,
    total: roundHalfUp(rows.reduce((total, row) => total + row.score, 0)),
  }
}

export type ActiveAttribute = {
  key: string
  name: string
  format: PartnerAttribute['format']
  /** Summed over every owned puppet, each at its deploy rate. */
  value: number
  /** How many puppets contribute to it. */
  sources: number
}

/**
 * Every attribute the owned puppets currently grant, summed by key. A deployed
 * puppet gives its attributes at `inDominateRate` and the rest at
 * `nonDominateRate` — the same split the score uses. Ordered by first
 * appearance in the dataset's attribute order, so the list does not reshuffle
 * as levels change.
 */
export function activeAttributes(result: PuppetsResult, scoring: PartnerScoring): ActiveAttribute[] {
  const totals = new Map<string, ActiveAttribute>()
  for (const row of result.rows) {
    const stage = clampStage(row.entry.stage, scoring)
    for (const attribute of row.partner.attributes) {
      const value = attribute.values[Math.min(stage, attribute.values.length) - 1]
      if (value === undefined) continue
      const total = totals.get(attribute.key) ?? { key: attribute.key, name: attribute.name, format: attribute.format, value: 0, sources: 0 }
      total.value += value * row.rate
      total.sources += 1
      totals.set(attribute.key, total)
    }
  }
  return [...totals.values()]
}

/* ------------------------------------------------------------ 秘偶技能 */

/** The default skill level: the one most panel readings were taken at. */
export const CALIBRATED_SKILL_LEVEL = 38

/** `SkillScoreData.skillScoreRowNameByLvl` names `DeltaLv1..75`: no skill level scores past 75. */
export const MAX_SKILL_LEVEL = 75

/**
 * 秘偶技能 at tier 1 is `floor(k × (L + 9))` for skill level L, k by puppet
 * quality (4 purple … 7 red), here in hundredths. At L38 that is 1034 / 1292 /
 * 1613 / 2016, the figures the panel shows. Orange is what the client's own max
 * curve is made of: an orange puppet at the highest tier the season allows,
 * which the formula reproduces at all 27 points the curve can be placed at.
 */
const PUPPET_SKILL_K: Record<number, number> = { 4: 2200, 5: 2750, 6: 3432, 7: 4290 }

export function puppetSkillBase(quality: number, skillLevel: number): number | undefined {
  const k = PUPPET_SKILL_K[quality]
  return k === undefined ? undefined : Math.floor((k * (skillLevel + 9)) / 100)
}

/** A stored or typed skill level, 1..`MAX_SKILL_LEVEL`; anything unreadable is the calibrated level. */
export function clampSkillLevel(skillLevel: number | null | undefined): number {
  const value = skillLevel != null && Number.isFinite(skillLevel) ? Math.trunc(skillLevel) : CALIBRATED_SKILL_LEVEL
  return Math.min(MAX_SKILL_LEVEL, Math.max(1, value))
}

/** Each skill tier past the first adds this fraction of the tier-1 score, in thousandths. */
const TIER_STEP_PER_MILLE = 215

/**
 * The puppet's skill tier at a level: the highest `upgrades` row whose
 * `requiredStage` the level meets (1/10/20/30/40/50 → tiers 1..6 for every
 * shipped puppet). 0 when the puppet is not owned. Only a tier change moves the
 * score; levels in between do not.
 */
export function skillTier(partner: SecretPartner, level: number): number {
  let tier = 0
  for (const upgrade of partner.upgrades) if (level >= upgrade.requiredStage) tier = Math.max(tier, upgrade.tier)
  return tier
}

export type PuppetSkillScore = {
  score: number
  tier: number
  /**
   * True where no reading backs the figure: red past tier 1 (only its tier-1
   * score has been read; the multiplier is the one every other quality shares),
   * or a quality without a base.
   */
  estimated: boolean
}

/**
 * 秘偶技能 = floor(base(quality, L) × (1 + 0.215 × (tier − 1))).
 *
 * The base is floored before the tier multiplier — taking it the other way
 * round misses gold tier 3 (1847) by one. Fitted to every reading taken (orange
 * tiers 1-5, gold 2-5, purple 4-5, red 1 at L38; orange tier 2 at L16) with no
 * residual; the multiplier is shared by all four qualities, and tier 6 is
 * confirmed by the max curve. Integer arithmetic, because `1613 × 1.86` in
 * floating point is not reliably 3000.18.
 */
export function puppetSkillScore(partner: SecretPartner, level: number, skillLevel: number = CALIBRATED_SKILL_LEVEL): PuppetSkillScore {
  const tier = skillTier(partner, level)
  const base = puppetSkillBase(partner.quality, clampSkillLevel(skillLevel))
  if (tier < 1 || base === undefined) return { score: 0, tier, estimated: tier >= 1 }
  const score = Math.floor((base * (1000 + TIER_STEP_PER_MILLE * (tier - 1))) / 1000)
  return { score, tier, estimated: partner.quality === 7 && tier > 1 }
}

/**
 * The carried puppet skill: the chosen puppet if it is owned, otherwise the
 * best-scoring owned one. Only one puppet skill can be equipped.
 */
export function carriedPuppetSkill(
  entries: PuppetEntry[],
  partners: SecretPartner[],
  scoring: PartnerScoring,
  chosenId: number | null | undefined,
  skillLevel: number | null | undefined,
): { partner: SecretPartner; result: PuppetSkillScore } | null {
  const level = skillLevel ?? CALIBRATED_SKILL_LEVEL
  const byId = new Map(partners.map((partner) => [partner.id, partner]))
  const owned = entries
    .map((entry) => ({ partner: byId.get(entry.partnerId), stage: clampStage(entry.stage, scoring) }))
    .filter((row): row is { partner: SecretPartner; stage: number } => row.partner !== undefined && row.stage >= 1)
    .map((row) => ({ partner: row.partner, result: puppetSkillScore(row.partner, row.stage, level) }))
  if (owned.length === 0) return null
  const chosen = owned.find((row) => row.partner.id === chosenId)
  return chosen ?? owned.reduce((best, row) => (row.result.score > best.result.score ? row : best))
}

/* ------------------------------------------------------------ 历史研究 */

/**
 * The rank a research-point total has reached: the highest whose threshold the
 * total meets, as `FellowSystem.GetCurrentHistoryID` finds it. Below the first
 * threshold there is no rank, and no score.
 */
export function historyRankFor(ranks: HistoryResearchRank[], points: number): HistoryResearchRank | null {
  if (!Number.isFinite(points)) return null
  let found: HistoryResearchRank | null = null
  for (const rank of [...ranks].sort((a, b) => a.score - b.score)) {
    if (points >= rank.score) found = rank
  }
  return found
}

export function historyRankById(ranks: HistoryResearchRank[], id: number | null): HistoryResearchRank | null {
  if (id === null) return null
  return ranks.find((rank) => rank.id === id) ?? null
}

/** The 历史研究 score: the Mark of the rank the points reach, or 0 before the first rank. */
export function historyScore(ranks: HistoryResearchRank[], points: number): number {
  return historyRankFor(ranks, points)?.mark ?? 0
}

/** Points from other sources, as stored: a non-negative whole number. */
export function extraResearchPoints(draft: BondsDraft): number {
  const value = draft.historyExtraPoints
  return value != null && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0
}
