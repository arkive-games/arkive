import type { LocalizedText } from './cardCatalog'
import { dataUrl, loadDataVersion, type DataVersion } from './lib/urls'

export interface PetArt {
  head: string
  starHead: string
  handbook: string
  fightList: string
  fightField: string
  encyclopedia: string
  gacha: string
  gachaAward: string
  tips: string
}

export interface PetRecord {
  id: number
  name: LocalizedText
  starTableName: LocalizedText
  quality: number
  camp: number
  king: boolean
  monsterId: number
  followPetId: number
  unlockStar: number
  sort: number
  show: boolean
  art: PetArt
}

export interface PetAttribute {
  id: number
  key: string
  name: LocalizedText
  type: number
  dataType: number
}

export interface PetStarRecord {
  id: number
  petId: number
  star: number
  stage: number
  baseAttr: number
  starFightStrength: number
  starAssistStrength: number
  collectStrength: number
  fightAttributes: number[][]
  collectAttributes: number[][]
  assistSkill: number[]
  stageSkill: number[]
  activeSkills: number[]
  passiveMain: number | null
  protectSkill: number | null
  corePassiveSkill: number | null
}

export interface PetSkillRecord {
  id: number
  name: LocalizedText
  description: LocalizedText | null
  level: number
  maxLevel: number
  cooldown: number
  icon: string
}

interface PetCatalogDocument {
  counts: {
    pets: number
    petsWithName: number
    artReferencesResolved: number
  }
  attributes: PetAttribute[]
  pets: PetRecord[]
}

interface PetStarsDocument {
  counts: { rows: number; pets: number }
  stars: PetStarRecord[]
}

interface PetSkillsDocument {
  counts: { skills: number; withDescription: number; withIcon: number }
  skills: PetSkillRecord[]
}

export interface PetWikiData {
  version: DataVersion
  catalog: PetCatalogDocument
  stars: PetStarsDocument
  skills: PetSkillsDocument
}

export type MonsterRank = 'normal' | 'elite' | 'mvp' | 'boss'

export interface MonsterRecord {
  id: number
  name?: LocalizedText
  level?: number
  rank?: Exclude<MonsterRank, 'normal'>
  subType?: number
  race?: number
  element?: number
  size?: number
  camp?: number
  stats?: Record<string, number>
  headIcon?: string
  modelTexture?: string
  skills?: number[]
  speed?: number
  attackRange?: number
  /** Ids of the maps the creature is placed on. */
  maps?: number[]
  dropPool?: number
  normalDropPools?: number[]
}

export interface MvpRecord {
  id: number
  npcId: number
  name?: LocalizedText
  level?: number
  mapId?: number
  respawnSeconds?: number
  shortestKillSeconds?: number
  awardPreviewItems?: number[]
  headIcon?: string
  background?: string
}

interface MvpDocument {
  mvps: MvpRecord[]
}

interface MapIndexDocument {
  maps: Array<{ iID: number; name?: LocalizedText }>
}

export interface DropSlot {
  slot: number
  /** The slot's own chance, 1 for a sure drop. */
  chance: number
  rolls: [number, number]
  items: Array<{ item: number; weight: number }>
}

export interface DropPool {
  id: number
  slots: DropSlot[]
}

interface DropShard {
  path: string
  from: number
  to: number
}

interface DropCatalogDocument {
  shards: DropShard[]
}

export interface MonsterSkillRecord {
  id: number
  skillId: number
  level: number
  name?: LocalizedText
  cooldown?: number
  castTime?: number
  rangeMax?: number
  element?: number
  damageType?: number
  targetMax?: number
  damageParam?: number[]
}

interface MonsterShard {
  path: string
  monsters: number
  from: number
  to: number
}

export interface MonsterCatalogDocument {
  counts: {
    monsters: number
    withLocalizedName: number
    withStats: number
    withHeadIcon: number
    byRank: Record<MonsterRank, number>
    skillsReferenced: number
  }
  enums: {
    race: Record<string, LocalizedText>
    element: Record<string, LocalizedText>
    size: Record<string, LocalizedText>
  }
  shards: MonsterShard[]
}

interface MonsterShardDocument {
  monsters: MonsterRecord[]
}

interface MonsterSkillsDocument {
  counts: { skills: number; referenced: number; unresolved: number }
  skills: MonsterSkillRecord[]
}

export interface MonsterWikiData {
  version: DataVersion
  catalog: MonsterCatalogDocument
  monsters: MonsterRecord[]
  skills: MonsterSkillsDocument
  mvps: MvpRecord[]
  mapNames: Map<number, string>
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(dataUrl(path))
  if (!response.ok) throw new Error(`RO3 data request failed: ${path} (${response.status})`)
  return response.json() as Promise<T>
}

export async function loadPetWikiData(): Promise<PetWikiData> {
  const version = await loadDataVersion()
  const [catalog, stars, skills] = await Promise.all([
    fetchJson<PetCatalogDocument>('pets.json'),
    fetchJson<PetStarsDocument>('pets-star.json'),
    fetchJson<PetSkillsDocument>('pets-skills.json'),
  ])
  return { version, catalog, stars, skills }
}

export async function loadMonsterWikiData(): Promise<MonsterWikiData> {
  const version = await loadDataVersion()
  const [catalog, skills, mvp, maps] = await Promise.all([
    fetchJson<MonsterCatalogDocument>('monsters.json'),
    fetchJson<MonsterSkillsDocument>('monsters-skills.json'),
    fetchJson<MvpDocument>('mvp.json'),
    fetchJson<MapIndexDocument>('maps.json'),
  ])
  const shards = await Promise.all(catalog.shards.map((shard) => fetchJson<MonsterShardDocument>(shard.path)))
  const mapNames = new Map(maps.maps.flatMap((map) => map.name?.['zh-CN'] ? [[map.iID, map.name['zh-CN']] as const] : []))
  return { version, catalog, monsters: shards.flatMap((shard) => shard.monsters), skills, mvps: mvp.mvps, mapNames }
}

// The drop tables run to 3.5 MB over three shards, so a shard is read only
// when a picked creature rolls a pool inside its id range, and once per visit.
let dropCatalog: Promise<DropCatalogDocument> | undefined
const dropShards = new Map<string, Promise<Map<number, DropPool>>>()

export async function loadDropPool(id: number): Promise<DropPool | null> {
  if (!dropCatalog) {
    dropCatalog = fetchJson<DropCatalogDocument>('monsters-drops.json')
    dropCatalog.catch(() => { dropCatalog = undefined })
  }
  const shard = (await dropCatalog).shards.find((candidate) => id >= candidate.from && id <= candidate.to)
  if (!shard) return null
  let pending = dropShards.get(shard.path)
  if (!pending) {
    pending = fetchJson<{ pools: DropPool[] }>(shard.path).then((document) => new Map(document.pools.map((pool) => [pool.id, pool])))
    pending.catch(() => dropShards.delete(shard.path))
    dropShards.set(shard.path, pending)
  }
  return (await pending).get(id) ?? null
}
