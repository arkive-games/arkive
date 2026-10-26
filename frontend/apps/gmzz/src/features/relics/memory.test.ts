import { describe, expect, it } from 'vitest'

import { relicDraft, storedAffixes, toStoredMaterials } from '@/features/relics/memory'

describe('stored relic affixes', () => {
  it('keeps ids and unfilled rows, and discards the retired stat-and-value shape', () => {
    expect(storedAffixes([
      { affixId: 501 },
      { affixId: null },
      // Written before ids were stored: the derived figures only.
      { stat: 'Atk', value: 490, mark: 1200 },
      // Written with both: the id is what is kept.
      { stat: 'Def', value: 120, mark: 300, affixId: 502, scaled: true },
      'junk',
    ])).toEqual([{ affixId: 501 }, { affixId: null }, { affixId: 502 }])
    expect(storedAffixes(undefined)).toEqual([])
  })

  it('stores a chosen affix as its id alone', () => {
    expect(toStoredMaterials([
      [{ stat: 'Atk', value: 490, mark: 1200, affixId: 501, scaled: true }, { stat: '', value: 0, mark: 0 }],
      [],
    ])).toEqual([[{ affixId: 501 }, { affixId: null }], []])
  })

  it('still accepts a draft holding the retired shapes, so loading it loses nothing else', () => {
    const validate = relicDraft.record.validate
    expect(validate({
      knowledgeLevel: 3,
      slots: [
        { groupId: 1, artifactId: 7, grade: 3, affixes: [{ stat: 'Atk', value: 1, mark: 1 }], materialId: 4 },
        { groupId: 2, artifactId: null, grade: 2, materials: [[{ stat: 'Def', value: 1, mark: 1 }], []] },
      ],
    })).toBe(true)
  })
})
