import { dataUrl, RES_BASE } from '@/lib/urls'

/**
 * 人脉 — the characters you befriend. `Fellow` internally; the similarly named
 * `SecretPartner` tables are 秘偶, a different system.
 *
 * Emitted by `tools/apps/gmzz/fellows.py`; see that module for why a relation's
 * effect is per member and why a skill's figures cannot be recovered offline.
 */

export type FellowStory = {
  title: string
  /** Affinity level that opens it — stories do state this, unlike skills. */
  unlockLevel: number | null
  text: string
}

export type FellowSkill = {
  id: number
  name: string
  cooldown: number | null
  /** The chips the game's panel prints, e.g. 单体 / 治疗 — the client's `DesTags`. */
  tags: string[]
  /** 自身 / 15米内单体目标 / 半径为4米的圆形 … */
  castTargets: string[]
  description: string
  /** Placeholder-free prose; the fallback when the detail collapses into marks. */
  brief: string
  /** True when `description` carries a `…` the client fills in at cast time. */
  hasFormula: boolean
  /** Basename under `resource-gmzz/fellows/`; empty for the three with no art. */
  icon: string
}

/** One rung of the star ladder. `stage` is 1–5, the game's 一阶…五阶. */
export type FellowUpgrade = {
  stage: number
  description: string
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
  /** The pathway the game prints on the panel, e.g. 空想家途径. */
  sequence: string
  order: number
  affinityLevelType: number | null
  /** One per fellow. The five `upgrades` below strengthen this, not other skills. */
  skill: FellowSkill
  upgrades: FellowUpgrade[]
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

/** Same directory as the portraits; the names cannot collide. */
export const fellowSkillIconUrl = fellowPortraitUrl

/**
 * Strip the client's own markup. Same reasoning as the 愚者棋局 pages: the tags
 * are the game's UI vocabulary, not HTML, so they are dropped rather than
 * injected. Story text keeps its line breaks — it is prose, and the client
 * indents each paragraph with full-width spaces.
 */
export function plainText(markup: string): string {
  return markup.replace(/<[^>]*>/g, '').replace(/[ \t]+/g, ' ').trim()
}
