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
