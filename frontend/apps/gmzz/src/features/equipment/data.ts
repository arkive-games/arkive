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

/** The tiers a player can roll. `special` exists in the data but is not one. */
const ROLLED_TIERS: AffixTier[] = ['normal', 'extraordinary', 'contaminated']

/**
 * The affix families a slot can roll at all, in the data's own order — the
 * normal families first, then any that exist only at another tier.
 *
 * Not split by tier, because the tier is not something the player picks: it is
 * read off the value (see `classifyAffix`), so the picker offers every stat the
 * slot knows and the value decides the rest.
 */
export function familiesFor(equipment: Equipment, slot: number): string[] {
  const tiers = equipment.affixes.bySlot[String(slot)] ?? {}
  const families: string[] = []
  for (const tier of ROLLED_TIERS) {
    for (const family of Object.keys(tiers[tier] ?? {})) {
      if (!families.includes(family)) families.push(family)
    }
  }
  return families
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

/** One chosen affix on a piece: the stat and the amount the card reads. The tier follows from the amount. */
export type ChosenAffix = {
  family: string
  /** The stat amount, editable — see `markForValue`. Negative for a contaminated affix. */
  value: number
}

/** A chosen affix with the tier and Mark its value works out to. */
export type ScoredAffix = ChosenAffix & { tier: AffixTier; mark: number }

/** The highest Mark a ladder carries; 0 for an empty one. */
function topMark(ladder: Rung[]): number {
  return ladder.reduce((best, [mark]) => Math.max(best, mark), 0)
}

/**
 * The tier and Mark a chosen affix's value works out to.
 *
 * The game never asks the player which tier an affix is — the card shows a
 * gold, grey or red pip — and neither does the page: a negative value is a
 * contaminated affix, and a positive one is extraordinary once it is worth more
 * Mark than the normal ladder tops out at (400 for every family), normal
 * otherwise. The boundary is the normal top rather than the extraordinary
 * bottom (550) because the game's own extraordinary rolls reach below the
 * shipped rungs: a 4-extraordinary weapon read 攻击 +159 and 技能增强 +33, worth
 * ~416 and ~412, both gold. A family with no extraordinary ladder in this slot
 * (穿刺 on a weapon) is normal at any positive value.
 */
export function classifyAffix(equipment: Equipment, slot: number, affix: ChosenAffix): ScoredAffix {
  const { family, value } = affix
  if (value < 0) {
    const ladder = ladderFor(equipment, slot, 'contaminated', family)
    // A family with no contaminated ladder is still worth its normal rate, negated.
    const fallback = ladderFor(equipment, slot, 'normal', family)
    const mark = ladder.length > 0 ? markForValue(ladder, value) : markForValue(fallback, value)
    return { ...affix, tier: 'contaminated', mark }
  }
  const normal = ladderFor(equipment, slot, 'normal', family)
  const extraordinary = ladderFor(equipment, slot, 'extraordinary', family)
  const asNormal = markForValue(normal.length > 0 ? normal : extraordinary, value)
  if (extraordinary.length > 0 && (normal.length === 0 || asNormal > topMark(normal))) {
    return { ...affix, tier: 'extraordinary', mark: markForValue(extraordinary, value) }
  }
  return { ...affix, tier: 'normal', mark: asNormal }
}

/**
 * The flat bonus a piece's reforge score carries for its extraordinary affixes.
 *
 * The i-th extraordinary affix adds 200·i on top of its Mark, so the bonus is
 * 200 × (1 + 2 + … + n) = 100·n·(n+1). Fitted to nine weapons read off the
 * game's own 重塑 tab (the affix Marks explain everything but a remainder that
 * is 600 at two, 1200 at three and 2000 at four extraordinary affixes), so a
 * single extraordinary affix is extrapolated to 200 rather than observed. The
 * grace's own `Score` column does not appear in the total at all.
 */
export function extraordinaryBonus(count: number): number {
  return 100 * count * (count + 1)
}

/* ------------------------------------------------------------------- grace */

/**
 * The grace a set of affixes triggers, or null.
 *
 * Matches on the *extraordinary* affixes only, since that is what a grace's
 * conditions count, and requires every condition to be satisfied exactly: a
 * grace asking for 攻击x2 + 技能增强x1 must not fire on 攻击x3, because the
 * client ships that as a separate row with its own name.
 */
export function graceFor(graces: Grace[], slot: number, affixes: Pick<ScoredAffix, 'tier' | 'family'>[]): Grace | null {
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
  /** 0..maxStage — the stage being refined; stages below it are complete. */
  enhanceStage: number
  /** 0..100, how far `enhanceStage` itself has come. Meaningless at +0, where nothing is being refined. */
  refinePercent: number
  affixes: ChosenAffix[]
}

export type PieceResult = {
  state: PieceState
  item: EquipItem | null
  brand: Brand | null
  /** The item's own 装备基础, 0 for an empty slot. */
  baseScore: number
  /** The complete stages' mark plus the refined share of the current one. Proven against the game at "+3 37%" = 240. */
  enhanceScore: number
  /** Per-stat totals the enhancement grants, the current stage counted by its refinement. */
  enhanceStats: [string, number][]
  /**
   * The item's base stats with the enhancement added on, in the item's order —
   * what the card's stat block reads before reforge and brand. Empty for an
   * empty slot, even when the enhancement sliders are up.
   */
  stats: [string, number][]
  /** The chosen affixes, each with the tier and Mark its value works out to. */
  affixes: ScoredAffix[]
  /** Sum of every affix's Mark, contaminated ones subtracting. */
  affixMark: number
  extraordinaryCount: number
  /** See `extraordinaryBonus`. */
  extraordinaryBonus: number
  /** The 重塑 tab's figure: affixMark + extraordinaryBonus. */
  reforgeScore: number
  /** The grace the extraordinary affixes trigger — shown for its effect; it adds nothing of its own. */
  grace: Grace | null
  /** baseScore + enhanceScore + reforgeScore. */
  total: number
  /** Overall enhancement progress, the figure the game shows under the badge. */
  progressPercent: number
}

/**
 * The item's base stats with the enhancement's gains folded in, in the item's
 * order, then any stat the enhancement grants that the item lacks.
 */
export function statsWithEnhancement(item: EquipItem | null, enhanceStats: [string, number][]): [string, number][] {
  if (!item) return []
  const totals = new Map<string, number>(item.baseStats)
  for (const [key, amount] of enhanceStats) totals.set(key, (totals.get(key) ?? 0) + amount)
  return [...totals]
}

/**
 * Stat keys that are two halves of one displayed stat. A weapon's 攻击 is a
 * `min~max` range carried as two keys, and both take the affix family's label.
 */
const STAT_KEY_ALIAS: Record<string, string> = { AtkMin_N: 'Atk_N', AtkMax_N: 'Atk_N' }

/**
 * The display label for a stat key, from the affix table's family → key map
 * read backwards — the only place the dataset pairs a key with its name. A key
 * it does not know shows as itself rather than not at all.
 */
export function statLabel(equipment: Equipment, key: string): string {
  const wanted = STAT_KEY_ALIAS[key] ?? key
  for (const [family, statKey] of Object.entries(equipment.affixes.statKeyByFamily)) {
    if (statKey === wanted) return family
  }
  return key
}

/** One line of a stat block: a label and either a single value or a `min~max` pair. */
export type StatLine = { key: string; label: string; min: number; max: number }

/**
 * Stats folded into display lines, `AtkMin_N`/`AtkMax_N` becoming one 攻击 range.
 * Order follows the first appearance of each line's key.
 */
export function statLines(equipment: Equipment, stats: [string, number][]): StatLine[] {
  const lines: StatLine[] = []
  for (const [key, value] of stats) {
    const lineKey = STAT_KEY_ALIAS[key] ?? key
    const existing = lines.find((line) => line.key === lineKey)
    if (!existing) {
      lines.push({ key: lineKey, label: statLabel(equipment, key), min: value, max: value })
    } else {
      existing.min = Math.min(existing.min, value)
      existing.max = Math.max(existing.max, value)
    }
  }
  return lines
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

/** How far along the ladder a piece is, in stages: the complete ones plus the refined share of the current one. */
function stagesDone(totalStages: number, stage: number, refinePercent: number): number {
  const current = Math.min(stage, totalStages)
  if (current <= 0) return 0
  return current - 1 + Math.min(100, Math.max(0, refinePercent)) / 100
}

/**
 * Enhancement score and stats at a stage with its refinement.
 *
 * "+3" is a piece whose stages 1 and 2 are complete and whose stage 3 is the one
 * being refined, so stage 3's mark accrues with the refinement: fully refined it
 * is worth exactly three stages (240, verified in game), freshly reached it is
 * worth little more than "+2". At +0 nothing is being refined and nothing scores.
 */
export function enhanceOf(
  body: EnhanceBody | null,
  stage: number,
  refinePercent = 100,
): { score: number; stats: [string, number][] } {
  if (!body) return { score: 0, stats: [] }
  const done = stagesDone(body.stages.length, stage, refinePercent)
  let score = 0
  const totals = new Map<string, number>()
  for (const rung of body.stages) {
    // A complete stage counts whole, the current one by its refinement, the rest not at all.
    const share = Math.min(1, Math.max(0, done - (rung.stage - 1)))
    if (share <= 0) continue
    score += rung.mark * share
    for (const [key, amount] of rung.stats) totals.set(key, (totals.get(key) ?? 0) + amount * share)
  }
  return { score: Math.round(score), stats: [...totals] }
}

/**
 * Overall enhancement progress, the percentage the game prints under the badge.
 *
 * It is progress across the whole ladder: the stages complete plus the current
 * stage's own refinement, over the ladder's length. So "+3" of 8 runs from 25%
 * (stage 3 just reached) up to 37.5% (stage 3 fully refined), which the game
 * floors to the "37%" it shows beside a fully refined +3.
 */
export function progressOf(body: EnhanceBody | null, stage: number, refinePercent: number): number {
  const total = body?.stages.length ?? 0
  if (total === 0) return 0
  return (stagesDone(total, stage, refinePercent) / total) * 100
}

/**
 * The badge percentages a stage can show, as the game prints them (floored).
 *
 * Each stage owns a window of the whole-ladder percentage: +3 of 8 runs
 * 25%..37%, and 37% is the most a +3 can read — one more point of refinement
 * and the badge says +4. So a slider for the refinement is bounded by the stage
 * rather than running 0..100 on its own. At +0 there is no refinement to show.
 */
export function progressBounds(totalStages: number, stage: number): { min: number; max: number } {
  const current = Math.min(stage, totalStages)
  if (totalStages <= 0 || current <= 0) return { min: 0, max: 0 }
  return {
    min: Math.floor(((current - 1) / totalStages) * 100),
    max: Math.floor((current / totalStages) * 100),
  }
}

/**
 * The in-stage refinement that puts the badge at `progress`% — the inverse of
 * `progressOf` after the game's flooring.
 *
 * A floored badge covers a range of refinements, and the highest one is taken:
 * the window's top value is what a fully refined stage reads, so it has to map
 * back to 100 for "+3 37%" to score its three whole stages. The result is
 * clamped into 1..100, so a badge outside the stage's window lands on the
 * nearest end rather than moving the stage; +0 has no refinement and gives 0.
 */
export function refineFromProgress(totalStages: number, stage: number, progress: number): number {
  const current = Math.min(stage, totalStages)
  if (totalStages <= 0 || current <= 0) return 0
  const span = 100 / totalStages
  // The smallest refinement that would already floor to the next badge, less one.
  const next = Math.ceil(((progress + 1) / span - (current - 1)) * 100 - 1e-9)
  return Math.min(100, Math.max(1, next - 1))
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
  const { score: enhanceScore, stats: enhanceStats } = enhanceOf(
    body,
    state.enhanceStage,
    state.refinePercent,
  )

  const affixes = state.affixes.map((affix) => classifyAffix(equipment, state.slot, affix))
  const affixMark = affixes.reduce((sum, affix) => sum + affix.mark, 0)
  const extraordinaryCount = affixes.filter((affix) => affix.tier === 'extraordinary').length
  const bonus = extraordinaryBonus(extraordinaryCount)
  const reforgeScore = affixMark + bonus
  const baseScore = item?.baseScore ?? 0

  return {
    state,
    item,
    brand,
    baseScore,
    enhanceScore,
    enhanceStats,
    stats: statsWithEnhancement(item, enhanceStats),
    affixes,
    affixMark,
    extraordinaryCount,
    extraordinaryBonus: bonus,
    reforgeScore,
    grace: graceFor(graces, state.slot, affixes),
    total: baseScore + enhanceScore + reforgeScore,
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
