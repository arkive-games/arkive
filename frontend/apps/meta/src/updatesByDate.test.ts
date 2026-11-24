import { describe, expect, it } from 'vitest'
import type { ResolvedPlatformEntry } from '@gamemap/ui'
import { updatesByDate } from './updatesByDate'

const first: ResolvedPlatformEntry = {
  date: '2026-11-25', commit: 'first', targets: ['gmzz'],
  changes: [{ kind: 'fix', text: 'Fixed the listing.' }],
}
const entries: ResolvedPlatformEntry[] = [
  first, first, { ...first, commit: 'second', targets: ['palworld'] },
  { ...first, date: '2026-11-24' }, { ...first, date: '2026-11-23' },
]

describe('updatesByDate', () => {
  it('combines releases by calendar day without duplicating an identical record or losing its targets', () => {
    const days = updatesByDate(entries, '', '')
    expect(days.map(([date]) => date)).toEqual(['2026-11-25', '2026-11-24', '2026-11-23'])
    expect(days[0][1].map(change => change.targets)).toEqual([['gmzz'], ['palworld']])
  })
  it.each([
    ['2026-11-24', '2026-11-24', ['2026-11-24']],
    ['2026-11-23', '2026-11-24', ['2026-11-24', '2026-11-23']],
    ['2026-11-25', '', ['2026-11-25']],
    ['', '2026-11-23', ['2026-11-23']],
    ['2026-11-26', '', []],
    ['2026-11-25', '2026-11-23', []],
  ] as const)('filters inclusive ISO bounds %s to %s', (from, to, expected) => {
    expect(updatesByDate(entries, from, to).map(([date]) => date)).toEqual(expected)
  })
})
