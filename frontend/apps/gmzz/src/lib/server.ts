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
 * Which day of the server this is, launch day being day 1, by the server's
 * clock rather than the visitor's: each day starts at 08:00 UTC+8, so 07:59 in
 * China still counts as the day before, wherever the visitor happens to be.
 * 08:00 UTC+8 is 00:00 UTC, so a day boundary is simply a UTC midnight.
 */
export function serverDay(now: Date = new Date()): number {
  const launch = Date.UTC(SERVER_LAUNCH.year, SERVER_LAUNCH.month - 1, SERVER_LAUNCH.day)
  return Math.floor((now.getTime() - launch) / DAY_MS) + 1
}

/** Whole days elapsed since launch — 0 on launch day — the unit the client's unlock tables count in. */
export function daysSinceLaunch(now: Date = new Date()): number {
  return Math.max(0, serverDay(now) - 1)
}
