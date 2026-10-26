import { equipmentDraft, isEquipmentDraft, type EquipmentDraft } from '../equipment/memory'
import { relicDraft, storedAffixes, type RelicDraft } from '../relics/memory'
import { emptyBondsDraft, isBondsDraft, type BondsDraft } from '../score/bonds'
import { characterDraft, isCharacterDraft, type CharacterDraft, bondsDraft, talentDraft } from '../score/memory'
import { emptyTalentDraft, isTalentDraft, type TalentDraft } from '../score/talents'
import { isFiniteNumber, isRecord } from '../../lib/memory'

/**
 * The score page's inputs as one saved document.
 *
 * Inputs only, never a score: every figure on the page is derived from these
 * and the current dataset, so a saved character re-scores itself when the game
 * data moves. One section per calculator, each the same shape the page keeps
 * as a local draft, so a local draft and a saved character are interchangeable.
 *
 * Compatibility, in order of preference:
 *
 * 1. A new input is an optional field with a default. No version bump: an
 *    older page ignores it, and — because writes merge into the stored object
 *    instead of rebuilding it (`withSection`) — does not erase it either.
 * 2. A change an older page would misread bumps `SCHEMA_VERSION` and adds a
 *    step to `MIGRATIONS`. A page that meets a newer version than it knows
 *    opens the character read-only rather than writing it back.
 * 3. An id the dataset no longer has is not an error: each section's own
 *    restore code already turns it into an empty slot.
 */
export const SCHEMA_VERSION = 1

export type Sections = {
  character: CharacterDraft
  talents: TalentDraft
  bonds: BondsDraft
  equipment: EquipmentDraft
  relics: RelicDraft
}

export type SectionKey = keyof Sections

/** The stored document. Unknown keys are carried, not dropped. */
export type Envelope = { schemaVersion: number } & Record<string, unknown>

type SectionSpec<K extends SectionKey> = {
  default: () => Sections[K]
  validate: (value: unknown) => value is Sections[K]
  /**
   * Drops what an older format stored and this one does not. Run on every read,
   * so the next write of a section leaves it clean, for local drafts and saved
   * characters alike.
   */
  normalize?: (value: Sections[K]) => Sections[K]
}

function without<T extends object>(value: T, keys: string[]): T {
  if (!keys.some((key) => key in value)) return value
  const copy = { ...value } as Record<string, unknown>
  for (const key of keys) delete copy[key]
  return copy as T
}

export const SECTIONS: { [K in SectionKey]: SectionSpec<K> } = {
  character: {
    default: () => characterDraft.record.defaultValue(),
    validate: isCharacterDraft,
    // `scores`: the hand-typed per-item scores, retired once every item derived.
    normalize: (value) => without(value, ['scores']),
  },
  talents: { default: emptyTalentDraft, validate: isTalentDraft },
  bonds: {
    default: emptyBondsDraft,
    validate: isBondsDraft,
    // `historyRankId`: the hand-picked research rank, now derived from points.
    normalize: (value) => without(value, ['historyRankId']),
  },
  equipment: { default: () => equipmentDraft.record.defaultValue(), validate: isEquipmentDraft },
  relics: {
    default: () => relicDraft.record.defaultValue(),
    validate: (value): value is RelicDraft => relicDraft.record.validate(value),
    // Affixes keep only their id; the single per-slot `affixes` list and the
    // material item's `materialId` belong to formats that are gone.
    normalize: (value) => ({
      ...value,
      slots: value.slots.map((slot) => ({
        ...without(slot, ['affixes', 'materialId']),
        materials: (slot.materials ?? []).map(storedAffixes),
      })),
    }),
  },
}

export const SECTION_KEYS = Object.keys(SECTIONS) as SectionKey[]

/** The local draft each section is kept in while no saved character is open. */
export const LOCAL_RECORDS = {
  character: characterDraft,
  talents: talentDraft,
  bonds: bondsDraft,
  equipment: equipmentDraft,
  relics: relicDraft,
} as const

/** A section's stored value read back: validated, cleaned, or the default. */
export function readSection<K extends SectionKey>(key: K, raw: unknown): Sections[K] {
  const spec = SECTIONS[key] as SectionSpec<K>
  if (!spec.validate(raw)) return spec.default()
  return spec.normalize ? spec.normalize(raw) : raw
}

export function readSections(envelope: Envelope): Sections {
  const out = {} as Record<SectionKey, unknown>
  for (const key of SECTION_KEYS) out[key] = readSection(key, envelope[key])
  return out as Sections
}

/** A document holding the given sections. */
export function envelopeOf(sections: Sections): Envelope {
  return { schemaVersion: SCHEMA_VERSION, ...sections }
}

/**
 * The document with one section replaced. Every other key — sections a newer
 * page added, fields this page has never heard of — is carried over untouched.
 */
export function withSection<K extends SectionKey>(envelope: Envelope, key: K, value: Sections[K]): Envelope {
  return { ...envelope, [key]: value }
}

/**
 * Steps from each version to the next. `MIGRATIONS[n]` turns a version-n
 * document into a version-(n+1) one. Empty while there is only version 1.
 */
const MIGRATIONS: Record<number, (envelope: Envelope) => Envelope> = {}

/**
 * Brings a stored document up to `SCHEMA_VERSION`, or reports that it is newer
 * than this page understands. A document that is not an object at all reads as
 * an empty one at the current version.
 */
export function upgrade(raw: unknown): { envelope: Envelope; newer: boolean } {
  if (!isRecord(raw)) return { envelope: { schemaVersion: SCHEMA_VERSION }, newer: false }
  let version = isFiniteNumber(raw.schemaVersion) && raw.schemaVersion >= 1 ? Math.trunc(raw.schemaVersion) : 1
  if (version > SCHEMA_VERSION) return { envelope: { ...raw, schemaVersion: version }, newer: true }
  let envelope: Envelope = { ...raw, schemaVersion: version }
  while (version < SCHEMA_VERSION) {
    const step = MIGRATIONS[version]
    if (!step) throw new Error(`no migration from character schema ${version}`)
    envelope = { ...step(envelope), schemaVersion: version + 1 }
    version += 1
  }
  return { envelope, newer: false }
}
