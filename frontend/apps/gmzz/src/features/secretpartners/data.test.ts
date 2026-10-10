import { describe, expect, it } from 'vitest'
import { clampPartnerLevel, filterPartners, formatPartnerAttribute, PARTNER_QUALITY, partnerLevelBounds, type SecretPartner } from './data'

const partner: SecretPartner = {
  id: 1, name: 'Puppet', quality: 6, description: '', portrait: '1', category: 'Control',
  attributes: [{ key: 'MaxHp_P', name: 'Max HP', format: 'percent', values: [0.0018, 0.0035, 0.0054] }],
  skill: { id: 10, name: 'Storm', tags: [], cooldown: 1, description: '', brief: '', hasFormula: false, castTargets: [] },
  upgrades: [],
}
const records = [partner, { ...partner, id: 2, quality: 4, category: 'Damage', attributes: [{ key: 'Armor_N', name: 'Armor', format: 'number' as const, values: [17, 34, 51] }] }]

describe('puppet base attributes', () => {
  it('uses exact level values and game-owned display formats', () => {
    expect(formatPartnerAttribute(partner.attributes[0], 1)).toBe('0.18%')
    expect(formatPartnerAttribute(partner.attributes[0], 2)).toBe('0.35%')
    expect(formatPartnerAttribute(records[1].attributes[0], 3)).toBe('51')
  })

  it('clamps to the exported level bounds', () => {
    expect(partnerLevelBounds(records)).toEqual({ min: 1, max: 3 })
    expect(partnerLevelBounds([])).toEqual({ min: 1, max: 1 })
    expect(clampPartnerLevel(0, 50)).toBe(1)
    expect(clampPartnerLevel(51, 50)).toBe(50)
    expect(clampPartnerLevel(2.8, 50)).toBe(2)
    expect(clampPartnerLevel(NaN, 50)).toBe(1)
    expect(formatPartnerAttribute(partner.attributes[0], 99)).toBe('0.54%')
  })

  it('intersects search, skill type, quality and attribute filters', () => {
    expect(filterPartners(records, ' storm ', 'Control', 6, 'MaxHp_P')).toEqual([partner])
    expect(filterPartners(records, '', 'Control', 4, 'MaxHp_P')).toEqual([])
    expect(filterPartners(records, '', '', 0, 'Armor_N').map((row) => row.id)).toEqual([2])
    expect(filterPartners(records, '', '')).toHaveLength(2)
  })

  it('uses four distinct quality colors on portraits and filters', () => {
    expect(Object.keys(PARTNER_QUALITY)).toEqual(['4', '5', '6', '7'])
    expect(new Set(Object.values(PARTNER_QUALITY).map((entry) => entry.color)).size).toBe(4)
    expect(PARTNER_QUALITY[7].border).toBe('border-red-500')
    expect(PARTNER_QUALITY[6].border).toBe('border-orange-500')
    expect(PARTNER_QUALITY[5].border).toBe('border-yellow-400')
    expect(PARTNER_QUALITY[4].border).toBe('border-violet-500')
  })

  it('keeps previous dataset versions browsable while the data deployment catches up', () => {
    const legacy = { ...partner, attributes: undefined } as unknown as SecretPartner
    expect(filterPartners([legacy], '', '')).toEqual([legacy])
    expect(filterPartners([legacy], '', '', 0, 'MaxHp_P')).toEqual([])
    expect(partnerLevelBounds([legacy])).toEqual({ min: 1, max: 1 })
  })
})
