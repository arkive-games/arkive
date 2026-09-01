import type { CardCatalogDocument } from './cardCatalog'
import { dataUrl, loadDataVersion, type DataVersion } from './lib/urls'

export interface SkillIndexEntry {
  iSkillID: number
  iJob?: number
  iMaxLevel: number
  iSystemType?: number
  icon?: string
  name?: { 'zh-CN'?: string }
  levels: number[]
}

export interface SkillLevelRow {
  iID: number
  iSkillID: number
  iLevel: number
  iMaxLevel?: number
  iDistanceMax?: number
  iTargetMax?: number
  kCost?: unknown[]
  kDamageParam1?: unknown[]
  kDamageParam2?: unknown[]
  icon?: string
  name?: { 'zh-CN'?: string }
  desc?: { 'zh-CN'?: string }
}

export interface JobSkillRow {
  iID: number
  iJobLv: number
  iJobRank: number
  iProfessionID: number
  kDescData?: number[]
}

export interface JobSkillDocument {
  counts: { rows: number }
  jobSkills: JobSkillRow[]
}

export interface TalentTreeRecord {
  iId: number
  iNeedLevel?: number
  name?: { 'zh-CN'?: string }
}

export interface TalentNodeRecord {
  iId: number
  iLevelGroupId?: number
  iMaxLevel?: number
  iTalentTreeID: number
  iType: number
  iIsStartPoint?: number
  kAfterids?: number[]
  kPosition?: number[]
  levels?: number[]
}

export interface TalentLevelRecord {
  iId: number
  iLevel?: number
  iSkillPoint?: number
  kAttrs?: number[][]
  kCosts?: number[][]
  name?: { 'zh-CN'?: string }
  icon?: string
}

export interface TalentAttributeRecord {
  iID: number
  kVariable: string
  iCalculateType?: number
  name?: { 'zh-CN'?: string }
}

export interface PatronTalentGroupRecord {
  iID: number
  kTanlentPoints: number[]
  name?: { 'zh-CN'?: string }
}

export interface PatronTalentNodeRecord {
  iID: number
  iMaxLevel: number
  iPos: number
  iType: number
  iIsStartPoint?: number
  iPostTalentID?: number[]
  kTalentAttrIds?: number[]
  name?: { 'zh-CN'?: string }
  icon?: string
}

export interface PatronTalentAttrRecord {
  iID: number
  kAttrs: number[][]
}

export interface TalentCatalogDocument {
  counts: {
    seasonTrees: number
    seasonNodes: number
    seasonLevels: number
    patronNodes: number
    patronGroups: number
  }
  attributes: TalentAttributeRecord[]
  seasonTalents: {
    trees: TalentTreeRecord[]
    nodes: TalentNodeRecord[]
    levels: TalentLevelRecord[]
  }
  patronTalents: {
    groups: PatronTalentGroupRecord[]
    nodes: PatronTalentNodeRecord[]
    attrLevels: PatronTalentAttrRecord[]
  }
}

interface SkillShard {
  idPrefix: string
  path: string
  rows: number
}

export interface SkillCatalogDocument {
  source: string
  counts: {
    rows: number
    withIcon: number
    withName: number
    withDescription: number
    skills: number
    shards: number
  }
  shards: SkillShard[]
  skills: SkillIndexEntry[]
}

interface SkillShardDocument {
  skills: SkillLevelRow[]
}

export interface WikiData {
  version: DataVersion
  skills: SkillCatalogDocument
  cards: CardCatalogDocument
}

export interface EquipmentItemRecord {
  iID: number
  iEquipPart?: number
  iQuality?: number
  iLevelNeed?: number
  iTrade?: number
  iStackLimit?: number
  kIcon?: string
}

export interface EquipmentRecord {
  iID: number
  iRank?: number
  iEntries?: number
  kBasicAttribute?: number[][]
  kFixedEntries?: number[][]
  kSpecial?: number[][]
  kFixedSpecialAttribute?: number[]
  slot?: string
  name?: { 'zh-CN'?: string }
  desc?: { 'zh-CN'?: string }
  icon?: string
  item?: EquipmentItemRecord
}

export interface EquipmentAttributeRecord {
  iID: number
  kVariable?: string
  iAttributeType?: number
  name?: { 'zh-CN'?: string }
}

export interface EquipmentEntryRecord {
  iID: number
  iGroup?: number
  iAttriID?: number
  iMin?: number
  iMax?: number
  iWeight?: number
}

export interface EquipmentSpecialGroupRecord {
  iID: number
  iGroupID?: number
  iSpecialID?: number
  iPower?: number
  name?: { 'zh-CN'?: string }
  desc?: { 'zh-CN'?: string }
}

export interface EquipmentSpecialEffectRecord {
  iID: number
  iGroupID?: number
  iPower?: number
  name?: { 'zh-CN'?: string }
  desc?: { 'zh-CN'?: string }
  kDescData?: string[]
}

export interface EquipmentDocument {
  counts: { equipment: number; withItem: number; withName: number; withIcon: number }
  attributes: EquipmentAttributeRecord[]
  equipment: EquipmentRecord[]
}

export interface EquipmentAttrsDocument {
  counts: Record<string, number>
  attributes: EquipmentAttributeRecord[]
  entryGroups: EquipmentEntryRecord[]
  specialGroups: EquipmentSpecialGroupRecord[]
  specialEffects: EquipmentSpecialEffectRecord[]
}

