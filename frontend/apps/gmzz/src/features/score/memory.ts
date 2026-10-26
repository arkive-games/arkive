import { emptyBondsDraft, isBondsDraft } from '@/features/score/bonds'
import { emptyTalentDraft, isTalentDraft } from '@/features/score/talents'
import { gmzzMemory, isFiniteNumber, isNullableNumber, isRecord } from '@/lib/memory'

/** The character's progression: levels and pathway. */
export type CharacterDraft = {
  roleLevel: number
  divinityLevel: number
  /** `null` until a pathway is picked; the page then seeds the first playable one. */
  professionId: number | null
}

export function isCharacterDraft(value: unknown): value is CharacterDraft {
  return (
    isRecord(value) &&
    isFiniteNumber(value.roleLevel) &&
    isFiniteNumber(value.divinityLevel) &&
    isNullableNumber(value.professionId)
  )
}

/**
 * The inputs survive a reload. They are a draft in the state-memory sense — a
 * calculator's configuration, costly to retype — so they take that class's
 * thirty-day life rather than living for ever.
 */
export const characterDraft = gmzzMemory.draft('score/character', {
  default: (): CharacterDraft => ({ roleLevel: 70, divinityLevel: 0, professionId: null }),
  validate: isCharacterDraft,
})

/** The 非凡人物 inputs: owned puppets and connections, the shared skill level and the research points. Same draft class and life. */
export const bondsDraft = gmzzMemory.draft('score/bonds', {
  default: emptyBondsDraft,
  validate: isBondsDraft,
})

/** The 途径 inputs: the active talent tree and every node's level. */
export const talentDraft = gmzzMemory.draft('score/talents', {
  default: emptyTalentDraft,
  validate: isTalentDraft,
})
