import { dataUrl } from './urls'
import type { EquipmentRecord } from '../wikiData'

export interface BuildJob {
  id: number
  name: string
  rank: number
  parentId: number
  branchIds: number[]
  subtypes: number[]
  weaponForms: number[]
}
export interface BuildBranch { id: number; name: string; professionId: number; suggestedSkills: number[] }
export interface BuildTalentEffect { id: number; group: number; level: number; jobIds: number[]; professionIds: number[] }
export interface BuildRuleSet {
  talentEffects?: BuildTalentEffect[]
  markStages?: Array<{ markId: number; threshold: number; stage: number; effects: number[]; multiverses: number[]; icon?: string }>
  jobs: BuildJob[]
  branches: BuildBranch[]
  recommendations: Array<{ branchId: number; talentLevelIds: number[] }>
}
export interface BuildRulesDocument { schemaVersion: 1; shared: BuildRuleSet; variants: Record<string, BuildRuleSet> }

export const BUILD_SLOTS = [
  { key: 'main', grid: 1, positions: [1, 2], cardPart: 1, label: 'main' },
  { key: 'off', grid: 2, positions: [3], cardPart: 2, label: 'off' },
  { key: 'armor', grid: 3, positions: [4], cardPart: 3, label: 'armor' },
  { key: 'cloak', grid: 4, positions: [5], cardPart: 4, label: 'cloak' },
  { key: 'shoes', grid: 5, positions: [6], cardPart: 5, label: 'shoes' },
  { key: 'accessory-1', grid: 6, positions: [7], cardPart: 6, label: 'accessory1' },
  { key: 'accessory-2', grid: 7, positions: [7], cardPart: 6, label: 'accessory2' },
] as const
export type BuildSlotKey = typeof BUILD_SLOTS[number]['key']

export function equipmentAllowed(record: EquipmentRecord, job: BuildJob): boolean {
  const item = record.item
  return Boolean(item && item.iSubType !== undefined && job.subtypes.includes(item.iSubType)
    && (!item.kJobNeed?.length || item.kJobNeed.includes(0) || item.kJobNeed.includes(job.id)))
}

export function slotAllows(record: EquipmentRecord, slot: BuildSlotKey, job?: BuildJob): boolean {
  const part = record.item?.iEquipPart
  if (part === undefined) return false
  if (slot === 'off' && part === 2 && job?.weaponForms.includes(3)) return true
  return BUILD_SLOTS.find((s) => s.key === slot)?.positions.some((p) => p === part) ?? false
}

export function professionTalentEffects(rules: BuildRuleSet | undefined, jobId: number): BuildTalentEffect[] {
  return rules?.talentEffects?.filter(effect => effect.jobIds.includes(jobId)) ?? []
}

export const CAREER_ROOTS = [1100, 2100, 3100, 4100, 5100, 6100] as const

export function careerRoot(jobId: number): number {
  const root = Math.trunc(jobId / 1000) * 1000 + 100
  return CAREER_ROOTS.some(id => id === root) ? root : 0
}

/** Follow authored parent links; only the swordman line has a selectable route. */
export function careerJobs(rules: BuildRuleSet | undefined, jobId: number): BuildJob[] {
  if (!rules) return []
  const root = careerRoot(jobId)
  if (!root) return []
  const crusader = [1210, 1310, 1410].includes(jobId)
  const anchor = root === 1100 ? crusader ? 1210 : 1200 : root
  const descendsFrom = (job: BuildJob): boolean => {
    const seen = new Set<number>()
    let current: BuildJob | undefined = job
    while (current && !seen.has(current.id)) {
      if (current.id === anchor) return true
      seen.add(current.id)
      current = rules.jobs.find(j => j.id === current?.parentId)
    }
    return false
  }
  return rules.jobs.filter(j => j.id === root || descendsFrom(j))
}

export function careerTalentEffects(rules: BuildRuleSet | undefined, jobId: number): BuildTalentEffect[] {
  const jobs = new Set(careerJobs(rules, jobId).map(j => j.id))
  return rules?.talentEffects?.filter(e => e.jobIds.some(id => jobs.has(id))) ?? []
}

export async function loadBuildRules(): Promise<BuildRulesDocument> {
  const response = await fetch(dataUrl('build-rules-v2.json'))
  if (!response.ok) throw new Error(`Build rules request failed (${response.status})`)
  const result = await response.json() as BuildRulesDocument
  if (result.schemaVersion !== 1 || !Array.isArray(result.shared?.jobs) || !Array.isArray(result.shared?.branches)) {
    throw new Error('Unsupported build rules document')
  }
  return result
}
