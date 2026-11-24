import type { ResolvedChange, ResolvedPlatformEntry, PlatformTarget } from '@gamemap/ui'

type DailyChange = ResolvedChange & { key: string; targets: PlatformTarget[] }

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
