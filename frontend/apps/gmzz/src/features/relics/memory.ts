import { useMemory } from '@gamemap/state-memory'

import { gmzzMemory, isFiniteNumber, isNullableNumber, isRecord } from '@/lib/memory'
import type { ChosenRelicAffix, RelicServer } from '@/features/relics/data'

/**
 * A slot as stored. Current drafts carry `materials`, one affix list per
 * material position. Older ones carry a single `affixes` list, and older still
 * a material item's `materialId`; both are read once, to place the affixes, and
 * never written again.
 */
export type StoredRelicSlot = {
  groupId: number
  artifactId: number | null
  grade: number
  /** Each artifact's own grade, by artifact id; `grade` is the selected one's. */
  grades?: Record<string, number>
  materialType?: number
  materials?: ChosenRelicAffix[][]
  affixes?: ChosenRelicAffix[]
  materialId?: number | null
}

/**
 * The three slots as stored. `knowledgeLevel` is null until the player sets it,
 * so the dataset's first level applies; `server` is where the relics are
 * scored (see `effectiveGrade`), and is absent in drafts written before it
 * existed, which read as the local server.
 */
export type RelicDraft = { knowledgeLevel: number | null; slots: StoredRelicSlot[]; server?: RelicServer }

function isRelicAffix(value: unknown): value is ChosenRelicAffix {
  return (
    isRecord(value) &&
    typeof value.stat === 'string' &&
    isFiniteNumber(value.value) &&
    isFiniteNumber(value.mark) &&
    (value.affixId === undefined || isFiniteNumber(value.affixId)) &&
    (value.scaled === undefined || typeof value.scaled === 'boolean')
  )
}

const isAffixList = (value: unknown): value is ChosenRelicAffix[] => Array.isArray(value) && value.every(isRelicAffix)

function isStoredRelicSlot(value: unknown): value is StoredRelicSlot {
  return (
    isRecord(value) &&
    isFiniteNumber(value.groupId) &&
    isNullableNumber(value.artifactId) &&
    isFiniteNumber(value.grade) &&
    (value.grades === undefined || (isRecord(value.grades) && Object.values(value.grades).every(isFiniteNumber))) &&
    (value.materialType === undefined || isFiniteNumber(value.materialType)) &&
    (value.materialId === undefined || isNullableNumber(value.materialId)) &&
    (value.materials === undefined || (Array.isArray(value.materials) && value.materials.every(isAffixList))) &&
    (value.affixes === undefined || isAffixList(value.affixes))
  )
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
