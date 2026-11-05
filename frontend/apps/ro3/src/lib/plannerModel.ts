import type { EquipmentRecord } from '../wikiData'
import { BUILD_SLOTS, careerRoot, type BuildRuleSet, type BuildRulesDocument, type BuildSlotKey } from './buildRules'
import { PROFESSION_LINES } from '../professionCatalog'
import { BUILD_STORAGE_KEY, clampStat } from './buildState'

export interface PlannerEquipment {
  slot: BuildSlotKey
  id: number
  normal: number[]
  special: number[]
  cards: number[]
}
export interface PlannerSoul { id: number; sub: number[]; marks: number[]; markCounts?: Array<{ markId: number; count: number }>; resonance?: number }
export interface PlannerBuild {
  schemaVersion: 2
  id: string
  title: string
  summary: string
  jobId: number
  branchId: number
  rulesVariant: string
  attributes: number[]
  skills: number[]
  equipment: PlannerEquipment[]
  cardSlots: Record<BuildSlotKey, number[]>
  combat: number[]
  assist: number[]
  talents: number[]
  souls: PlannerSoul[]
  recovery: unknown[]
  original?: unknown
}
export interface StoredPlanner { records: unknown[]; raw: string | null; malformed: boolean }
const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {}
const ids = (v: unknown): number[] => Array.isArray(v) ? v.map((x) => Number.isSafeInteger(x) && Number(x) > 0 ? Number(x) : 0) : []

export function emptyPlanner(id = `local-${crypto.randomUUID()}`): PlannerBuild {
  return { schemaVersion: 2, id, title: '', summary: '', jobId: 0, branchId: 0, rulesVariant: 'shared', attributes: [1, 1, 1, 1, 1, 1], skills: [], cardSlots: { main: [], off: [], armor: [], cloak: [], shoes: [], 'accessory-1': [], 'accessory-2': [] }, equipment: BUILD_SLOTS.map(s => ({ slot: s.key, id: 0, normal: [], special: [], cards: [] })), combat: [], assist: [], talents: [], souls: [], recovery: [] }
}

export function readPlannerStorage(storage: Pick<Storage, 'getItem'>): StoredPlanner {
  let raw: string | null = null
  try {
    raw = storage.getItem(BUILD_STORAGE_KEY)
    if (!raw) return { records: [], raw, malformed: false }
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? { records: parsed, raw, malformed: false } : { records: [], raw, malformed: true }
  } catch { return { records: [], raw, malformed: true } }
}

const LEGACY_ROOTS: Record<string, number> = { swordman: 1100, magician: 2100, archer: 3100, acolyte: 4100, thief: 5100, merchant: 6100 }

/** Resolve authored legacy routes, never infer a career from a title or equipped items. */
function legacyCareer(source: Record<string, unknown>, rules: BuildRuleSet | undefined): { jobId: number; branchId: number } | undefined {
  if (!rules || typeof source.professionLineId !== 'string' || typeof source.professionRouteId !== 'string') return
  const line = PROFESSION_LINES.find(line => line.id === source.professionLineId)
  const route = line?.routes.find(route => route.id === source.professionRouteId)
  if (!route) return
  for (const stage of [...route.stages].reverse()) {
    const matches = rules.jobs.filter(job => careerRoot(job.id) === LEGACY_ROOTS[line!.id] && job.rank === stage.rank)
      .flatMap(job => rules.branches.filter(branch => job.branchIds.includes(branch.id) && branch.professionId === stage.professionId)
        .map(branch => ({ jobId: job.id, branchId: branch.id })))
    if (matches.length === 1) return matches[0]
    if (matches.length > 1) return
  }
}

