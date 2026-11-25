import type { ResolvedChange, ResolvedPlatformEntry, PlatformTarget } from '@gamemap/ui'

type DailyChange = ResolvedChange & { key: string; targets: PlatformTarget[] }

type Scope = { targets: PlatformTarget[] | null; changes: DailyChange[] }

/** Within a day, retain first-seen category and scope order; number continuously within a category. */
export function groupDailyChanges(changes: DailyChange[], openGames: readonly string[]) {
  const kinds = new Map<ResolvedChange['kind'], Map<string, Scope>>()
  for (const change of changes) {
    const targets = new Set<string>(change.targets)
    const all = openGames.length > 0 && openGames.every(game => targets.has(game))
    const key = all ? 'all' : [...targets].sort().join(',')
    const scopes = kinds.get(change.kind) ?? new Map<string, Scope>()
    const scope = scopes.get(key) ?? { targets: all ? null : change.targets, changes: [] }
    scope.changes.push(change)
    scopes.set(key, scope)
    kinds.set(change.kind, scopes)
  }
  return Array.from(kinds, ([kind, scopes]) => {
    let start = 1
    return { kind, scopes: Array.from(scopes, ([key, scope]) => {
      const group = { key, start, ...scope }
      start += scope.changes.length
      return group
    }) }
  })
}

/** The platform file is validated newest first; ISO calendar dates need no timezone conversion. */
export function updatesByDate(entries: ResolvedPlatformEntry[], start: string, end: string) {
  const days = new Map<string, DailyChange[]>()
  const seen = new Set<string>()
  for (const entry of entries) {
    if ((start && entry.date < start) || (end && entry.date > end)) continue
    const changes = days.get(entry.date) ?? []
    for (const change of entry.changes) {
      const key = JSON.stringify([entry.date, entry.commit, entry.targets, change.kind, change.text])
      if (seen.has(key)) continue
      seen.add(key)
      changes.push({ ...change, key, targets: entry.targets })
    }
    days.set(entry.date, changes)
  }
  return Array.from(days)
}
