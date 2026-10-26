import type { ChosenAffix, PieceState } from './data'
import { gmzzMemory, isFiniteNumber, isNullableNumber, isRecord } from '../../lib/memory'

export type BatchState = { stage: number; badge: number }

/** The loadout as stored: what was picked, before it is checked against the dataset. */
export type EquipmentDraft = { pieces: PieceState[]; batch: BatchState; suitChoice: number | null }

function isChosenAffix(value: unknown): value is ChosenAffix {
  return isRecord(value) && typeof value.family === 'string' && isFiniteNumber(value.value)
}

function isPieceState(value: unknown): value is PieceState {
  return (
    isRecord(value) &&
    isFiniteNumber(value.slot) &&
    isNullableNumber(value.itemId) &&
    isFiniteNumber(value.enhanceStage) &&
    isFiniteNumber(value.refinePercent) &&
    Array.isArray(value.affixes) &&
    value.affixes.every(isChosenAffix)
  )
}

export function isEquipmentDraft(value: unknown): value is EquipmentDraft {
  return (
    isRecord(value) &&
    Array.isArray(value.pieces) &&
    value.pieces.every(isPieceState) &&
    isRecord(value.batch) &&
    isFiniteNumber(value.batch.stage) &&
    isFiniteNumber(value.batch.badge) &&
    isNullableNumber(value.suitChoice)
  )
}

/**
 * The loadout survives a reload. A calculator's inputs are a draft in the
 * state-memory sense — costly to retype, not a record of progress — so it takes
 * that class's thirty-day life. Only the fields listed in `isEquipmentDraft`
 * are ever read back.
 */
export const equipmentDraft = gmzzMemory.draft('score/equipment', {
  default: (): EquipmentDraft => ({ pieces: [], batch: { stage: 0, badge: 0 }, suitChoice: null }),
  validate: isEquipmentDraft,
})