export interface SoulAttributeRecord {
  iID?: number
  iAttributeID?: number
  iSubAttriID?: number
  attributeId?: number
  iMin?: number
  iMax?: number
  min?: number
  max?: number
  iGroup?: number
  iMarkID?: number
  name?: { 'zh-CN'?: string }
}

export interface SoulRecord {
  iID: number
  quality?: number
  type?: number
  subType?: number
  icon?: string
  name?: { 'zh-CN'?: string }
  desc?: { 'zh-CN'?: string }
  seasonPower?: number
  subAttributeGroup?: number
  primaryAttributes?: SoulAttributeRecord[]
  primaryAttributeLevelUp?: SoulAttributeRecord[]
  initialMarks?: Array<{ threshold?: number; markId?: number; specialEffectIds?: number[] }>
  marks?: Array<{ threshold?: number; markId?: number; effectId?: number; stage?: number; icon?: string; specialEffectIds?: number[] }>
  subAttributes?: SoulAttributeRecord[]
}

export interface SoulMarkEffectRecord {
  iID: number
  iMarkID?: number
  iLevel?: number
  desc?: { 'zh-CN'?: string }
  name?: { 'zh-CN'?: string }
}

export interface SoulResonanceRecord {
  iID: number
  resonanceId?: number
  power?: number
  icon?: string
  name?: { 'zh-CN'?: string }
  attributes?: SoulAttributeRecord[]
}

export interface SoulResonanceActivationRecord {
  iID?: number
  iId?: number
  iJob?: number
  iJobProfess?: number
  iJobResonanceId?: number
  iJobResonanceSkills?: number[]
  iResonanceID?: number
  iJobID?: number
  iJobLv?: number
  iNeedNum?: number
  name?: { 'zh-CN'?: string }
  desc?: { 'zh-CN'?: string }
}

export interface SoulResonanceRestraintRecord {
  iID: number
  iSourceID?: number
  iTargetID?: number
  iValue?: number
  name?: { 'zh-CN'?: string }
  desc?: { 'zh-CN'?: string }
}

export interface SoulWikiDocument {
  counts: Record<string, number>
  souls: SoulRecord[]
  markEffects: SoulMarkEffectRecord[]
  subAttributeGroups: Array<{ iID: number; attributes?: SoulAttributeRecord[] }>
  levels: SoulAttributeRecord[]
  resonance: SoulResonanceRecord[]
  resonanceActivation: SoulResonanceActivationRecord[]
  resonanceRestraint: SoulResonanceRestraintRecord[]
  heroicSpiritLayers: SoulAttributeRecord[]
  heroicSpiritLevels: SoulAttributeRecord[]
  attributes: EquipmentAttributeRecord[]
  specialGroups: EquipmentSpecialGroupRecord[]
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(dataUrl(path))
  if (!response.ok) throw new Error(`RO3 data request failed: ${path} (${response.status})`)
  return response.json() as Promise<T>
}

export async function loadWikiData(): Promise<WikiData> {
  const version = await loadDataVersion()
  const [skills, cards] = await Promise.all([
    fetchJson<SkillCatalogDocument>('skills.json'),
    fetchJson<CardCatalogDocument>('cards.json'),
  ])
  return { version, skills, cards }
}

export async function loadProfessionWikiData(): Promise<{
  version: DataVersion
  skills: SkillCatalogDocument
  jobSkills: JobSkillDocument
}> {
  const version = await loadDataVersion()
  const [skills, jobSkills] = await Promise.all([
    fetchJson<SkillCatalogDocument>('skills.json'),
    fetchJson<JobSkillDocument>('job-skills.json'),
  ])
  return { version, skills, jobSkills }
}

export async function loadTalentWikiData(): Promise<{
  version: DataVersion
  talents: TalentCatalogDocument
}> {
  const [version, talents] = await Promise.all([
    loadDataVersion(),
    fetchJson<TalentCatalogDocument>('talents.json'),
  ])
  return { version, talents }
}

export async function loadEquipmentWikiData(): Promise<{
  version: DataVersion
  equipment: EquipmentDocument
  attrs: EquipmentAttrsDocument
}> {
  const [version, equipment, attrs] = await Promise.all([
    loadDataVersion(),
    fetchJson<EquipmentDocument>('equipment.json'),
    fetchJson<EquipmentAttrsDocument>('equipment-attrs.json'),
  ])
  return { version, equipment, attrs }
}

export async function loadSoulWikiData(): Promise<{
  version: DataVersion
  souls: SoulWikiDocument
}> {
  const [version, souls] = await Promise.all([
    loadDataVersion(),
    fetchJson<SoulWikiDocument>('souls.json'),
  ])
  return { version, souls }
}

export async function loadSkillLevels(
  entry: SkillIndexEntry,
  shards: SkillShard[],
): Promise<SkillLevelRow[]> {
  const levelId = String(entry.levels[0] ?? entry.iSkillID)
  const shard = [...shards]
    .filter((candidate) => levelId.startsWith(candidate.idPrefix))
    .sort((a, b) => b.idPrefix.length - a.idPrefix.length)[0]
  if (!shard) return []

  const document = await fetchJson<SkillShardDocument>(shard.path)
  const levelIds = new Set(entry.levels)
  return document.skills
    .filter((row) => levelIds.has(row.iID))
    .sort((a, b) => a.iLevel - b.iLevel)
}
