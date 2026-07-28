/**
 * Version-history data model shared by every app. Pure data logic: no React, no
 * i18n runtime, no fetching — each app imports its own `src/changelog.json`,
 * resolves it for the active locale, and hands the result to <VersionHistory>.
 */

export type ChangeKind = "feature" | "improvement" | "fix" | "data"

export const CHANGE_KINDS: readonly ChangeKind[] = ["feature", "improvement", "fix", "data"]

/** A single change, with its user-facing text per locale. `en-US` is required. */
export interface Change {
  kind: ChangeKind
  text: Record<string, string>
}

export interface ChangelogEntry {
  /** MAJOR.MINOR.PATCH */
  version: string
  /** YYYY-MM-DD */
  date: string
  changes: Change[]
}

/** Newest entry first; `entries[0]` is the app's current version. */
export interface ChangelogFile {
  entries: ChangelogEntry[]
}

export interface ResolvedChange {
  kind: ChangeKind
  text: string
}

export interface ResolvedEntry {
  version: string
  date: string
  changes: ResolvedChange[]
}

/** Locales written by hand for every entry; the validator enforces all three. */
export const REQUIRED_LOCALES = ["en-US", "zh-CN", "zh-TW"] as const

const BASE_LOCALE = "en-US"

/**
 * Extra hops tried before falling back to English. Traditional Chinese readers
 * get the Simplified text — same language, different script — rather than
 * English, which is the closer miss.
 */
const FALLBACK_CHAIN: Record<string, readonly string[]> = { "zh-TW": ["zh-CN"] }

const SEMVER = /^\d+\.\d+\.\d+$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Pick the best available text for `locale`. Empty values count as absent. */
export function resolveText(text: Record<string, string>, locale: string): string {
  for (const key of [locale, ...(FALLBACK_CHAIN[locale] ?? []), BASE_LOCALE]) {
    const value = text[key]
    if (value) return value
  }
  return ""
}

/** -1 / 0 / 1, comparing MAJOR.MINOR.PATCH numerically (so 1.10.0 > 1.9.0). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number)
  const pb = b.split(".").map(Number)
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d > 0 ? 1 : -1
  }
  return 0
}

/** Collapse every change's locale map down to one string for `locale`. */
export function resolveChangelog(file: ChangelogFile, locale: string): ResolvedEntry[] {
  return file.entries.map((entry) => ({
    version: entry.version,
    date: entry.date,
    changes: entry.changes.map((change) => ({
      kind: change.kind,
      text: resolveText(change.text, locale),
    })),
  }))
}

/**
 * Structural + ordering checks on a raw parsed changelog.json. Returns a list of
 * human-readable problems; an empty array means the file is valid. Written as a
 * problem list rather than throwing so a test can assert `toEqual([])` and print
 * every issue at once.
 */
export function validateChangelog(raw: unknown): string[] {
  const problems: string[] = []
  if (typeof raw !== "object" || raw === null || !Array.isArray((raw as ChangelogFile).entries)) {
    return ["file: expected an object with an `entries` array"]
  }
  const entries = (raw as ChangelogFile).entries
  if (entries.length === 0) return ["entries: must not be empty"]

  entries.forEach((entry, i) => {
    const at = `entries[${i}]`
    if (typeof entry?.version !== "string" || !SEMVER.test(entry.version)) {
      problems.push(`${at}: version ${JSON.stringify(entry?.version)} is not MAJOR.MINOR.PATCH`)
      return
    }
    const label = `${at} (${entry.version})`
    if (typeof entry.date !== "string" || !ISO_DATE.test(entry.date)) {
      problems.push(`${label}: date ${JSON.stringify(entry.date)} is not YYYY-MM-DD`)
    }
    if (i > 0) {
      const prev = entries[i - 1]
      if (SEMVER.test(prev?.version ?? "") && compareVersions(entry.version, prev.version) >= 0) {
        problems.push(
          `${label}: version must be strictly lower than entries[${i - 1}] (${prev.version})`,
        )
      }
      if (ISO_DATE.test(prev?.date ?? "") && ISO_DATE.test(entry.date) && entry.date > prev.date) {
        problems.push(`${label}: date ${entry.date} is newer than entries[${i - 1}] (${prev.date})`)
      }
    }
    if (!Array.isArray(entry.changes) || entry.changes.length === 0) {
      problems.push(`${label}: changes must not be empty`)
      return
    }
    entry.changes.forEach((change, j) => {
      const cat = `${label}.changes[${j}]`
      if (!CHANGE_KINDS.includes(change?.kind)) {
        problems.push(
          `${cat}: kind ${JSON.stringify(change?.kind)} is not one of ${CHANGE_KINDS.join(", ")}`,
        )
      }
      const text = change?.text
      if (typeof text !== "object" || text === null) {
        problems.push(`${cat}: text must be an object of locale → string`)
        return
      }
      const missing = REQUIRED_LOCALES.filter((l) => !text[l])
      if (missing.length > 0) problems.push(`${cat}: text is missing ${missing.join(", ")}`)
    })
  })

  return problems
}
