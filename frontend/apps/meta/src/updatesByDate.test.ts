import { describe, expect, it } from 'vitest'
import type { ResolvedPlatformEntry } from '@gamemap/ui'
import { groupDailyChanges, updatesByDate } from './updatesByDate'

const first: ResolvedPlatformEntry = {
  date: '2026-11-25', commit: 'first', targets: ['gmzz'],
  changes: [{ kind: 'fix', text: 'Fixed the listing.' }],
}
const entries: ResolvedPlatformEntry[] = [
  first, first, { ...first, commit: 'second', targets: ['palworld'] },
  { ...first, date: '2026-11-24' }, { ...first, date: '2026-11-23' },
]

describe('updatesByDate', () => {
  it('groups by kind and game set, numbering across scopes but restarting for each kind', () => {
    const all: ResolvedPlatformEntry = { ...first, targets: ['gmzz', 'palworld', 'ro3'] }
    const changes = updatesByDate([
      all,
      { ...first, targets: ['gmzz', 'ro3'] },
      { ...first, changes: [{ kind: 'feature', text: 'New section.' }] },
      { ...all, commit: 'other', targets: [...all.targets, 'sts2'] },
      { ...first, commit: 'reverse', targets: ['ro3', 'gmzz'] },
    ], '', '')[0][1]
    const groups = groupDailyChanges(changes, all.targets)
    expect(groups.map(group => group.kind)).toEqual(['fix', 'feature'])
    expect(groups.map(group => group.scopes.map(scope => [scope.targets, scope.start, scope.changes.length]))).toEqual([
      [[null, 1, 2], [['gmzz', 'ro3'], 3, 2]], [[['gmzz'], 1, 1]],
    ])
    expect(groupDailyChanges(changes, ['gmzz', 'palworld', 'ro3', 'new-game'])[0].scopes[0].targets).toEqual(all.targets)
  })
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
