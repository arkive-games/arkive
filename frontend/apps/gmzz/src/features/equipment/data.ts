// Relative rather than the `@/` alias: the root `vitest.config.ts` defines no
// aliases (each app owns its own `@`), and this module's arithmetic is the part
// most worth testing.
import { dataUrl, iconUrl } from '../../lib/urls'

/** A `[mark, statValue]` rung. Ladders arrive richest-first. */
export type Rung = [number, number]

export type EquipSlot = { id: number; name: string; order: number; seasons: number[] }

export type EquipType = {
  id: number
  name: string | null
  slot: number
  /** Stat keys that are this subtype's base stats. */
  baseStatKeys: string[]
  /**
   * Display labels for those keys — **not** the same length. A weapon has 5
   * keys against 4 labels, because `AtkMin_N`/`AtkMax_N` share the label 攻击
   * and render as one `min~max` row.
   */
  baseStatLabels: string[]
  /** Class ids this subtype is restricted to; empty means unrestricted. */
  classLimit: number[]
}

/** A playable pathway, and the weapon subtype(s) only it can equip. */
export type Profession = {
  id: number
  /** The pathway, e.g. 太阳途径. */
  name: string | null
  /** The class picked at creation, e.g. 歌颂者. */
  sequenceName: string | null
  description: string
  disabled: boolean
  weaponTypeIds: number[]
}

export type EquipItem = {
  id: number
  name: string
  typeId: number
  slot: number
  quality: number
  icon: string
  /** The 装等 on the card. Distinct from `levelRequirement`, the character gate. */
  gearLevel: number | null
  levelRequirement: number | null
  /** `[statKey, value]`, zero-valued props already dropped as the game drops them. */
  baseStats: [string, number][]
  /**
   * The item's own 装备基础 score — fixed per item, so the page shows rather
   * than asks for it. Verified exact for 无形之编排 (2430); the boots 温暖的皮靴
   * carry 2685 against a card reading 2804, a gap this table does not explain.
   */
  baseScore: number | null
  suitId: number | null
  setId: number | null
  /** The 烙印 this item wears (`Brand.id`), or null. */
  brandId: number | null
  flavour: string
}

/**
 * 烙印 — a named special effect. Items point at it via `EquipItem.brandId`;
 * `productItemId` is the item the wearer upgrades into, not the wearer.
 */
export type Brand = {
  id: number
  name: string
  effect: string
  story: string
  productItemId: number | null
}

export type EnhanceStage = {
  stage: number
  /** Score this stage contributes. Verified in game: 3 stages = 240. */
  mark: number
  /** `[statKey, amountPerStage]`. */
  stats: [string, number][]
  consume: number[]
  firstConsume: number[]
}

/** One slot within one season. A slot has several; they are not interchangeable. */
export type EnhanceBody = {
  bodyId: number
  slot: number | null
  season: number | null
  year: number | null
  stages: EnhanceStage[]
}

export type SuitTier = {
  type: number | null
  level: number | null
  mark: number | null
  requiredAveragePercent: number | null
  stats: [string, number][]
  effect: string
}

export type Suit = {
  id: number
  name: string
  fullName: string
  tag: string | null
  pieceCounts: number[]
  effect2: string
  effect3: string
}

export type AffixTier = 'normal' | 'extraordinary' | 'contaminated' | 'special'

export type Equipment = {
  slots: EquipSlot[]
  types: EquipType[]
  professions: Profession[]
  items: EquipItem[]
  brands: Brand[]
  enhancement: { bodies: EnhanceBody[]; markPerStage: number[]; maxStage: number }
  suits: { suits: Suit[]; tiers: SuitTier[] }
  affixes: {
    statKeyByFamily: Record<string, string>
    set: number
    /** slot id -> tier -> family -> ladder. */
    bySlot: Record<string, Partial<Record<AffixTier, Record<string, Rung[]>>>>
  }
}

/** One condition of a grace: how many extraordinary affixes of a stat family. */
export type GraceCondition = { count: number; groupIds: number[]; stat: string }

export type Grace = {
  id: number
  slot: number
  name: string
  extraordinaryCount: number
  conditions: GraceCondition[]
  score: number
  tags: string[]
  brief1: string
  brief2: string
}

