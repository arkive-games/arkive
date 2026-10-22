// Relative imports, like `score/data.ts`: the root vitest config has no `@` alias.
import type { HistoryResearchRank } from '../fellows/data'
import type { PartnerScoring, SecretPartner } from '../secretpartners/data'

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
 * 秘偶技能 and 人脉技能 are server values with no client formula — `SkillScoreData`
 * ships as bare ids — so they stay typed in from the in-game panel.
 */

export type PuppetEntry = {
  partnerId: number
  /** 1..`PartnerScoring.maxStar`, the game's 阶. */
  stage: number
  dominated: boolean
}

export type BondsDraft = {
  puppets: PuppetEntry[]
  /** Dominate slots the player has unlocked; null until set, when the initial count applies. */
  dominateSlots: number | null
  /** `HistoryResearchRank.id`; null for no rank yet. */
  historyRankId: number | null
}

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

export function isBondsDraft(value: unknown): value is BondsDraft {
  return (
    isRecord(value) &&
    Array.isArray(value.puppets) &&
    value.puppets.every(isPuppetEntry) &&
    (value.dominateSlots === null || isFiniteNumber(value.dominateSlots)) &&
    (value.historyRankId === null || isFiniteNumber(value.historyRankId))
  )
}

export function emptyBondsDraft(): BondsDraft {
  return { puppets: [], dominateSlots: null, historyRankId: null }
}

/** The client's `math.floor(x + 0.5)`, which is not `Math.round` for negative halves — not that a Mark sum is ever negative. */
export function roundHalfUp(value: number): number {
  return Math.floor(value + 0.5)
}

export function clampStage(stage: number, scoring: PartnerScoring): number {
  if (!Number.isFinite(stage)) return 1
  return Math.min(scoring.maxStar, Math.max(1, Math.trunc(stage)))
}

export function clampSlots(slots: number | null, scoring: PartnerScoring): number {
  if (slots === null || !Number.isFinite(slots)) return scoring.initialDominateSlots
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
 * Dominate is honoured in list order up to the slot count: a draft stored with
 * more dominated puppets than slots (the player lowered the count afterwards)
 * downgrades the later ones rather than crediting a slot that does not exist.
 * Entries whose puppet is no longer in the dataset are dropped.
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

/** The 历史研究 score: the rank's Mark, or 0 before the first rank. */
export function historyScore(ranks: HistoryResearchRank[], id: number | null): number {
  return historyRankById(ranks, id)?.mark ?? 0
}