/** Loading never writes. Every ambiguous legacy record remains in recovery/original. */
export function migratePlanner(value: unknown, equipment: EquipmentRecord[], attributeKeys: string[], rulesDocument?: BuildRulesDocument): PlannerBuild {
  const source = record(value)
  const build = emptyPlanner(typeof source.id === 'string' ? source.id : 'recovered')
  build.title = typeof source.title === 'string' ? source.title : ''
  build.summary = typeof source.summary === 'string' ? source.summary : ''
  if (!Object.keys(source).length) { build.recovery = [value]; build.original = value; return build }
  const modern = source.schemaVersion === 2
  build.jobId = typeof source.jobId === 'number' ? source.jobId : 0
  build.branchId = typeof source.branchId === 'number' ? source.branchId : 0
  build.rulesVariant = typeof source.rulesVariant === 'string' ? source.rulesVariant : 'shared'
  const rules = build.rulesVariant === 'shared' ? rulesDocument?.shared : rulesDocument?.variants[build.rulesVariant]
  if (!build.jobId && !build.branchId) {
    const career = legacyCareer(modern ? record(source.original) : source, rules)
    if (career) Object.assign(build, career)
  }
  build.original = modern ? source.original : value
  build.recovery = Array.isArray(source.recovery) ? [...source.recovery] : []
  const sourceAttributes = modern && Array.isArray(source.attributes) ? source.attributes : attributeKeys.map(k => record(source.attributes)[k])
  build.attributes = Array.from({ length: 6 }, (_, i) => clampStat(Number(sourceAttributes[i]) || 1))
  // Stats above the editor's cap were valid in the old planner; keep the originals.
  if (build.attributes.some((v, i) => v !== (Number(sourceAttributes[i]) || 1))) build.recovery.push({ attributes: sourceAttributes })
  const originalSkills = ids(modern ? source.skills : source.skillIds).filter(Boolean)
  build.skills = modern ? ids(source.skills).slice(0, 6) : [...new Set(originalSkills)].slice(0, 6)
  if (!modern && (originalSkills.length > 6 || originalSkills.length !== new Set(originalSkills).size)) build.recovery.push({ skills: originalSkills })
  build.combat = ids(modern ? source.combat : source.petCombatIds ?? source.petIds)
  build.assist = ids(modern ? source.assist : source.petAssistIds)
  build.talents = ids(modern ? source.talents : source.talentIds).filter(Boolean)
  const oldSouls = Array.isArray(source.souls) ? source.souls : ids(source.soulIds).map(id => ({ soulId: id }))
  build.souls = oldSouls.map(v => { const s = record(v); return { id: Number(modern ? s.id : s.soulId) || 0, sub: ids(modern ? s.sub : s.subAttributeIds), marks: ids(modern ? s.marks : s.markEffectIds), ...(Array.isArray(s.markCounts) ? { markCounts: s.markCounts.map(v => { const m = record(v); return { markId: Number(m.markId) || 0, count: Number.isSafeInteger(m.count) && Number(m.count) >= 0 ? Number(m.count) : 0 } }) } : {}), resonance: Number(modern ? s.resonance : s.resonanceId) || undefined } })
  const oldEquipment = Array.isArray(source.equipment) ? source.equipment : ids(source.equipmentIds).map(equipmentId => ({ equipmentId }))
  const occupied = new Set<string>()
  for (const raw of oldEquipment) {
    const e = record(raw)
    const id = Number(modern ? e.id : e.equipmentId) || 0
    if (!id && !modern) continue
    const item = equipment.find(r => r.iID === id)
    let slot: BuildSlotKey | undefined
    if (modern) slot = BUILD_SLOTS.find(s => s.key === e.slot)?.key
    else if (item) {
      const part = item.item?.iEquipPart
      slot = BUILD_SLOTS.find(s => s.positions.some(p => p === part) && !occupied.has(s.key))?.key
    }
    if (!slot || occupied.has(slot)) { build.recovery.push(raw); continue }
    occupied.add(slot)
    build.equipment[BUILD_SLOTS.findIndex(s => s.key === slot)] = { slot, id, normal: ids(modern ? e.normal : e.normalEntryIds), special: ids(modern ? e.special : e.specialEffectIds), cards: ids(modern ? e.cards : e.cardIds) }
    if (!modern && ids(e.cardIds).some(Boolean)) build.recovery.push({ reviewCardsFor: slot, original: raw })
  }
  for (const slot of BUILD_SLOTS) {
    const saved = record(source.cardSlots)[slot.key]
    build.cardSlots[slot.key] = Array.isArray(saved) ? ids(saved) : [...build.equipment.find(e => e.slot === slot.key)!.cards]
  }
  return build
}

/** The exact old bytes are backed up before any explicit first write. */
export function savePlannerBuilds(builds: PlannerBuild[], storage: Pick<Storage, 'getItem' | 'setItem'>): boolean {
  try {
    const old = storage.getItem(BUILD_STORAGE_KEY)
    const backup = `${BUILD_STORAGE_KEY}:before-v2`
    if (old && storage.getItem(backup) === null) storage.setItem(backup, old)
    storage.setItem(BUILD_STORAGE_KEY, JSON.stringify(builds))
    return true
  } catch { return false }
}
