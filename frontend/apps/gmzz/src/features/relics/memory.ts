import { useMemory } from '@gamemap/state-memory'

import { gmzzMemory, isFiniteNumber, isNullableNumber, isRecord } from '@/lib/memory'
import type { ChosenRelicAffix, RelicServer } from '@/features/relics/data'

/**
 * An affix as stored: the pool entry it picks, and nothing derived from it.
 * The stat, the value and the Mark are all looked up from the dataset by id,
 * so a stored relic re-scores itself when the data moves. `null` is a row the
 * player added and has not filled yet.
 */
export type StoredRelicAffix = { affixId: number | null }

/**
 * A slot as stored: one affix list per material position. Read back through
 * `storedAffixes`, which also discards entries of the retired stat-and-value
 * shape, so a draft written before ids were stored still loads.
 */
export type StoredRelicSlot = {
  groupId: number
  artifactId: number | null
  grade: number
  /** Each artifact's own grade, by artifact id; `grade` is the selected one's. */
  grades?: Record<string, number>
  materialType?: number
  materials?: StoredRelicAffix[][]
}

/**
 * The three slots as stored. `knowledgeLevel` is null until the player sets it,
 * so the dataset's first level applies; `server` is where the relics are
 * scored (see `effectiveGrade`), and is absent in drafts written before it
 * existed, which read as the local server.
 */
export type RelicDraft = { knowledgeLevel: number | null; slots: StoredRelicSlot[]; server?: RelicServer }

/**
 * Any affix-shaped object. Deliberately loose: an affix whose `affixId` is not
 * a number or null — the shape older drafts wrote, keyed by stat and value — is
 * dropped by `storedAffixes` rather than failing the whole draft.
 */
const isAffixList = (value: unknown): value is unknown[] => Array.isArray(value) && value.every(isRecord)

function isStoredRelicSlot(value: unknown): value is StoredRelicSlot {
  return (
    isRecord(value) &&
    isFiniteNumber(value.groupId) &&
    isNullableNumber(value.artifactId) &&
    isFiniteNumber(value.grade) &&
    (value.grades === undefined || (isRecord(value.grades) && Object.values(value.grades).every(isFiniteNumber))) &&
    (value.materialType === undefined || isFiniteNumber(value.materialType)) &&
    (value.materials === undefined || (Array.isArray(value.materials) && value.materials.every(isAffixList)))
  )
}

/**
 * A stored material's affixes, reduced to what is kept. An entry without a
 * usable `affixId` is discarded: it was written by a draft format that stored
 * the derived stat, value and Mark instead of the id.
 */
export function storedAffixes(list: unknown): StoredRelicAffix[] {
  if (!Array.isArray(list)) return []
  const out: StoredRelicAffix[] = []
  for (const entry of list) {
    if (!isRecord(entry)) continue
    if (entry.affixId === null || isFiniteNumber(entry.affixId)) out.push({ affixId: entry.affixId })
  }
  return out
}

/** A slot's materials as stored: the id of each affix, an unfilled row as null. */
export function toStoredMaterials(materials: ChosenRelicAffix[][]): StoredRelicAffix[][] {
  return materials.map((list) => list.map((affix) => ({ affixId: affix.affixId ?? null })))
}

function isRelicDraft(value: unknown): value is RelicDraft {
  return (
    isRecord(value) &&
    isNullableNumber(value.knowledgeLevel) &&
    Array.isArray(value.slots) &&
    value.slots.every(isStoredRelicSlot) &&
    (value.server === undefined || value.server === 'local' || value.server === 'cross')
  )
}

/** The relic inputs survive a reload; a calculator's configuration is a draft, so it takes that class's thirty-day life. */
export const relicDraft = gmzzMemory.draft('score/relics', {
  default: (): RelicDraft => ({ knowledgeLevel: null, slots: [] }),
  validate: isRelicDraft,
})

/**
 * Where the relics are scored, shared through the draft record so every toggle
 * bound to it — the one at the top of the page and the one in the relic
 * section — reads and writes the same value.
 */
export function useRelicServer(): readonly [RelicServer, (next: RelicServer) => void] {
  const [draft, setDraft] = useMemory(relicDraft)
  return [draft.server ?? 'local', (next) => setDraft((prev) => ({ ...prev, server: next }))] as const
}
