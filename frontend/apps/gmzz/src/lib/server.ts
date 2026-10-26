/**
 * The server's launch day, 2026-08-21 (CN). Everything the game unlocks on a
 * schedule — puppet level caps today, and whatever else is gated by days since
 * launch — counts from here, so it is one site-wide constant rather than a
 * date typed into each feature. Relative-import-free so the root vitest
 * config can test anything that uses it.
 */
export const SERVER_LAUNCH = { year: 2026, month: 8, day: 21 } as const

const DAY_MS = 86_400_000

/**
 * Which day of the server this is, launch day being day 1, by the visitor's
 * own calendar date. Compared as UTC midnights of the local dates, so a
 * daylight-saving shift cannot move the count by an hour into the wrong day.
 */
export function serverDay(now: Date = new Date()): number {
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  const launch = Date.UTC(SERVER_LAUNCH.year, SERVER_LAUNCH.month - 1, SERVER_LAUNCH.day)
  return Math.floor((today - launch) / DAY_MS) + 1
}

/** Whole days elapsed since launch — 0 on launch day — the unit the client's unlock tables count in. */
export function daysSinceLaunch(now: Date = new Date()): number {
  return Math.max(0, serverDay(now) - 1)
}