export async function loadEquipment(): Promise<{ equipment: Equipment; graces: Grace[] }> {
  const [equipResponse, graceResponse] = await Promise.all([
    fetch(dataUrl('equipment/equipment.json')),
    fetch(dataUrl('reforge/graces.json')),
  ])
  if (!equipResponse.ok) throw new Error(`Unable to load equipment data (${equipResponse.status})`)
  if (!graceResponse.ok) throw new Error(`Unable to load grace data (${graceResponse.status})`)
  const equipment: unknown = await equipResponse.json()
  const graces: unknown = await graceResponse.json()
  if (!equipment || typeof equipment !== 'object') throw new Error('Invalid equipment data')
  if (!Array.isArray(graces)) throw new Error('Invalid grace data')
  return { equipment: equipment as Equipment, graces: graces as Grace[] }
}

/* ------------------------------------------------------------------ affixes */

/** The affix families a slot can roll at a tier, in the data's own order. */
export function familiesFor(equipment: Equipment, slot: number, tier: AffixTier): string[] {
  return Object.keys(equipment.affixes.bySlot[String(slot)]?.[tier] ?? {})
}

export function ladderFor(
  equipment: Equipment,
  slot: number,
  tier: AffixTier,
  family: string,
): Rung[] {
  return equipment.affixes.bySlot[String(slot)]?.[tier]?.[family] ?? []
}

/**
 * Mark per one point of a stat, derived from the ladder rather than hardcoded.
 *
 * The exchange rate is the whole reason Mark is comparable across stats — 1000
 * Mark buys 攻击 382 or 技能增强 80 — so it has to come from the shipped ladder,
 * not from a table of constants that could drift from it.
 */
export function markRate(ladder: Rung[]): number {
  const usable = ladder.filter(([, value]) => value !== 0)
  if (usable.length === 0) return 0
  return usable.reduce((total, [mark, value]) => total + mark / value, 0) / usable.length
}

/**
 * The Mark a stat value is worth on this ladder.
 *
 * Derived from the rate rather than looked up, because the value shown in game
 * does not always sit exactly on the shipped ladder — a 62装等 item reads
 * 攻击 +308 where the ladder's nearest rung is 306. Scaling the rate absorbs
 * that instead of forcing the user onto a rung the game did not give them.
 */
export function markForValue(ladder: Rung[], value: number): number {
  const rate = markRate(ladder)
  return rate === 0 ? 0 : Math.round(value * rate)
}

/* ------------------------------------------------------------------- grace */

/** One chosen affix on a piece. */
export type ChosenAffix = {
  tier: AffixTier
  family: string
  /** The stat amount, editable — see `markForValue`. */
  value: number
}

/**
 * The grace a set of chosen affixes triggers, or null.
 *
 * Matches on the *extraordinary* affixes only, since that is what a grace's
 * conditions count, and requires every condition to be satisfied exactly: a
 * grace asking for 攻击x2 + 技能增强x1 must not fire on 攻击x3, because the
 * client ships that as a separate row with its own name.
 */
export function graceFor(graces: Grace[], slot: number, affixes: ChosenAffix[]): Grace | null {
  const counts = new Map<string, number>()
  for (const affix of affixes) {
    if (affix.tier !== 'extraordinary') continue
    counts.set(affix.family, (counts.get(affix.family) ?? 0) + 1)
  }
  const total = [...counts.values()].reduce((a, b) => a + b, 0)
  if (total < 2) return null

  const candidates = graces
    .filter((grace) => grace.slot === slot && grace.extraordinaryCount === total)
    // Richest first, so a tie resolves toward the better grace.
    .sort((a, b) => b.score - a.score)

  for (const grace of candidates) {
    const wanted = new Map<string, number>()
    for (const condition of grace.conditions) {
      wanted.set(condition.stat, (wanted.get(condition.stat) ?? 0) + condition.count)
    }
    // Compare only the non-zero requirements: the client writes "and none of the
    // other family" as an explicit 0, which is shape rather than a requirement.
    const needed = [...wanted].filter(([, n]) => n > 0)
    const matches =
      needed.length === counts.size &&
      needed.every(([stat, n]) => counts.get(stat) === n)
    if (matches) return grace
  }
  return null
}

/* ---------------------------------------------------------------- one piece */

export type PieceState = {
  slot: number
  itemId: number | null
  /** 0..maxStage. */
  enhanceStage: number
  /** 0..100, the current stage's refinement. Tracked separately from the stage. */
  refinePercent: number
  affixes: ChosenAffix[]
}

export type PieceResult = {
  state: PieceState
  item: EquipItem | null
  brand: Brand | null
  /** The item's own 装备基础, 0 for an empty slot. */
  baseScore: number
  /** stage x markPerStage. Proven against the game. */
  enhanceScore: number
  /** Per-stat totals the enhancement grants at this stage. */
  enhanceStats: [string, number][]
  /** Sum of every chosen affix's Mark, contaminated ones subtracting. */
  affixMark: number
  grace: Grace | null
  graceScore: number
  /** baseScore + enhanceScore + affixMark + graceScore. */
  total: number
  /** Overall enhancement progress, the figure the game shows under the badge. */
  progressPercent: number
}

