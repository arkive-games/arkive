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
  /** Cooldown in milliseconds. */
  iCD?: number
  iEleType?: number
  /** The first entry is the kind: 1000 active, 1001 passive. */
  kSkillCategory?: number[]
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
  name?: { 'zh-CN'?: string }
}

export interface TalentLevelRecord {
  iId: number
  iLevel?: number
  /** On a job talent: the job ids (one per advancement) the row is for. */
  iJobId?: number[]
  kProfessionID?: number[]
  kSpecialEffectList?: number[]
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
  /** Season power granted at each level, first level first. */
  iSeasonPower?: number[]
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
  /** What a job talent does, in the game's rich text. */
  specialEffects?: TalentSpecialEffectRecord[]
}

export interface TalentSpecialEffectRecord {
  iID: number
  name?: { 'zh-CN'?: string }
  desc?: { 'zh-CN'?: string }
}

interface ItemIndexDocument {
  items: Array<{ iID: number; name?: { 'zh-CN'?: string } }>
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
  iSubType?: number
  iEquipPart?: number
  iQuality?: number
  iLevelNeed?: number
  iTrade?: number
  iStackLimit?: number
  kIcon?: string
  kJobNeed?: number[]
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
  name?: { 'zh-CN'?: string }
}

export interface EquipmentSpecialGroupRecord {
  iID: number
  iGroup?: number
  iGroupID?: number
  iSpecialID?: number
  iPower?: number
  iWeight?: number
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
  entryCounts?: Array<{ iID: number; iQuality?: number; iNum?: number; iWeight?: number }>
  slots?: Array<{ iID: number; slot?: string; icon?: string; [key: string]: unknown }>
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

/** Skills on their own, so a caller can survive a missing card table. */
export async function loadSkillCatalogData(): Promise<{
  version: DataVersion
  skills: SkillCatalogDocument
}> {
  const version = await loadDataVersion()
  const skills = await fetchJson<SkillCatalogDocument>('skills.json')
  return { version, skills }
}

/** Cards on their own, for the same reason. */
export async function loadCardCatalogData(): Promise<CardCatalogDocument> {
  return fetchJson<CardCatalogDocument>('cards.json')
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

let itemNames: Promise<Map<number, string>> | undefined

/** Item names by id, from the 600 KB item index -- read once, and only when a page asks. */
export function loadItemNames(): Promise<Map<number, string>> {
  if (!itemNames) {
    itemNames = fetchJson<ItemIndexDocument>('items.json').then((document) => new Map(
      document.items.flatMap((item) => item.name?.['zh-CN'] ? [[item.iID, item.name['zh-CN']] as const] : []),
    ))
    itemNames.catch(() => { itemNames = undefined })
  }
  return itemNames
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

// A profession stage reads a dozen skills out of the same few shards, some of
// them 400 KB, so each shard is fetched once per visit.
const skillShards = new Map<string, Promise<SkillShardDocument>>()

function loadSkillShard(path: string): Promise<SkillShardDocument> {
  let pending = skillShards.get(path)
  if (!pending) {
    pending = fetchJson<SkillShardDocument>(path)
    pending.catch(() => skillShards.delete(path))
    skillShards.set(path, pending)
  }
  return pending
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

  const document = await loadSkillShard(shard.path)
  const levelIds = new Set(entry.levels)
  // Some skills carry a second run of level rows (iSkillID * 100 + 11 on);
  // the base run, the lowest id at each level, is the one players see.
  const byLevel = new Map<number, SkillLevelRow>()
  for (const row of document.skills) {
    if (!levelIds.has(row.iID)) continue
    const kept = byLevel.get(row.iLevel)
    if (!kept || row.iID < kept.iID) byLevel.set(row.iLevel, row)
  }
  return [...byLevel.values()].sort((a, b) => a.iLevel - b.iLevel)
}
