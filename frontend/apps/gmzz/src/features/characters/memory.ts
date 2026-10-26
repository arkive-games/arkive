import type { Envelope } from '@/features/characters/envelope'
import { gmzzMemory, isFiniteNumber, isRecord } from '@/lib/memory'

/**
 * A saved character as held on this device: the document, the server revision
 * it was last in step with, and whether it carries edits the server has not
 * had yet.
 */
export type WorkingCopy = { data: Envelope; revision: number; dirty: boolean }

function isWorkingCopy(value: unknown): value is WorkingCopy | null {
  return value === null || (
    isRecord(value) &&
    isRecord(value.data) &&
    isFiniteNumber(value.data.schemaVersion) &&
    isFiniteNumber(value.revision) &&
    typeof value.dirty === 'boolean'
  )
}

/**
 * One working copy per saved character. Progress, not a draft: an unsent edit
 * is the player's work and must not expire after thirty days or vanish on
 * sign-out, which the draft class would allow.
 */
const workingCopies = gmzzMemory.progress('score/saved-character', {
  default: null as WorkingCopy | null,
  validate: isWorkingCopy,
  keyedBy: { character: true },
})

export function workingCopyOf(id: string) {
  return workingCopies.at({ character: id })
}

/** The saved character last opened for editing, which `/score` returns to. */
export const lastCharacter = gmzzMemory.preference('score/last-character', {
  default: null as string | null,
  validate: (value: unknown): value is string | null => value === null || typeof value === 'string',
})
