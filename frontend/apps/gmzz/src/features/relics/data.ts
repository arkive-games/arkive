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
  /** Of the item the client displays the artifact through — picks the rarity plate. */
  quality: number | null
  icon: string | null
  description: string
  seasons: number[]
}

/**
 * Grade ladder. **Lower grade is better** — 3 is the starting grade, 0 the best.
 *
 * `resonanceTier` is the digit the 非凡共鸣 ladder is keyed by for this grade
 * (`SealedPromoteData.AttributeImproveType % 100`): grade 3 reads tier 1, grade 2
 * tier 2, grades 1 and 0 tier 3. It runs the other way from the grade, which is
 * why it is data rather than arithmetic. Optional because a dataset published
 * before it was emitted has none; `resonanceKey` then falls back to the old
 * guess, which is right for grades 2 and 3 only.
 */
export type GradeRung = { grade: number; mark: number; note: string; resonanceTier?: number }

export type Risk = {
  id: number | null
  level: string | null
  name: string | null
  description: string | null
  levelTextId?: string
  descriptionTextId?: string
}

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
  /** The table value. The game displays `floor(value * k2)` unless `scaled` is false. */
  value: number
  groupId: number
  saturation: number | null
  /**
   * Whether the value takes k2. The 愚者 words read a flat `0.05` with no
   * coefficient. Absent in datasets published before it was emitted: scaled.
   */
  scaled?: boolean
  /** Rarity tag: 1 and 2 are ordinary words, 3 and 4 rare ones. Also the pool's own key. */
  tag?: number
  /** A rare word's own name (愚者, 战争主教…); absent on an ordinary word. */
  name?: string
  /** A rare word's effect line; `%s` stands for the displayed value. */
  effect?: string
  /** All-skill level bonus a rare word grants. */
  skillLevelPlus?: number
  rarest?: boolean
}

/** One `XtraMatNameRuleData` row: `HasWordType(4, 1)=true` names a type-1 material 异变物质. */
export type MaterialNameRule = { id: number; type: number; name: string; rule: string; args: number[]; expect: boolean }

/** A stat key's Chinese display name, and whether it reads as a percentage. */
export type StatName = { name: string; format: 'percent' | 'number' }