export function bodyFor(equipment: Equipment, slot: number, season?: number): EnhanceBody | null {
  const bodies = equipment.enhancement.bodies.filter((b) => b.slot === slot)
  if (bodies.length === 0) return null
  if (season != null) {
    const exact = bodies.find((b) => b.season === season)
    if (exact) return exact
  }
  // Latest season wins — an older body's ladder is not the one in play.
  return bodies.reduce((best, b) => ((b.season ?? 0) > (best.season ?? 0) ? b : best))
}

/**
 * The highest stage this slot's ladder actually has.
 *
 * `enhancement.maxStage` is the maximum across every body, so offering it for
 * every slot would let a slot be set past the end of its own ladder — the extra
 * stages would silently score nothing rather than being rejected.
 */
export function maxStageFor(equipment: Equipment, slot: number, season?: number): number {
  return bodyFor(equipment, slot, season)?.stages.length ?? equipment.enhancement.maxStage
}

export function enhanceOf(body: EnhanceBody | null, stage: number): {
  score: number
  stats: [string, number][]
} {
  if (!body) return { score: 0, stats: [] }
  const reached = body.stages.filter((s) => s.stage <= stage)
  const score = reached.reduce((total, s) => total + s.mark, 0)
  const totals = new Map<string, number>()
  for (const rung of reached) {
    for (const [key, amount] of rung.stats) totals.set(key, (totals.get(key) ?? 0) + amount)
  }
  return { score, stats: [...totals] }
}

/**
 * Overall enhancement progress.
 *
 * The game shows "+3" over "37%" for a piece whose stages 1-3 read 100% and
 * whose 4-8 are locked: 3 of 8 stages is 37.5%. So the badge percentage is
 * progress across the whole ladder, with the in-progress stage counting its own
 * refinement — not the refinement figure on its own.
 */
export function progressOf(body: EnhanceBody | null, stage: number, refinePercent: number): number {
  const total = body?.stages.length ?? 0
  if (total === 0) return 0
  const done = Math.min(stage, total)
  const partial = done < total ? Math.min(100, Math.max(0, refinePercent)) / 100 : 0
  return ((done + partial) / total) * 100
}

/**
 * The badge percentages a stage can show, as the game prints them (floored).
 *
 * At +3 of 8 the badge runs 37%..49%: 37.5% with the fourth stage untouched,
 * and anything up to 50% before that stage completes and the badge reads +4.
 * So each stage owns a window of the whole-ladder percentage, and a slider for
 * the refinement is bounded by the stage rather than running 0..100 on its own.
 * A complete ladder is pinned at 100.
 */
export function progressBounds(totalStages: number, stage: number): { min: number; max: number } {
  if (totalStages <= 0) return { min: 0, max: 0 }
  const done = Math.min(stage, totalStages)
  if (done >= totalStages) return { min: 100, max: 100 }
  const min = Math.floor((done / totalStages) * 100)
  const max = Math.ceil(((done + 1) / totalStages) * 100) - 1
  return { min, max: Math.max(min, max) }
}

/**
 * The in-stage refinement that puts the badge at `progress`% — the inverse of
 * `progressOf`, clamped to 0..100 so a badge value outside the stage's window
 * lands on the nearest end rather than moving the stage.
 */
export function refineFromProgress(totalStages: number, stage: number, progress: number): number {
  if (totalStages <= 0) return 0
  const done = Math.min(stage, totalStages)
  if (done >= totalStages) return 0
  const span = 100 / totalStages
  const refine = ((progress - done * span) / span) * 100
  return Math.min(100, Math.max(0, Math.round(refine)))
}

export function evaluatePiece(
  equipment: Equipment,
  graces: Grace[],
  state: PieceState,
  season?: number,
): PieceResult {
  const item = equipment.items.find((i) => i.id === state.itemId) ?? null
  const brand = item?.brandId != null ? equipment.brands.find((b) => b.id === item.brandId) ?? null : null
  const body = bodyFor(equipment, state.slot, season)
  const { score: enhanceScore, stats: enhanceStats } = enhanceOf(body, state.enhanceStage)

  let affixMark = 0
  for (const affix of state.affixes) {
    const ladder = ladderFor(equipment, state.slot, affix.tier, affix.family)
    affixMark += markForValue(ladder, affix.value)
  }

  const grace = graceFor(graces, state.slot, state.affixes)
  const graceScore = grace?.score ?? 0
  const baseScore = item?.baseScore ?? 0

  return {
    state,
    item,
    brand,
    baseScore,
    enhanceScore,
    enhanceStats,
    affixMark,
    grace,
    graceScore,
    total: baseScore + enhanceScore + affixMark + graceScore,
    progressPercent: progressOf(body, state.enhanceStage, state.refinePercent),
  }
}

