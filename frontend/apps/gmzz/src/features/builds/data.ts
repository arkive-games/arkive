import { dataUrl, RES_BASE } from '../../lib/urls'
import { loadRelics } from '../relics/data'
import { loadFellows } from '../fellows/data'
import { loadSecretPartners } from '../secretpartners/data'
import { loadTalents } from '../score/talents'
import type { ComboNode } from './model'

export type Skill = {
  id: number; name: string; professionId: number; type: number; family: number; order: number; autoCast: boolean
  description: string; brief: string; icon: string; cooldown: number | null; tags: string[]; unlock: string
  requiredTalentTreeId: number | null
  talentEffects: { nodeId: number; treeId: number; name: string; description: string }[]
}
export type ConditionMeta = {
  ID: number; EditDescStr: string; ParamType: number[]; ParamForEdit: boolean[]
  Limit: number[][]; HintText: string[]; bEnabled: boolean; ProfessionUseLimit?: number[]
}
export type Catalog = {
  skills: Skill[]; professions: { id: number; name: string }[]
  conditions: ConditionMeta[]
  buffs: { id: number; name: string; status: boolean; professions: number[] }[]
  limits: { name: number; description: number; nodes: number }
  resources: { professionId: number; name: string; max: number; supported: boolean }[]
  presets: Record<string, ComboNode[][]>
}
export async function loadBuildData() {
  const [response, relics, fellows, partners, talents] = await Promise.all([
    fetch(dataUrl('builds/catalog.json')), loadRelics(), loadFellows(), loadSecretPartners(), loadTalents(),
  ])
  if (!response.ok) throw new Error('Unable to load build data')
  const catalog = await response.json() as Catalog
  if (!Array.isArray(catalog.skills) || !Array.isArray(catalog.professions)) throw new Error('Invalid build catalogue')
  return { catalog, relics, fellows, partners, talents }
}
export type BuildData = Awaited<ReturnType<typeof loadBuildData>>
export const skillIcon = (icon: string) => icon ? RES_BASE + '/builds/' + icon + '.webp' : undefined
