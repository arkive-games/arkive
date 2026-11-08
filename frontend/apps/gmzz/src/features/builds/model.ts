import { decodeShare, encodeShare, extractCode, plain, MAX_CODE_LENGTH } from './codec'
import type { TalentTree } from '../score/talents'
import type { Skill } from './data'

export type Condition = [number, number[]]
export type ComboNode = [{ ActionName: number; ActionParam: number }, Condition[][]]
export type BuildDraft = {
  name: string
  description: string
  professionId: number
  talentTreeId?: number
  slots: Record<string, number>
  sealed: Record<string, number>
  nodes: ComboNode[]
  iconId: number
  original: string
}
export const emptyBuild = (): BuildDraft => ({ name: '', description: '', professionId: 1200001, slots: {}, sealed: {}, nodes: [], iconId: 1, original: '' })
export const SKILL_SLOTS = [1, 2, 3, 4, 17, 20] as const
export const SEALED_SLOTS = [1, 2, 3] as const
const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)
const positive = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0
const idDict = (v: unknown): v is Record<string, number> => record(v) && Object.entries(v).every(([k, id]) => /^\d+$/.test(k) && positive(id))

export function isNode(value: unknown): value is ComboNode {
  return Array.isArray(value) && value.length === 2 && record(value[0]) && positive(value[0].ActionName)
    && positive(value[0].ActionParam) && Array.isArray(value[1]) && value[1].length <= 50
    && value[1].every((group: unknown) => Array.isArray(group) && group.length > 0 && group.length <= 50
      && group.every((condition: unknown) => Array.isArray(condition) && condition.length === 2 && positive(condition[0])
        && Array.isArray(condition[1]) && condition[1].length <= 16
        && condition[1].every((param: unknown) => typeof param === 'number' && Number.isFinite(param))))
}

export function isBuild(value: unknown): value is BuildDraft {
  return record(value) && typeof value.name === 'string' && value.name.length <= 100
    && typeof value.description === 'string' && value.description.length <= 1000 && positive(value.professionId)
    && (value.talentTreeId === undefined || positive(value.talentTreeId))
    && idDict(value.slots) && idDict(value.sealed) && Object.keys(value.slots).length <= 32 && Object.keys(value.sealed).length <= 16
    && Array.isArray(value.nodes) && value.nodes.length <= 50 && value.nodes.every(isNode)
    && positive(value.iconId) && typeof value.original === 'string' && value.original.length <= MAX_CODE_LENGTH
}

function list(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (record(value) && Object.keys(value).length === 0) return []
  throw new Error('Invalid combo list')
}

export function normalizeNodes(value: unknown): ComboNode[] {
  const nodes = list(plain(value)).map((node) => {
    const tuple = list(node)
    if (tuple.length < 1 || tuple.length > 2) throw new Error('Invalid combo node')
    const normalized = [tuple[0], tuple.length === 1 ? [] : list(tuple[1]).map((group) => list(group))]
    if (!isNode(normalized)) throw new Error('Invalid combo node')
    return normalized
  })
  if (nodes.length > 50) throw new Error('Too many combo nodes')
  return nodes
}

export function importBuild(input: string, current: BuildDraft): BuildDraft {
  const wire = decodeShare(input)
  const combo = plain(wire.get(10))
  if (combo !== undefined && combo !== 0 && !record(combo)) throw new Error('Invalid combo')
  const hasSlots = wire.has(3)
  const slots = hasSlots ? {} as Record<string, number> : { ...current.slots }
  const skillMap = wire.get(3)
  if (hasSlots && !(skillMap instanceof Map) && !(Array.isArray(skillMap) && skillMap.length === 0)) throw new Error('Invalid skill slots')
  if (skillMap instanceof Map) {
    for (const [id, slot] of skillMap) {
      if (!positive(id) || !Number.isSafeInteger(slot) || slot < 0 || slot > 32 || slots[String(slot)]) throw new Error('Invalid skill slot')
      slots[String(slot)] = id
    }
  }
  const sealedValue = wire.has(4) ? plain(wire.get(4)) : current.sealed
  const sealed = Array.isArray(sealedValue) ? Object.fromEntries(sealedValue.map((id, index) => [String(index + 1), id])) : sealedValue
  const preserved = current.original && wire.get(2) === current.professionId ? decodeShare(current.original) : new Map<number, unknown>()
  for (const [key, value] of wire) preserved.set(key, value)
  const next: BuildDraft = {
    ...current,
    name: record(combo) ? String(combo.n || wire.get(11) || '') : String(wire.get(11) ?? ''),
    description: record(combo) ? String(combo.d ?? '') : '',
    professionId: wire.get(2) as number,
    talentTreeId: wire.has(5) ? wire.get(5) === 0 ? undefined : wire.get(5) as number : wire.get(2) === current.professionId ? current.talentTreeId : undefined,
    slots: wire.get(2) === current.professionId || hasSlots ? slots : {},
    sealed: record(sealed) ? sealed as Record<string, number> : {},
    nodes: record(combo) ? normalizeNodes(combo.c ?? []) : combo === undefined && wire.get(2) === current.professionId ? current.nodes : [],
    iconId: record(combo) && positive(combo.i) ? combo.i : 1,
    original: extractCode(encodeShare(preserved)),
  }
  if (!isBuild(next)) throw new Error('Invalid build')
  return next
}

