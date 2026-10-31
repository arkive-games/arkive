import { localizedText, stripGameMarkup, type WikiCard } from '../cardCatalog'
import type { loadPetWikiData } from '../creatureData'
import { stageEmblem } from '../professionCatalog'
import type { loadCardCatalogData, loadEquipmentWikiData, loadProfessionWikiData, loadSoulWikiData, loadTalentWikiData, EquipmentRecord, SoulRecord } from '../wikiData'
import { BUILD_SLOTS, careerJobs, careerRoot, careerTalentEffects, equipmentAllowed, slotAllows, type BuildBranch, type BuildJob, type BuildRuleSet, type BuildRulesDocument, type BuildSlotKey } from './buildRules'
import type { PlannerBuild } from './plannerModel'
import content from '../locales/zh-CN.json'

/** Everything the build manual reads; any part may be missing when its file failed to load. */
export interface ManualData {
  rules?: BuildRulesDocument
  profession?: Awaited<ReturnType<typeof loadProfessionWikiData>>
  equipment?: Awaited<ReturnType<typeof loadEquipmentWikiData>>
  cards?: Awaited<ReturnType<typeof loadCardCatalogData>>
  pets?: Awaited<ReturnType<typeof loadPetWikiData>>
  talents?: Awaited<ReturnType<typeof loadTalentWikiData>>
  souls?: Awaited<ReturnType<typeof loadSoulWikiData>>
}

/** One entry per career root: its tint, its own emblem, and the emblems of its final jobs. */
export const ROOTS: ReadonlyArray<{ id: number; tint: string; stage: string }> = [
  { id: 1100, tint: '#b4532a', stage: 'swordman' },
  { id: 2100, tint: '#6a4fc4', stage: 'magician' },
  { id: 3100, tint: '#2f8a57', stage: 'archer' },
  { id: 4100, tint: '#c08a1e', stage: 'acolyte' },
  { id: 5100, tint: '#8d3a6b', stage: 'thief' },
  { id: 6100, tint: '#2d7fb0', stage: 'merchant' },
]
const FINAL_STAGES: Record<number, string> = {
  1400: 'runeKnight', 1410: 'royalGuard', 2400: 'warlock', 3400: 'ranger',
  4400: 'archBishop', 5400: 'guillotineCross', 6400: 'mechanic',
}
const NEUTRAL_TINT = '#7a8796'

export function rootTint(jobId: number): string {
  return ROOTS.find(r => r.id === careerRoot(jobId))?.tint ?? NEUTRAL_TINT
}
export function rootEmblem(rootId: number): string {
  return stageEmblem(ROOTS.find(r => r.id === rootId)?.stage ?? 'novice')
}
/** The final job's emblem when there is one, else the root's. */
export function jobEmblem(jobId: number): string {
  const stage = FINAL_STAGES[jobId]
  return stage ? stageEmblem(stage) : rootEmblem(careerRoot(jobId))
}

export function ruleSet(data: ManualData | null, variant: string): BuildRuleSet | undefined {
  return variant === 'shared' ? data?.rules?.shared : data?.rules?.variants[variant]
}

/** The branches a build can pick under one root: every branch of the root's final jobs. */
export function rootBranches(rules: BuildRuleSet | undefined, rootId: number): Array<{ job: BuildJob; branch: BuildBranch }> {
  if (!rules) return []
  return rules.jobs
    .filter(j => j.rank === 5 && careerRoot(j.id) === rootId)
    .flatMap(job => job.branchIds.flatMap(id => {
      const branch = rules.branches.find(b => b.id === id)
      return branch ? [{ job, branch }] : []
    }))
}

export function skillPool(data: ManualData | null, rules: BuildRuleSet | undefined, jobId: number): Set<number> {
  const ids = new Set<number>()
  if (!rules) return ids
  const pairs = careerJobs(rules, jobId).flatMap(j => rules.branches.filter(b => j.branchIds.includes(b.id)).map(b => ({ rank: j.rank, branch: b })))
  for (const row of data?.profession?.jobSkills.jobSkills ?? []) {
    if (pairs.some(p => p.branch.professionId === row.iProfessionID && p.rank === row.iJobRank)) {
      row.kDescData?.forEach(id => ids.add(Math.trunc(id / 100)))
    }
  }
  pairs.forEach(p => p.branch.suggestedSkills.forEach(id => ids.add(Math.trunc(id / 100))))
  return ids
}

export function isPlaceholderEquipment(record: EquipmentRecord): boolean {
  return record.icon === 'icons/equipment/item_null.webp' || record.item?.kIcon === 'item_null.png' || record.name?.['zh-CN'] === '待定'
}

export function allowedEquipment(equipment: EquipmentRecord[], lineage: BuildJob[], key: BuildSlotKey): EquipmentRecord[] {
  if (!lineage.length) return []
  return equipment.filter(e => e.name?.['zh-CN'] && !isPlaceholderEquipment(e) && lineage.some(j => equipmentAllowed(e, j) && slotAllows(e, key, j)))
}

export function socketCount(data: ManualData | null, key: BuildSlotKey): number {
  const grid = BUILD_SLOTS.find(s => s.key === key)!.grid
  const slot = data?.equipment?.attrs.slots?.find(s => s.iID === grid)
  return [1, 2, 3, 4].filter(i => slot?.[`kSocketOpen${i}`]).length
}

