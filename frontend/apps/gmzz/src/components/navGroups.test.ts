import { describe, expect, it } from 'vitest'
import { ENCYCLOPEDIA_GROUPS, FELLOW_REFERENCE_TABS, isEncyclopediaSection } from './navGroups'

describe('encyclopedia navigation ownership', () => {
  it('reuses reference groups while excluding tool routes and the trade calculator', () => {
    for (const group of ENCYCLOPEDIA_GROUPS) {
      for (const entry of group.children) expect(isEncyclopediaSection(entry.key)).toBe(true)
    }
    for (const key of ['/tools/build', '/score', '/tools/league-points', '/tools/traintrade-station', '/'] as const) {
      expect(isEncyclopediaSection(key)).toBe(false)
    }
    expect(isEncyclopediaSection('/managedtrade', 'calculator')).toBe(false)
    expect(isEncyclopediaSection('/managedtrade', 'commissions')).toBe(true)
    expect(FELLOW_REFERENCE_TABS.map(tab => tab.to)).toEqual(['/fellows', '/fellows/relations'])
    expect(isEncyclopediaSection('/fellows/relations')).toBe(true)
  })
})