export function exportBuild(draft: BuildDraft, onlyCombo = false, talentTree?: TalentTree | null): string {
  if (!isBuild(draft) || !draft.nodes.length) throw new Error('Invalid build')
  const wire = draft.original ? decodeShare(draft.original) : new Map<number, unknown>()
  // A new pathway cannot inherit another pathway's talent or equipment state.
  if (wire.get(2) !== undefined && wire.get(2) !== draft.professionId) wire.clear()
  wire.set(1, wire.get(1) ?? 'Arkive')
  wire.set(2, draft.professionId)
  wire.set(11, draft.name || 'Build')
  wire.set(10, { n: draft.name || 'Build', d: draft.description, i: draft.iconId, c: draft.nodes })
  if (onlyCombo) {
    for (const key of [...wire.keys()]) if (![1, 2, 10, 11, 13].includes(key)) wire.delete(key)
  } else {
    wire.set(3, new Map(Object.entries(draft.slots).map(([slot, id]) => [id, Number(slot)])))
    wire.set(4, new Map(Object.entries(draft.sealed).map(([slot, id]) => [Number(slot), id])))
    if (talentTree) {
      if (talentTree.professionId !== draft.professionId) throw new Error('Talent pathway mismatch')
      wire.set(5, talentTree.id)
      wire.set(6, new Map<number, unknown>([
        [1, talentTree.nodes.filter((node) => node.type === 'special').map((node) => node.key)],
        [2, talentTree.nodes.filter((node) => node.type === 'normal').map((node) => [node.key, node.maxLevel])],
      ]))
    }
  }
  return encodeShare(wire)
}

export function availableSkill(skill: Skill, professionId: number, treeId?: number): boolean {
  return (!skill.professionId || skill.professionId === professionId)
    && (skill.order >= 0 || (treeId !== undefined && skill.requiredTalentTreeId === treeId))
}

export function rememberedTalentTreeId(draft: BuildDraft): number | undefined {
  if (draft.talentTreeId !== undefined) return draft.talentTreeId
  // Drafts saved before the talent selector keep their tree in the original share.
  try {
    const wire = decodeShare(draft.original)
    const id = wire.get(5)
    return wire.get(2) === draft.professionId && positive(id) ? id : undefined
  } catch { return undefined }
}

export function changeTalent(draft: BuildDraft, treeId: number, skills: Skill[]): BuildDraft {
  const byId = new Map(skills.map((skill) => [skill.id, skill]))
  return { ...draft, talentTreeId: treeId, slots: Object.fromEntries(Object.entries(draft.slots).map(([slot, id]) => {
    const skill = byId.get(id)
    return [slot, skill?.requiredTalentTreeId && skill.requiredTalentTreeId !== treeId ? skill.family : id]
  })) }
}

export function equipSkill(draft: BuildDraft, slot: number, id: number, familyOf: (id: number) => number): BuildDraft {
  const slots = { ...draft.slots }
  for (const [key, equipped] of Object.entries(slots)) {
    if (id && familyOf(equipped) === familyOf(id)) delete slots[key]
  }
  if (id) slots[String(slot)] = id
  else delete slots[String(slot)]
  return { ...draft, slots }
}