export function rangeValue(row: number[]): string {
  return row.length > 2 && row[1] !== row[2] ? `${row[1]}–${row[2]}` : String(row[1] ?? '-')
}

/** The equipment's base attributes, followed by the affixes the build chose. */
export function equipmentLines(data: ManualData | null, record: EquipmentRecord, normal: number[], special: number[]): Array<{ text: string; special?: boolean }> {
  const attrs = data?.equipment?.attrs
  const attributeName = (id?: number) => attrs?.attributes.find(a => a.iID === id)?.name?.['zh-CN'] ?? `#${id ?? '-'}`
  const lines: Array<{ text: string; special?: boolean }> = (record.kBasicAttribute ?? []).map(row => ({ text: `${attributeName(row[0])} ${rangeValue(row)}` }))
  for (const id of normal) {
    const entry = attrs?.entryGroups.find(e => e.iID === id)
    if (entry) lines.push({ text: `${attributeName(entry.iAttriID)} ${entry.iMin === entry.iMax ? entry.iMin ?? '' : `${entry.iMin}–${entry.iMax}`}`.trim() })
  }
  for (const id of special) {
    const effect = attrs?.specialEffects.find(e => e.iID === id)
    const label = effect?.name?.['zh-CN'] || effect?.desc?.['zh-CN']
    if (label) lines.push({ text: stripGameMarkup(label), special: true })
  }
  return lines
}

export function affixOptions(data: ManualData | null, record: EquipmentRecord): { normal: Array<{ id: number; label: string }>; special: Array<{ id: number; label: string }> } {
  const attrs = data?.equipment?.attrs
  if (!attrs) return { normal: [], special: [] }
  const normal = attrs.entryGroups.filter(e => e.iGroup === record.iEntries).map(e => ({
    id: e.iID,
    label: attrs.attributes.find(a => a.iID === e.iAttriID)?.name?.['zh-CN'] ?? `#${e.iAttriID ?? '-'}`,
  }))
  const groups = record.kSpecial?.map(v => v[0]) ?? []
  const special = attrs.specialEffects
    .filter(e => attrs.specialGroups.some(g => groups.includes(g.iGroup ?? -1) && g.iSpecialID === e.iID))
    .map(e => ({ id: e.iID, label: stripGameMarkup(e.name?.['zh-CN'] || e.desc?.['zh-CN'] || '') }))
    .filter(e => e.label)
  return { normal, special }
}

/** What a card does at its highest tier, in one line. */
export function cardEffect(data: ManualData | null, card: WikiCard): string {
  const doc = data?.cards
  const tier = card.tiers.at(-1)
  if (!doc || !tier) return stripGameMarkup(localizedText(card.description))
  const attributeName = (id: number) => localizedText(doc.attributes.find(a => a.id === id)?.name) || `#${id}`
  const parts = tier.attributes.map(([id, value]) => `${attributeName(id)} +${(value ?? 0).toLocaleString('zh-CN')}`)
  for (const id of tier.specialEffects) {
    const effect = doc.specialEffects.find(e => e.id === id)
    const text = stripGameMarkup(localizedText(effect?.description))
    if (text) parts.push(text)
    else effect?.effects?.filter(e => e[0] === 1).forEach(e => parts.push(`${attributeName(e[1])} +${(e[2] ?? 0).toLocaleString('zh-CN')}`))
  }
  return parts.join(content.builds.manual.separator) || stripGameMarkup(localizedText(card.description))
}

export function soulSubOptions(data: ManualData | null, soul: SoulRecord): Array<{ id: number; label: string }> {
  return (soul.subAttributes ?? []).map(a => ({
    id: a.iID ?? a.attributeId ?? 0,
    label: data?.souls?.souls.attributes.find(v => v.iID === (a.attributeId ?? a.iSubAttriID))?.name?.['zh-CN'] ?? `#${a.attributeId ?? a.iSubAttriID ?? '-'}`,
  })).filter(o => o.id)
}

export function talentChoices(data: ManualData | null, rules: BuildRuleSet | undefined, jobId: number): Array<{ id: number; label: string; icon?: string }> {
  const nodes = data?.talents?.talents.seasonTalents.nodes ?? []
  const effects = careerTalentEffects(rules, jobId)
  return nodes.filter(n => effects.some(e => e.group === n.iLevelGroupId)).map(n => ({ id: n.iId, ...talentInfo(data, rules, jobId, n.iId) }))
}

export function talentInfo(data: ManualData | null, rules: BuildRuleSet | undefined, jobId: number, id: number): { label: string; icon?: string } {
  const node = data?.talents?.talents.seasonTalents.nodes.find(n => n.iId === id)
  const effect = careerTalentEffects(rules, jobId).filter(e => e.group === node?.iLevelGroupId).sort((a, b) => a.level - b.level)[0]
  const level = data?.talents?.talents.seasonTalents.levels.find(l => l.iId === effect?.id)
  return { label: level?.name?.['zh-CN'] || node?.name?.['zh-CN'] || '', icon: level?.icon }
}

/** The text a list search matches: title, intro, job and branch names. */
export function buildSearchText(build: PlannerBuild, rules: BuildRuleSet | undefined): string {
  const job = rules?.jobs.find(j => j.id === build.jobId)
  const branch = rules?.branches.find(b => b.id === build.branchId)
  return [build.title, build.summary, job?.name, branch?.name].join(' ').toLocaleLowerCase('zh-CN')
}
