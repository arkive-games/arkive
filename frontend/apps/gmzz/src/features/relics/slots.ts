import { storedAffixes, type RelicDraft, type StoredRelicSlot } from '@/features/relics/memory'
import {
  MATERIAL_SLOTS, artifactsInGroup, gradeOptions, gradeRung, isRareAffix, knowledgeLadder, materialTypeAt, maxAffixes,
  newRelicSlot, typePool, usedGroups,
  type ChosenRelicAffix, type PoolAffix, type Relics, type RelicSlotState,
} from '@/features/relics/data'

/**
 * The stored relic draft read against the dataset, shared by the relic section
 * and the formula hints of the page's ledger, so both read the same relics.
 */

/**
 * The panel's three slots. 1 攻击 and 2 防御 are fixed — an artifact's `groupId`
 * *is* the slot it goes in, and so is the material type it takes. 3 特化 takes
 * either, and is the only one that asks which.
 */
export const GROUP_IDS = [1, 2, 3]
export const SPEC_GROUP = 3

/** A freshly added affix row: no stat picked, so it scores and counts as nothing. */
export const EMPTY_RELIC_AFFIX: ChosenRelicAffix = { stat: '', value: 0, mark: 0 }

export function affixFrom(rung: PoolAffix): ChosenRelicAffix {
  return { stat: rung.stat, value: rung.value, mark: rung.mark, affixId: rung.id, scaled: rung.scaled }
}

/** The stored knowledge level if the ladder has it, the ladder's first level otherwise. */
export function knowledgeLevelOf(relics: Relics, stored: number | null, season: number | undefined): number {
  const ladder = knowledgeLadder(relics, season)
  const known = ladder.some((rung) => rung.level === stored)
  return known ? (stored as number) : ladder.find((rung) => rung.level != null)?.level ?? 0
}

/**
 * A stored slot read against the dataset: the grade clamped to the ones a
 * player can hold, each affix resolved by id against its position's pool, and
 * a group or a second rare word repeated within a material dropped — those
 * cannot exist in game. An id the pool no longer has is dropped too. A relic
 * the player removed stays removed.
 */
function restoreSlot(relics: Relics, groupId: number, stored: StoredRelicSlot | undefined, fresh: RelicSlotState): RelicSlotState {
  if (!stored) return fresh
  const grades = gradeOptions(relics)
  // A grade the player cannot hold (0) reads as the best one they can.
  const clamp = (value: number) => (grades.includes(value)
    ? value
    : gradeRung(relics, value) && grades.length > 0 ? grades[grades.length - 1] : fresh.grade)
  const artifactId = stored.artifactId === null ? null
    : artifactsInGroup(relics, groupId).some((a) => a.id === stored.artifactId) ? stored.artifactId : fresh.artifactId
  // Older drafts kept one grade per slot; it becomes the stored artifact's.
  const perArtifact: Record<string, number> = {}
  for (const [id, value] of Object.entries(stored.grades ?? {})) perArtifact[id] = clamp(value)
  if (artifactId != null && perArtifact[String(artifactId)] === undefined && stored.artifactId === artifactId) {
    perArtifact[String(artifactId)] = clamp(stored.grade)
  }
  const grade = artifactId != null ? perArtifact[String(artifactId)] ?? fresh.grade : clamp(stored.grade)
  const materialType = groupId === SPEC_GROUP ? (stored.materialType ?? 1) : undefined
  const materials = Array.from({ length: MATERIAL_SLOTS }, (_, at) => {
    const pool = typePool(relics, materialTypeAt(groupId, at))
    const kept: ChosenRelicAffix[] = []
    for (const affix of storedAffixes(stored.materials?.[at])) {
      // An empty row the player added but has not filled yet stays.
      if (affix.affixId === null) {
        kept.push(EMPTY_RELIC_AFFIX)
        continue
      }
      const source = pool.find((entry) => entry.id === affix.affixId)
      if (!source) continue
      const taken = usedGroups(pool, kept)
      if (taken.groups.has(source.groupId) || (taken.rare && isRareAffix(source))) continue
      kept.push(affixFrom(source))
    }
    return kept.slice(0, maxAffixes(relics))
  })
  return {
    groupId,
    artifactId,
    grade,
    grades: perArtifact,
    ...(materialType !== undefined ? { materialType } : {}),
    materials,
  }
}

/**
 * The three slots of a draft. A slot never stored is pre-picked, so a card
 * shows real effects on first paint; the scorer ignores `artifactId`, so this
 * changes no number.
 */
export function restoreSlots(relics: Relics, slots: RelicDraft['slots']): RelicSlotState[] {
  return GROUP_IDS.map((groupId) => {
    const fresh: RelicSlotState = {
      ...newRelicSlot(groupId, relics.promotion.worstGrade),
      artifactId: artifactsInGroup(relics, groupId)[0]?.id ?? null,
      ...(groupId === SPEC_GROUP ? { materialType: 1 } : {}),
    }
    return restoreSlot(relics, groupId, slots.find((slot) => slot.groupId === groupId), fresh)
  })
}
