import { dataUrl, RES_BASE } from '@/lib/urls'

/**
 * 人脉 — the characters you befriend. `Fellow` internally; the similarly named
 * `SecretPartner` tables are 秘偶, a different system.
 *
 * Emitted by `tools/apps/gmzz/fellows.py`; see that module for why a relation's
 * effect is per member and why the skills carry no unlock level.
 */

export type FellowStory = {
  title: string
  /** Affinity level that opens it — stories do state this, unlike skills. */
  unlockLevel: number | null
  text: string
}

export type Fellow = {
  id: number
  name: string
  englishName: string
  shortName: string
  quality: number
  /** The one line the game prints under the name. */
  label: string
  /** Every faction they belong to, the client's `BackgroudDesc` (its spelling). */
  affiliations: string
  gender: number | null
  voiceActor: string
  order: number
  affinityLevelType: number | null
  defaultSkillId: number | null
  /**
   * Five lines, in the client's order. **No unlock condition** — nothing in the
   * export says what opens each, so nothing here claims to.
   */
  skills: string[]
  stories: FellowStory[]
  relationIds: number[]
  /** Basename under `resource-gmzz/fellows/`. Every fellow has one. */
  portrait: string
}

export type FellowRelationMember = {
  fellowId: number
  /** `null` when this member is in the relation for its story only. */
  effectId: number | null
}

export type FellowRelation = {
  id: number
  name: string
  quality: number | null
  type: number | null
  isOriginal: boolean
  order: number
  story: string
  awakeStory: string
  members: FellowRelationMember[]
}

export type RelationEffectTier = {
  grade: number
  /** 【风闻】…【本相】, from `RelationRarityData` rather than the text's prefix. */
  gradeName: string
  description: string
}

export type RelationEffect = {
  id: number
  summary: string
  skillId: number | null
  tiers: RelationEffectTier[]
}

export type AffinityLadder = {
  type: number
  levels: { level: number; name: string; exp: number | null; interactCount: number | null }[]
}

async function load<T>(file: string, what: string): Promise<T> {
  const response = await fetch(dataUrl(`fellows/${file}.json`))
  if (!response.ok) throw new Error(`Unable to load ${what} (${response.status})`)
  return (await response.json()) as T
}

export const loadFellows = () => load<Fellow[]>('fellows', 'fellows')
export const loadFellowRelations = () => load<FellowRelation[]>('relations', 'relations')
export const loadRelationEffects = () => load<RelationEffect[]>('effects', 'relation effects')
export const loadAffinityLadders = () => load<AffinityLadder[]>('levels', 'affinity levels')

export function fellowPortraitUrl(portrait: string): string {
  return `${RES_BASE}/fellows/${portrait}.webp`
}

/**
 * Strip the client's own markup. Same reasoning as the 愚者棋局 pages: the tags
 * are the game's UI vocabulary, not HTML, so they are dropped rather than
 * injected. Story text keeps its line breaks — it is prose, and the client
 * indents each paragraph with full-width spaces.
 */
export function plainText(markup: string): string {
  return markup.replace(/<[^>]*>/g, '').replace(/[ \t]+/g, ' ').trim()
}