/* ------------------------------------------------------------------- suits */

/**
 * The suit tier a set of pieces qualifies for.
 *
 * Type-2 tiers gate on the *average* enhancement percentage across the worn
 * pieces (`requiredAveragePercent`), which is why the page has to compute that
 * average rather than read a per-piece value.
 */
export function suitTierFor(
  equipment: Equipment,
  type: number,
  averagePercent: number,
): SuitTier | null {
  const tiers = equipment.suits.tiers
    .filter((t) => t.type === type)
    .sort((a, b) => (b.level ?? 0) - (a.level ?? 0))
  for (const tier of tiers) {
    const need = tier.requiredAveragePercent
    if (need == null || averagePercent >= need) return tier
  }
  return null
}

export function averageProgress(results: PieceResult[]): number {
  if (results.length === 0) return 0
  return results.reduce((total, r) => total + r.progressPercent, 0) / results.length
}

/** The suit an item belongs to, or null for the 212 unaffiliated pieces. */
export function suitOf(equipment: Equipment, item: EquipItem | null): Suit | null {
  if (item?.suitId == null) return null
  return equipment.suits.suits.find((suit) => suit.id === item.suitId) ?? null
}

/** The fewest pieces of a suit that trigger any of its effects. */
export function suitThreshold(suit: Suit): number {
  return suit.pieceCounts.length > 0 ? Math.min(...suit.pieceCounts) : Number.POSITIVE_INFINITY
}

export type ActiveSuit = { suit: Suit; count: number }

/**
 * The suits the worn items activate, most pieces first.
 *
 * A suit is not something the player picks: it follows from what is worn, and
 * fires once `pieceCounts[0]` of its pieces are on. With eight slots and a
 * two-piece threshold, both suits can be live at once — which is the only case
 * where there is a choice to offer.
 */
export function activeSuits(equipment: Equipment, items: (EquipItem | null)[]): ActiveSuit[] {
  const counts = new Map<number, number>()
  for (const item of items) {
    if (item?.suitId == null) continue
    counts.set(item.suitId, (counts.get(item.suitId) ?? 0) + 1)
  }
  return equipment.suits.suits
    .flatMap((suit) => {
      const count = counts.get(suit.id) ?? 0
      return count >= suitThreshold(suit) ? [{ suit, count }] : []
    })
    .sort((a, b) => b.count - a.count || a.suit.id - b.suit.id)
}

/** The slots the rating panel actually scores, in its own order. */
export function scoredSlots(equipment: Equipment, graces: Grace[]): EquipSlot[] {
  const withGraces = new Set(graces.map((g) => g.slot))
  return equipment.slots.filter((s) => withGraces.has(s.id)).sort((a, b) => a.order - b.order)
}

/** URL of an item's icon in the resource repo. */
export function equipmentIconUrl(icon: string): string {
  return iconUrl(icon)
}

/** Professions a player can actually pick, i.e. not disabled and with a weapon. */
export function playableProfessions(equipment: Equipment): Profession[] {
  return equipment.professions
    .filter((p) => !p.disabled && p.weaponTypeIds.length > 0)
    .sort((a, b) => a.id - b.id)
}

/**
 * The items that fit a slot, narrowed to a profession where that matters.
 *
 * Only weapons are class-locked, via `EquipType.classLimit`. Filtering every
 * slot by profession would empty the armour lists, since armour carries no
 * `classLimit` at all — so a subtype with no restriction always passes.
 */
export function itemsForSlot(
  equipment: Equipment,
  slot: number,
  professionId?: number | null,
): EquipItem[] {
  const restricted = new Map(equipment.types.map((type) => [type.id, type.classLimit]))
  return equipment.items
    .filter((item) => {
      if (item.slot !== slot) return false
      const limit = restricted.get(item.typeId) ?? []
      if (limit.length === 0 || professionId == null) return true
      return limit.includes(professionId)
    })
    .sort((a, b) => b.quality - a.quality || a.name.localeCompare(b.name))
}

export function newPiece(slot: number): PieceState {
  return { slot, itemId: null, enhanceStage: 0, refinePercent: 0, affixes: [] }
}