export type Relics = {
  artifacts: Artifact[]
  promotion: { ladder: GradeRung[]; bestGrade: number; worstGrade: number }
  risks: Risk[]
  /** season -> group tier (e.g. "103") -> ladder by affix count. */
  resonance: Record<string, Record<string, ResonanceRung[]>>
  knowledge: Record<string, KnowledgeRung[]>
  /** season -> stat key -> Mark per point. */
  worths: Record<string, Record<string, number>>
  materials: {
    items: Material[]
    groups: Record<string, unknown>
    affixPool: Record<string, Record<string, PoolAffix[]>>
    /** Ordered naming rules; absent in datasets published before they were emitted. */
    nameRules?: MaterialNameRule[]
  }
  constants: Record<string, unknown>
  groupNames: Record<string, string>
  /** Stat key -> display name. Absent in datasets published before it was emitted. */
  statNames?: Record<string, StatName>
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

/**
 * `k1` at a knowledge level — the coefficient 非凡共鸣 scales by.
 *
 * The table carries k1 and k2 as separate columns and every resonance row names
 * `k1` (`SealedInfoAttrData.KnowledgeCoef`) while every affix group names `k2`.
 * They happen to be equal in the shipped ladder; reading the right one keeps the
 * page correct the day they are not.
 */
export function k1For(relics: Relics, level: number, season?: number): number {
  const ladder = knowledgeLadder(relics, season)
  const exact = ladder.find((rung) => rung.level === level)
  return exact?.k1 ?? ladder[0]?.k1 ?? 0
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

/**
 * The rarity plate behind a relic's icon at a grade: 3级 purple (quality 4),
 * 2级 gold (5), 1级 orange (6) — the game's own plates, one step per grade.
 */
export function gradeQuality(grade: number): number {
  return 7 - Math.min(3, Math.max(1, grade))
}

/**
 * Grades a player can hold, worst (3) first — the order the slider runs.
 *
 * The promote table has rows down to grade 0, but `SealBestGrade` is 1 and no
 * relic can be promoted past it, so grade 0 is not offered.
 */
export function gradeOptions(relics: Relics): number[] {
  const best = relics.constants['SealBestGrade']
  return relics.promotion.ladder
    .map((rung) => rung.grade)
    .filter((grade) => typeof best !== 'number' || grade >= best)
    .sort((a, b) => b - a)
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

/** A stat key's display name, falling back to the key for a dataset that lacks it. */
export function statName(relics: Relics, stat: string): string {
  return relics.statNames?.[stat]?.name ?? stat
}

/** A stat amount as the game prints it: `5%` for a percentage stat, the number otherwise. */
export function formatStat(relics: Relics, stat: string, value: number): string {
  if (relics.statNames?.[stat]?.format === 'percent') return `${Number((value * 100).toFixed(2))}%`
  return String(value)
}

/**
 * One chosen affix on a material: the pool row it came from.
 *
 * `affixId` is carried so a picker can key options by identity — two rungs of
 * one stat can share a `value`, so `{stat, value}` is not a unique handle.
 */
export type ChosenRelicAffix = { stat: string; value: number; mark: number; affixId?: number; scaled?: boolean }

/**
 * The displayed value of a relic affix.
 *
 * The table value is a base; the game shows `floor(value * k2)`. A 攻击 word
 * whose table value is 490 reads +156 at k2 = 0.32.
 */
export function displayedValue(value: number, k2: number): number {
  return Math.floor(value * k2)
}

/** What an affix reads in game: scaled by k2 and floored, or as written when it takes no coefficient. */
export function affixValue(affix: { value: number; scaled?: boolean }, k2: number): number {
  return affix.scaled === false ? affix.value : displayedValue(affix.value, k2)
}

/** A rare word's effect line with its value filled in, as the tooltip in game reads. */
export function rareEffect(relics: Relics, affix: PoolAffix, k2: number): string {
  return (affix.effect ?? '').replace('%s', formatStat(relics, affix.stat, affixValue(affix, k2)))
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
  /** The selected artifact's grade. */
  grade: number
  /** Every artifact's own grade, by artifact id, so switching artifacts keeps each one's. */
  grades?: Record<string, number>
  /** 特化 only: which of its two materials is equipped, 1 攻击 or 2 防御. */
  materialType?: number
  /**
   * The slot's two materials, each a list of affixes. 攻击 and 防御 hold 填充一
   * and 填充二, and the second takes effect only on the strategic server
   * (`SealedExtraSlotData` gives the extra slot to groups 1 and 2 only). 特化
   * holds an attack material and a defence material; `materialType` picks the
   * one equipped, and both are kept so switching loses nothing.
   *
   * The individual material items do not matter to the score: every item of
   * one type draws the same ordinary rungs and the same rare words.
   */
  materials: ChosenRelicAffix[][]
}

/** Material positions per slot: two everywhere. */
export const MATERIAL_SLOTS = 2

/** The material type a slot's position draws from: the slot's own group, except 特化, whose second position is 防御. */
export function materialTypeAt(groupId: number, index: number): number {
  if (groupId === 1 || groupId === 2) return groupId
  return index === 1 ? 2 : 1
}

/** The position of 特化's equipped material. */
export function specIndex(slot: Pick<RelicSlotState, 'materialType'>): number {
  return slot.materialType === 2 ? 1 : 0
}

/**
 * The material positions that take effect. 特化 has one equipped material;
 * 攻击 and 防御 have 填充一 everywhere and 填充二 on the strategic server only.
 */
export function activeMaterialIndexes(slot: Pick<RelicSlotState, 'groupId' | 'materialType'>, server: RelicServer): number[] {
  if (slot.groupId !== 1 && slot.groupId !== 2) return [specIndex(slot)]
  return server === 'cross' ? [0, 1] : [0]
}

/**
 * Which affixes are switched off when a material carries more than the grade
 * allows, as the game does (it marks them with a prohibition sign): from the
 * last affix backwards, skipping rare words, which are never switched off.
 * A row with no stat picked yet is neither counted nor switched off.
 */
export function inactiveAffixes(
  affixes: ChosenRelicAffix[],
  cap: number,
  isRare: (affix: ChosenRelicAffix) => boolean = () => false,
): boolean[] {
  const off = affixes.map(() => false)
  let over = affixes.filter((affix) => affix.stat !== '').length - Math.max(0, cap)
  for (let index = affixes.length - 1; index >= 0 && over > 0; index--) {
    if (affixes[index].stat === '' || isRare(affixes[index])) continue
    off[index] = true
    over--
  }
  return off
}

export type MaterialResult = {
  index: number
  type: number
  affixes: ChosenRelicAffix[]
  /** Per affix: switched off for being past the cap. */
  inactive: boolean[]
  activeCount: number
  /** Whether this position counts on the chosen server at all. */
  applies: boolean
  /** floor(k2 × Σ mark of the active affixes); 0 when the position does not apply. */
  affixScore: number
  /**
   * What the affixes would score with none switched off, as the game also
   * shows: k2 × Σ mark over every affix the material carries.
   */
  fullAffixScore: number
  /**
   * Whether this material's word count is the one 非凡共鸣 reads. A relic has
   * one resonance: with two materials in effect it follows the one with more
   * active affixes (the earlier on a tie) — an ASSUMPTION, unverified in game.
   */
  resonates: boolean
  /** 非凡共鸣 at the active count: floor(mark × k1). */
  resonanceScore: number
  /** The resonance rung's table stats; the game shows `floor(value × k1)`. */
  resonanceStats: [string, number][]
}

export type RelicSlotResult = {
  state: RelicSlotState
  artifact: Artifact | null
  /** 封印物装配 — the scored grade's mark. */
  assemblyScore: number
  /** 非凡共鸣, summed over the materials that apply. */
  resonanceScore: number
  /** The grade the relic is scored at, after the server cap. */
  resonanceGrade: number
  /** How many affixes take effect per material at that grade. */
  cap: number
  /** 封印物词条, summed over the materials that apply. */
  affixScore: number
  materials: MaterialResult[]
  total: number
}

/**
 * Where a relic is scored: the local server or the strategic server (战略服).
 *
 * The client caps the grade a relic counts as by server: on a local server a
 * grade-1 relic counts as grade 2 (`SealEffectBestGradeAtLocalServer`), on the
 * strategic server as itself (`SealEffectBestGradeAtCrossServer`). The game
 * says so in its own words: "1级" relics only take effect on the strategic
 * server, the local server applies the "2级" effect — assembly, resonance and
 * the affix cap alike. The stored value keeps its old name, `cross`.
 */
export type RelicServer = 'local' | 'cross'

/** The grade whose resonance ladder applies on a server, which is never better than that server's cap. */
export function effectiveGrade(relics: Relics, grade: number, server: RelicServer): number {
  const key = server === 'cross' ? 'SealEffectBestGradeAtCrossServer' : 'SealEffectBestGradeAtLocalServer'
  const cap = relics.constants[key]
  return typeof cap === 'number' ? Math.max(grade, cap) : grade
}

/**
 * The resonance tier key for an artifact at a grade.
 *
 * `Group` in the resonance table is the group id and a tier concatenated:
 * 101/102/103 are attack at tier 1/2/3. The tier comes from the grade's own
 * promote row (`GradeRung.resonanceTier`) and runs the OTHER way from the
 * grade — grade 3 is tier 1, grades 1 and 0 are tier 3 — so a dataset without
 * the field falls back to the clamped grade, which was the earlier reading and
 * is right only for grades 2 and 3.
 */
export function resonanceKey(relics: Relics, groupId: number, grade: number): string {
  // `groupId * 100 + tier`, not string concatenation: the real group ids are
  // 1/2/3, so concatenating gives "13" where the table is keyed "103" and every
  // lookup misses — which reads as 非凡共鸣 being worth zero rather than as an
  // error.
  const tier = gradeRung(relics, grade)?.resonanceTier ?? Math.min(3, Math.max(1, grade))
  return String(groupId * 100 + tier)
}

export function evaluateRelicSlot(
  relics: Relics,
  state: RelicSlotState,
  knowledgeLevel: number,
  season?: number,
  server: RelicServer = 'local',
): RelicSlotResult {
  const artifact = relics.artifacts.find((a) => a.id === state.artifactId) ?? null
  const k2 = k2For(relics, knowledgeLevel, season)
  const k1 = k1For(relics, knowledgeLevel, season)

  // Everything reads the server-capped grade: off the strategic server a
  // grade-1 relic is a grade-2 relic in every respect, its assembly Mark
  // included. Assembly scales by k2 like the affixes — every promote row names
  // `KnowledgeCoef: "k2"`, and at knowledge 39 (k2 0.88) the game shows 440
  // for grade 3's 500 and 2200 for grade 2's 2500.
  const resonanceGrade = effectiveGrade(relics, state.grade, server)
  // Every part is kept unfloored: the game adds the three relics' parts up
  // first and floors each rating item once (see `relicTotals`). Floored per
  // relic, three relics drift a point or two below the panel.
  const assemblyScore = (gradeRung(relics, resonanceGrade)?.mark ?? 0) * k2
  const cap = effectiveAffixCap(relics, resonanceGrade)
  const ladder = resonanceLadder(relics, state.groupId, resonanceGrade, season)
  const active = activeMaterialIndexes(state, server)

  const materials = Array.from({ length: MATERIAL_SLOTS }, (_, index): MaterialResult => {
    const affixes = state.materials[index] ?? []
    const type = materialTypeAt(state.groupId, index)
    const pool = typePool(relics, type)
    const inactive = inactiveAffixes(affixes, cap, (affix) => {
      const source = pool.find((entry) => entry.id === affix.affixId)
      return source !== undefined && isRareAffix(source)
    })
    const effective = affixes.filter((affix, at) => !inactive[at] && affix.stat !== '')
    const applies = active.includes(index)
    const rung = ladder.find((r) => r.affixCount === effective.length)
    return {
      index,
      type,
      affixes,
      inactive,
      activeCount: effective.length,
      applies,
      affixScore: applies ? k2 * effective.reduce((sum, affix) => sum + affix.mark, 0) : 0,
      fullAffixScore: k2 * affixes.reduce((sum, affix) => sum + affix.mark, 0),
      // `calcSealedEnhanceMark`: floor(Mark × professionCoefficient × k1). The
      // profession coefficients are 1 for every row shipped, so they are not
      // modelled; the floor is the client's. Each material is read against
      // its own word count — UNVERIFIED for two materials on the strategic
      // server, where no client code was found that says how they combine.
      resonates: false,
      resonanceScore: applies && rung ? (rung.mark ?? 0) * k1 : 0,
      resonanceStats: rung?.stats ?? [],
    }
  })
  // One resonance per relic, read off the material in effect with the most active affixes.
  const source = materials
    .filter((m) => m.applies)
    .reduce<MaterialResult | null>((best, m) => (best === null || m.activeCount > best.activeCount ? m : best), null)
  for (const m of materials) {
    m.resonates = m === source
    if (!m.resonates) m.resonanceScore = 0
  }
  const affixScore = materials.reduce((sum, m) => sum + m.affixScore, 0)
  const resonanceScore = source?.resonanceScore ?? 0

  return {
    state,
    artifact,
    assemblyScore,
    resonanceScore,
    resonanceGrade,
    cap,
    affixScore,
    materials,
    total: assemblyScore + resonanceScore + affixScore,
  }
}

/**
 * The three 封印物 rating items over all relics. Each is the unfloored sum
 * across the relics, floored once — one relic alone matches the game either
 * way, but three only match when the floor comes last.
 */
export function relicTotals(results: RelicSlotResult[]): { assembly: number; resonance: number; affix: number; total: number } {
  const sum = (pick: (r: RelicSlotResult) => number) => Math.floor(results.reduce((acc, r) => acc + pick(r), 0) + 1e-9)
  const assembly = sum((r) => r.assemblyScore)
  const resonance = sum((r) => r.resonanceScore)
  const affix = sum((r) => r.affixScore)
  return { assembly, resonance, affix, total: assembly + resonance + affix }
}

export function resonanceLadder(relics: Relics, groupId: number, grade: number, season?: number): ResonanceRung[] {
  return forSeason(relics.resonance, season)?.[resonanceKey(relics, groupId, grade)] ?? []
}

export function newRelicSlot(groupId: number, worstGrade: number): RelicSlotState {
  return { groupId, artifactId: null, grade: worstGrade, materials: [[], []] }
}

/**
 * The groups a material's affixes already use. Each ordinary stat is its own
 * group and each rare word too, and a group appears at most once per material
 * (`MaxRepeatTimes` 1); on top of that a material carries at most one rare word.
 */
export function usedGroups(pool: PoolAffix[], affixes: ChosenRelicAffix[]): { groups: Set<number>; rare: boolean } {
  const groups = new Set<number>()
  let rare = false
  for (const affix of affixes) {
    const source = pool.find((entry) => entry.id === affix.affixId)
    if (!source) continue
    groups.add(source.groupId)
    if (isRareAffix(source)) rare = true
  }
  return { groups, rare }
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

/** Rarity tags 3 and 4 are the rare words, which carry a name of their own. */
export function isRareAffix(affix: PoolAffix): boolean {
  return affix.name !== undefined || (affix.tag ?? 0) >= 3
}

/**
 * Every affix a material type can carry: the union of the pools of all its
 * material items, one entry per distinct rung.
 *
 * The items differ in how many words they roll, not in which: every pool of
 * one type offers the same nine rungs per ordinary stat and the same nine rare
 * words, so the page asks for the type alone. A rung repeated across pools
 * collapses to its lowest id, which keeps `affixId` stable between builds.
 */
export function typePool(relics: Relics, type: number): PoolAffix[] {
  const sets = new Set(
    relics.materials.items.filter((m) => m.type === type && m.poolSet != null).map((m) => String(m.poolSet)),
  )
  const seen = new Map<string, PoolAffix>()
  for (const set of sets) {
    for (const [tag, ladder] of Object.entries(relics.materials.affixPool[set] ?? {})) {
      for (const affix of ladder) {
        // The pool's key is the tag; a dataset older than the field has only that.
        const entry: PoolAffix = { ...affix, tag: affix.tag ?? Number(tag) }
        const key = isRareAffix(entry)
          ? `rare|${entry.name ?? entry.groupId}|${entry.stat}`
          : `${entry.tag}|${entry.stat}|${entry.value}|${entry.mark}`
        const prior = seen.get(key)
        if (!prior || entry.id < prior.id) seen.set(key, entry)
      }
    }
  }
  return [...seen.values()].sort((a, b) => a.id - b.id)
}

/** Distinct ordinary stats in a pool: the main stats (tag 2) first, then the secondary ones (tag 1). */
export function poolStats(pool: PoolAffix[]): string[] {
  const ordinary = pool.filter((affix) => !isRareAffix(affix))
  ordinary.sort((a, b) => (b.tag ?? 0) - (a.tag ?? 0) || a.id - b.id)
  return [...new Set(ordinary.map((affix) => affix.stat))]
}

/** An affix's word type, 1 凡 · 2 珍 · 3 稀 · 4 异, read off its pool row. */
export function affixTier(pool: PoolAffix[], affix: ChosenRelicAffix): number {
  return pool.find((entry) => entry.id === affix.affixId)?.tag ?? 0
}

/**
 * A material's name, as the client computes it: the first rule of its type
 * that holds. Word counts run over every affix the material carries, switched
 * off or not — the name belongs to the roll. Every material here is the
 * quality-5 kind the page models, so `Quality(5)` holds and `LowQuality()`
 * (基础物质) does not. Falls back to the slot's own wording when the dataset
 * has no rules.
 */
export function materialName(relics: Relics, type: number, pool: PoolAffix[], affixes: ChosenRelicAffix[]): string | null {
  const count = (tier: number) => affixes.filter((affix) => affixTier(pool, affix) === tier).length
  for (const rule of relics.materials.nameRules ?? []) {
    if (rule.type !== type) continue
    const [a = 0, b = 0] = rule.args
    let holds: boolean | null = null
    if (rule.rule === 'HasWordType' || rule.rule === 'SameWordTypeCount') holds = count(a) >= b
    else if (rule.rule === 'Quality') holds = a === 5
    else if (rule.rule === 'LowQuality') holds = false
    if (holds !== null && holds === rule.expect) return rule.name
  }
  return null
}

export function rareAffixes(pool: PoolAffix[]): PoolAffix[] {
  return pool.filter(isRareAffix).sort((a, b) => Number(b.rarest ?? false) - Number(a.rarest ?? false) || a.id - b.id)
}

/** The ordinary rungs a stat offers in a pool, richest first. */
export function poolRungs(pool: PoolAffix[], stat: string): PoolAffix[] {
  return pool.filter((affix) => affix.stat === stat && !isRareAffix(affix)).sort((a, b) => b.mark - a.mark)
}
