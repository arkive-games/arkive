import { describe, expect, it } from 'vitest'
import type { VBloodPassiveRecord } from '../../lib/vblood'
import { cleanGameText, localizedText, recordMatchesQuery } from './KnowledgePage'

const passive: VBloodPassiveRecord = {
  prefabId: -1027845865,
  prefabName: 'SpellPassive_Blood_T01_BloodSpray',
  school: 'Blood',
  tier: 1,
  name: {
    'en-US': 'Blood Spray',
    'zh-CN': '\u8840\u6db2\u55b7\u5c04',
    'zh-TW': '\u8840\u6db2\u5674\u5c04',
  },
  description: {
    'en-US': 'Increase chance by <skillcolor>{factor1}</c>.',
    'zh-CN': '\u63d0\u9ad8<skillcolor>{factor1}</c>\u51e0\u7387\u3002',
    'zh-TW': '\u63d0\u9ad8<skillcolor>{factor1}</c>\u6a5f\u7387\u3002',
  },
  statModifications: [],
}

describe('passive knowledge records', () => {
  it('selects the official localized text for the active language', () => {
    expect(localizedText(passive.name, 'zh-CN')).toBe('\u8840\u6db2\u55b7\u5c04')
    expect(localizedText(passive.name, 'zh-TW')).toBe('\u8840\u6db2\u5674\u5c04')
    expect(localizedText(passive.name, 'en-US')).toBe('Blood Spray')
  })

  it('keeps official effect wording while replacing runtime placeholders', () => {
    expect(cleanGameText(passive.description['zh-CN'], '\u3014\u6e38\u620f\u5185\u6570\u503c\u3015'))
      .toBe('\u63d0\u9ad8\u3014\u6e38\u620f\u5185\u6570\u503c\u3015\u51e0\u7387\u3002')
  })

  it('finds passives by official localized names and effect text', () => {
    expect(recordMatchesQuery(passive, '\u8840\u6db2\u55b7\u5c04')).toBe(true)
    expect(recordMatchesQuery(passive, '\u63d0\u9ad8')).toBe(true)
    expect(recordMatchesQuery(passive, 'missing')).toBe(false)
  })
})
