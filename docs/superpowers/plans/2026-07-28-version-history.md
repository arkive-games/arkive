# Version History Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give both apps a `/changelog` page driven by a per-app `changelog.json`, backfill the eight months of shipped history, and record a `CLAUDE.md` convention so the agent bumps the version at commit time.

**Architecture:** A pure resolver + presentational component live in `@gamemap/ui` (i18n-free, fetch-free, storage-free, labels injected — same contract as the existing `BuildInfo`/`SiteFooter`). Each app owns `src/changelog.json`, imports it, resolves it for the active locale, and renders it inside that app's own page shell. Discoverability is a footer version link plus a version row in the top-bar build hovercard.

**Tech Stack:** React 19, TypeScript (strict, `verbatimModuleSyntax`, `erasableSyntaxOnly`), Vitest (+ jsdom pragma), `@testing-library/react`, Playwright, TanStack Router, Tailwind 4, pnpm workspace.

**Spec:** `docs/superpowers/specs/2026-07-28-version-history-design.md`

---

## File Structure

**`frontend/packages/ui/` (the shared unit — knows nothing about routers, locales or fetching)**
- Create `src/changelog.ts` — types, `resolveText`, `resolveChangelog`, `compareVersions`, `validateChangelog`. Pure; no React import.
- Create `src/changelog.test.ts` — resolver + validator tests (node env, no pragma needed).
- Create `src/version-history.tsx` — `<VersionHistory>` presentational component.
- Create `src/version-history.test.tsx` — render tests (jsdom pragma).
- Create `src/version-slots.test.tsx` — footer/hovercard slot tests (jsdom pragma).
- Modify `src/index.ts` — re-export both modules.
- Modify `src/site-footer.tsx` — optional `versionLink` slot.
- Modify `src/build-info.tsx` — optional `siteVersion` slot + label.
- Modify `package.json` — add `@testing-library/react` devDependency.

**`frontend/apps/palworld/`**
- Create `src/changelog.json` — 20 backfilled entries (1.7.1 → 0.1.0).
- Create `src/changelog.test.ts` — validates the file.
- Create `src/lib/siteVersion.ts` — parses the JSON once, exports `SITE_VERSION`.
- Create `src/changelogStrings.ts` — page + badge labels, 17 locales.
- Create `src/features/changelog/ChangelogPage.tsx` — wires data → resolver → component.
- Create `e2e/changelog.spec.ts`.
- Modify `src/i18n.ts`, `src/main.tsx`, `src/components/TopNav.tsx`, `src/components/ContentPage.tsx`, `tsconfig.app.json`.

**`frontend/apps/aion2/`**
- Create `src/changelog.json` — 17 backfilled entries (1.5.0 → 0.1.0).
- Create `src/changelog.test.ts` — validates the file.
- Create `src/lib/siteVersion.ts` — parses the JSON once, exports `SITE_VERSION`.
- Create `src/components/ContentLayout.tsx` — page chrome extracted from `routes/wiki/route.tsx`.
- Create `src/routes/changelog.tsx`.
- Create `e2e/changelog.spec.ts`.
- Modify `src/routes/wiki/route.tsx`, `src/components/TopNavbar.tsx`, `src/routeTree.gen.ts` (generated), `public/locales/*/common.yaml` (4 files), `tsconfig.app.json`.

**Workspace**
- Create `frontend/scripts/changelog-add.mjs`.
- Modify `frontend/package.json` (script), `frontend/edgeone.json` (rewrite), `CLAUDE.md` (convention).

**Why this split:** `changelog.ts` is data logic with zero React, so it tests in the node environment and is reusable by the validation tests in both apps. `version-history.tsx` is rendering only. Keeping them in separate files means the validator can be imported by an app test without pulling React into a node-env test.

---

## Task 1: Changelog types, resolver and validator

**Files:**
- Create: `frontend/packages/ui/src/changelog.ts`
- Test: `frontend/packages/ui/src/changelog.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/packages/ui/src/changelog.test.ts`:

```ts
import { describe, expect, it } from "vitest"

import {
  compareVersions,
  resolveChangelog,
  resolveText,
  validateChangelog,
  type ChangelogFile,
} from "./changelog"

const TEXT = { "en-US": "English", "zh-CN": "简体", "zh-TW": "繁體" }

describe("resolveText", () => {
  it("returns the exact locale when present", () => {
    expect(resolveText(TEXT, "zh-CN")).toBe("简体")
  })

  it("falls back from zh-TW to zh-CN before English", () => {
    expect(resolveText({ "en-US": "English", "zh-CN": "简体" }, "zh-TW")).toBe("简体")
  })

  it("prefers an explicit zh-TW over the zh-CN fallback", () => {
    expect(resolveText(TEXT, "zh-TW")).toBe("繁體")
  })

  it("falls back to en-US for an unlisted locale", () => {
    expect(resolveText(TEXT, "ja-JP")).toBe("English")
  })

  it("returns an empty string when nothing matches", () => {
    expect(resolveText({}, "ja-JP")).toBe("")
  })

  it("treats an empty value as absent", () => {
    expect(resolveText({ "en-US": "English", "ja-JP": "" }, "ja-JP")).toBe("English")
  })
})

describe("compareVersions", () => {
  it("orders by major, then minor, then patch", () => {
    expect(compareVersions("1.2.3", "1.2.3")).toBe(0)
    expect(compareVersions("1.10.0", "1.9.0")).toBe(1)
    expect(compareVersions("0.9.0", "1.0.0")).toBe(-1)
    expect(compareVersions("1.0.1", "1.0.0")).toBe(1)
  })
})

describe("resolveChangelog", () => {
  it("resolves every change for the given locale, preserving order", () => {
    const file: ChangelogFile = {
      entries: [
        { version: "1.1.0", date: "2026-07-02", changes: [{ kind: "feature", text: TEXT }] },
        { version: "1.0.0", date: "2026-07-01", changes: [{ kind: "fix", text: TEXT }] },
      ],
    }
    expect(resolveChangelog(file, "zh-CN")).toEqual([
      { version: "1.1.0", date: "2026-07-02", changes: [{ kind: "feature", text: "简体" }] },
      { version: "1.0.0", date: "2026-07-01", changes: [{ kind: "fix", text: "简体" }] },
    ])
  })
})

describe("validateChangelog", () => {
  const valid: ChangelogFile = {
    entries: [
      { version: "1.1.0", date: "2026-07-02", changes: [{ kind: "feature", text: TEXT }] },
      { version: "1.0.0", date: "2026-07-01", changes: [{ kind: "fix", text: TEXT }] },
    ],
  }

  it("reports no problems for a well-formed file", () => {
    expect(validateChangelog(valid)).toEqual([])
  })

  it("rejects a non-object", () => {
    expect(validateChangelog(null)).toEqual(["file: expected an object with an `entries` array"])
  })

  it("rejects an empty entries array", () => {
    expect(validateChangelog({ entries: [] })).toEqual(["entries: must not be empty"])
  })

  it("rejects a malformed version", () => {
    const bad = { entries: [{ version: "1.0", date: "2026-07-01", changes: valid.entries[1].changes }] }
    expect(validateChangelog(bad)).toContain("entries[0]: version \"1.0\" is not MAJOR.MINOR.PATCH")
  })

  it("rejects a malformed date", () => {
    const bad = { entries: [{ version: "1.0.0", date: "07/01/2026", changes: valid.entries[1].changes }] }
    expect(validateChangelog(bad)).toContain("entries[0] (1.0.0): date \"07/01/2026\" is not YYYY-MM-DD")
  })

  it("rejects versions that are not strictly descending", () => {
    const bad = {
      entries: [
        { version: "1.0.0", date: "2026-07-02", changes: valid.entries[0].changes },
        { version: "1.0.0", date: "2026-07-01", changes: valid.entries[1].changes },
      ],
    }
    expect(validateChangelog(bad)).toContain(
      "entries[1] (1.0.0): version must be strictly lower than entries[0] (1.0.0)",
    )
  })

  it("rejects dates that increase as versions descend", () => {
    const bad = {
      entries: [
        { version: "1.1.0", date: "2026-07-01", changes: valid.entries[0].changes },
        { version: "1.0.0", date: "2026-07-02", changes: valid.entries[1].changes },
      ],
    }
    expect(validateChangelog(bad)).toContain(
      "entries[1] (1.0.0): date 2026-07-02 is newer than entries[0] (2026-07-01)",
    )
  })

  it("rejects an entry with no changes", () => {
    const bad = { entries: [{ version: "1.0.0", date: "2026-07-01", changes: [] }] }
    expect(validateChangelog(bad)).toContain("entries[0] (1.0.0): changes must not be empty")
  })

  it("rejects an unknown kind", () => {
    const bad = {
      entries: [{ version: "1.0.0", date: "2026-07-01", changes: [{ kind: "chore", text: TEXT }] }],
    }
    expect(validateChangelog(bad)).toContain(
      "entries[0] (1.0.0).changes[0]: kind \"chore\" is not one of feature, improvement, fix, data",
    )
  })

  it("rejects a missing required locale", () => {
    const bad = {
      entries: [
        { version: "1.0.0", date: "2026-07-01", changes: [{ kind: "fix", text: { "en-US": "x" } }] },
      ],
    }
    expect(validateChangelog(bad)).toContain(
      "entries[0] (1.0.0).changes[0]: text is missing zh-CN, zh-TW",
    )
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `E:/arkive-games/arkive/frontend`: `pnpm vitest run packages/ui/src/changelog.test.ts`

Expected: FAIL — `Failed to resolve import "./changelog"`.

- [ ] **Step 3: Write the implementation**

Create `frontend/packages/ui/src/changelog.ts`:

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run packages/ui/src/changelog.test.ts`

Expected: PASS, 19 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/packages/ui/src/changelog.ts frontend/packages/ui/src/changelog.test.ts
git commit -m "feat(ui): changelog data model, locale resolver and validator"
```

---

## Task 2: VersionHistory component

**Files:**
- Create: `frontend/packages/ui/src/version-history.tsx`
- Test: `frontend/packages/ui/src/version-history.test.tsx`
- Modify: `frontend/packages/ui/package.json`

- [ ] **Step 1: Add the test dependency**

`@testing-library/react` is currently only a devDependency of `map-shell`. Add it to `frontend/packages/ui/package.json` `devDependencies`, keeping the block alphabetical:

```json
  "devDependencies": {
    "@testing-library/react": "^16.3.0",
    "@types/react": "^19.2.2",
    "@types/react-dom": "^19.2.2",
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "typescript": "~5.9.3"
  }
```

Then run from `E:/arkive-games/arkive/frontend`: `pnpm install`

Expected: install completes; `packages/ui/node_modules/@testing-library/react` exists.

- [ ] **Step 2: Write the failing test**

Create `frontend/packages/ui/src/version-history.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { VersionHistory } from "./version-history"
import type { ResolvedEntry } from "./changelog"

afterEach(cleanup)

const ENTRIES: ResolvedEntry[] = [
  {
    version: "1.1.0",
    date: "2026-07-02",
    changes: [
      { kind: "feature", text: "Added a wiki" },
      { kind: "fix", text: "Fixed the sidebar" },
    ],
  },
  { version: "1.0.0", date: "2026-07-01", changes: [{ kind: "improvement", text: "Rebuilt" }] },
]

describe("VersionHistory", () => {
  it("renders one section per version, newest first", () => {
    render(<VersionHistory entries={ENTRIES} />)
    const sections = screen.getAllByTestId("changelog-entry")
    expect(sections).toHaveLength(2)
    expect(sections[0]).toHaveAttribute("data-version", "1.1.0")
    expect(sections[1]).toHaveAttribute("data-version", "1.0.0")
  })

  it("shows the version number and date", () => {
    render(<VersionHistory entries={ENTRIES} />)
    expect(screen.getByText("v1.1.0")).toBeTruthy()
    expect(screen.getByText("2026-07-02")).toBeTruthy()
  })

  it("marks only the newest entry as current", () => {
    render(<VersionHistory entries={ENTRIES} labels={{ current: "Current" }} />)
    expect(screen.getAllByText("Current")).toHaveLength(1)
    expect(screen.getAllByTestId("changelog-entry")[0].textContent).toContain("Current")
  })

  it("omits the current badge when no label is injected", () => {
    render(<VersionHistory entries={ENTRIES} />)
    expect(screen.queryByTestId("changelog-current")).toBeNull()
  })

  it("renders every change with its injected kind label", () => {
    render(
      <VersionHistory
        entries={ENTRIES}
        labels={{ kinds: { feature: "New", fix: "Fixed", improvement: "Improved" } }}
      />,
    )
    expect(screen.getByText("Added a wiki")).toBeTruthy()
    expect(screen.getByText("Fixed the sidebar")).toBeTruthy()
    expect(screen.getByText("New")).toBeTruthy()
    expect(screen.getByText("Fixed")).toBeTruthy()
    expect(screen.getByText("Improved")).toBeTruthy()
  })

  it("falls back to the raw kind when no label is injected", () => {
    render(<VersionHistory entries={ENTRIES} />)
    expect(screen.getByText("feature")).toBeTruthy()
  })

  it("renders the empty state for no entries", () => {
    render(<VersionHistory entries={[]} labels={{ empty: "Nothing yet" }} />)
    expect(screen.getByText("Nothing yet")).toBeTruthy()
    expect(screen.queryAllByTestId("changelog-entry")).toHaveLength(0)
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm vitest run packages/ui/src/version-history.test.tsx`

Expected: FAIL — `Failed to resolve import "./version-history"`.

- [ ] **Step 4: Write the implementation**

Create `frontend/packages/ui/src/version-history.tsx`:

```tsx
import type { ChangeKind, ResolvedEntry } from "./changelog"
import { cn } from "./utils"

export interface VersionHistoryLabels {
  /** Badge on the newest entry. Omitted → no badge. */
  current?: string
  /** Per-kind badge text. A kind with no label falls back to the raw key. */
  kinds?: Partial<Record<ChangeKind, string>>
  /** Shown instead of the list when `entries` is empty. */
  empty?: string
}

export interface VersionHistoryProps {
  /** Locale-resolved entries, newest first (see `resolveChangelog`). */
  entries: ResolvedEntry[]
  /** Injectable labels so the package stays i18n-free. */
  labels?: VersionHistoryLabels
  className?: string
}

/** Badge tint per change kind. Neutral-to-warm so `feature` reads as the headline. */
const KIND_CLASS: Record<ChangeKind, string> = {
  feature: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  improvement: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  fix: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  data: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
}

/**
 * Version-history list shared by every app: one section per released version,
 * newest first, each change tagged with a coloured kind badge.
 *
 * Presentational only — it takes already-resolved text and injected labels, so
 * the package needs no i18n runtime and no router.
 */
function VersionHistory({ entries, labels, className }: VersionHistoryProps) {
  if (entries.length === 0) {
    return (
      <p data-testid="changelog-empty" className={cn("text-sm text-muted-foreground", className)}>
        {labels?.empty ?? ""}
      </p>
    )
  }

  return (
    <ol className={cn("space-y-8", className)}>
      {entries.map((entry, i) => (
        <li
          key={entry.version}
          data-testid="changelog-entry"
          data-version={entry.version}
          className="relative border-l border-border pl-5"
        >
          <span
            aria-hidden
            className={cn(
              "absolute -left-[5px] top-1.5 size-2.5 rounded-full",
              i === 0 ? "bg-primary" : "bg-border",
            )}
          />
          <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2 className="font-mono text-lg font-semibold">v{entry.version}</h2>
            <time dateTime={entry.date} className="text-sm text-muted-foreground">
              {entry.date}
            </time>
            {i === 0 && labels?.current ? (
              <span
                data-testid="changelog-current"
                className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary"
              >
                {labels.current}
              </span>
            ) : null}
          </div>
          <ul className="space-y-2">
            {entry.changes.map((change, j) => (
              <li key={j} className="flex flex-wrap items-baseline gap-2 text-sm">
                <span
                  className={cn(
                    "shrink-0 rounded px-1.5 py-0.5 text-xs font-medium",
                    KIND_CLASS[change.kind],
                  )}
                >
                  {labels?.kinds?.[change.kind] ?? change.kind}
                </span>
                <span className="min-w-0 flex-1">{change.text}</span>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  )
}

export { VersionHistory }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm vitest run packages/ui/src/version-history.test.tsx`

Expected: PASS, 7 tests.

- [ ] **Step 6: Export from the package index**

Modify `frontend/packages/ui/src/index.ts` — insert two lines keeping the list alphabetical (`./changelog` after `./card`, `./version-history` after `./tooltip`):

```ts
export * from "./card"
export * from "./changelog"
```

```ts
export * from "./tooltip"
export * from "./use-is-mobile"
export * from "./version-history"
```

- [ ] **Step 7: Type-check the package**

Run: `pnpm --filter @gamemap/ui check`

Expected: no output (clean `tsc --noEmit`).

- [ ] **Step 8: Commit**

```bash
git add frontend/packages/ui/src/version-history.tsx frontend/packages/ui/src/version-history.test.tsx frontend/packages/ui/src/index.ts frontend/packages/ui/package.json frontend/pnpm-lock.yaml
git commit -m "feat(ui): VersionHistory component"
```

---

## Task 3: Version slots in SiteFooter and BuildInfo

Both take a `ReactNode` slot rather than an `href` string: each app routes with
TanStack `<Link>`, and a plain `<a href>` would force a full page reload. A slot
keeps the router out of the package and still gives client-side navigation.

**Files:**
- Modify: `frontend/packages/ui/src/site-footer.tsx`
- Modify: `frontend/packages/ui/src/build-info.tsx`
- Test: `frontend/packages/ui/src/version-slots.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/packages/ui/src/version-slots.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { BuildInfo } from "./build-info"
import { SiteFooter } from "./site-footer"

afterEach(cleanup)

describe("SiteFooter versionLink", () => {
  it("renders the slot when provided", () => {
    render(<SiteFooter versionLink={<a href="/changelog">v1.8.0</a>} />)
    expect(screen.getByText("v1.8.0")).toBeTruthy()
  })

  it("renders nothing extra when omitted", () => {
    render(<SiteFooter />)
    expect(screen.queryByTestId("site-footer-version")).toBeNull()
  })
})

describe("BuildInfo siteVersion", () => {
  it("renders the site-version row with its injected label", () => {
    render(
      <BuildInfo
        commit="0123456789abcdef"
        buildTime="1750000000000"
        siteVersion={<a href="/changelog">v1.8.0</a>}
        labels={{ siteVersion: "Site" }}
      />,
    )
    expect(screen.getByText("Site")).toBeTruthy()
    expect(screen.getByText("v1.8.0")).toBeTruthy()
  })

  it("omits the row when no siteVersion is passed", () => {
    render(<BuildInfo commit="0123456789abcdef" buildTime="1750000000000" />)
    expect(screen.queryByText("Version")).toBeNull()
  })
})
```

Note: `BuildInfo`'s rows live inside a `HoverCardContent`, which Radix only
mounts once open. Render the trigger content unconditionally is NOT an option, so
in Step 3 the site-version row is added to the hovercard **and** the test above
opens it — Radix `HoverCard` does not open on a synthetic hover in jsdom. To keep
the test honest without simulating pointer events, `BuildInfo` gains
`defaultOpen` passthrough. Add it in Step 3 and use it in the test by changing
both `BuildInfo` renders above to include `defaultOpen`:

```tsx
      <BuildInfo
        commit="0123456789abcdef"
        buildTime="1750000000000"
        defaultOpen
        siteVersion={<a href="/changelog">v1.8.0</a>}
        labels={{ siteVersion: "Site" }}
      />
```

```tsx
    render(<BuildInfo commit="0123456789abcdef" buildTime="1750000000000" defaultOpen />)
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `E:/arkive-games/arkive/frontend`: `pnpm vitest run packages/ui/src/version-slots.test.tsx`

Expected: FAIL — `versionLink`/`siteVersion`/`defaultOpen` are not valid props (TS
is not enforced at runtime here, so the failure is the missing rendered text
`v1.8.0`).

- [ ] **Step 3a: Add the SiteFooter slot**

In `frontend/packages/ui/src/site-footer.tsx`, extend the props interface:

```tsx
export interface SiteFooterProps extends React.ComponentProps<"footer"> {
  /** Main-site link for the brand name. Wire to VITE_HOME_URL in each app. */
  homeUrl?: string
  /** GitHub organization link. Wire to VITE_GITHUB_URL in each app. */
  githubUrl?: string
  /** ICP filing record (China). Wire to VITE_ICP_BEIAN in each app. */
  icpBeian?: string
  /**
   * Site version link, e.g. `<Link to="/changelog">v1.8.0</Link>`. A slot rather
   * than an href so each app supplies its own router link (client-side nav).
   */
  versionLink?: React.ReactNode
}
```

Add `versionLink` to the destructured parameters:

```tsx
function SiteFooter({
  homeUrl = "https://tc-imba.com",
  githubUrl = "https://github.com/arkive-games",
  icpBeian = "沪ICP备2025152827号-1",
  versionLink,
  className,
  ...props
}: SiteFooterProps) {
```

And render it right after the `© 2025-2026` span:

```tsx
        <span>© 2025-2026</span>
        {versionLink ? (
          <span data-testid="site-footer-version" className="underline-offset-4 hover:text-foreground [&_a:hover]:underline">
            {versionLink}
          </span>
        ) : null}
```

- [ ] **Step 3b: Add the BuildInfo row**

In `frontend/packages/ui/src/build-info.tsx`, extend the props interface — add
`siteVersion`, `defaultOpen`, and a `siteVersion` label:

```tsx
  /** Game version the site's data was built from (from the data artifact's `version.json` or `VITE_GAME_VERSION`). Row is hidden when unset. */
  gameVersion?: string
  /**
   * Site version link, e.g. `<Link to="/changelog">v1.8.0</Link>`. Row is hidden
   * when unset. A slot, not an href, so the app supplies its own router link.
   */
  siteVersion?: React.ReactNode
  /** Force the hovercard open. Test-only escape hatch; Radix hover does not fire in jsdom. */
  defaultOpen?: boolean
  /** Repository link opened by the icon. Defaults to the monorepo. */
  repoUrl?: string
  /** Injectable labels so apps can localize; the package stays i18n-free. */
  labels?: {
    commit?: string
    buildTime?: string
    gameVersion?: string
    siteVersion?: string
    /** Accessible name for the icon link. */
    repo?: string
  }
```

Add `import * as React from "react"` as the first import (the file currently has
no React import but now needs `React.ReactNode`).

Add the two new parameters to the destructuring:

```tsx
function BuildInfo({
  commit,
  buildTime,
  dev = false,
  gameVersion,
  siteVersion,
  defaultOpen,
  repoUrl = "https://github.com/arkive-games/arkive",
  labels,
  className,
}: BuildInfoProps) {
```

Pass `defaultOpen` through:

```tsx
    <HoverCard openDelay={100} defaultOpen={defaultOpen}>
```

And add the site-version row as the **first** row in the `<dl>`, above `commit`
— it is the most user-relevant line:

```tsx
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          {siteVersion && (
            <>
              <dt className="text-muted-foreground">{labels?.siteVersion ?? "Version"}</dt>
              <dd className="font-mono">{siteVersion}</dd>
            </>
          )}
          <dt className="text-muted-foreground">{labels?.commit ?? "Commit"}</dt>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run packages/ui/src/version-slots.test.tsx`

Expected: PASS, 4 tests.

- [ ] **Step 5: Type-check and run the whole package suite**

Run: `pnpm --filter @gamemap/ui check && pnpm vitest run packages/ui`

Expected: no tsc output; 30 tests pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/packages/ui/src/site-footer.tsx frontend/packages/ui/src/build-info.tsx frontend/packages/ui/src/version-slots.test.tsx
git commit -m "feat(ui): site-version slots in SiteFooter and BuildInfo"
```

---

## Task 4: palworld changelog backfill

Version arcs derived from the app's git history (born 2026-07-02, under
`apps/palworld` then `frontend/apps/palworld` after the 2026-07-06 restructure).
Each version is a cluster of commits that shipped one capability a visitor would
notice; the date is the last commit in the cluster. `1.0.0` is the day dungeons
and the multi-generation planner landed together — the point the site stopped
being a map with extras.

The authored data is in this plan's appendix directory, so it is copied rather
than retyped: `docs/superpowers/plans/2026-07-28-version-history/palworld-changelog.json`
(20 entries, 1.7.1 down to 0.1.0, all three locales on every change).

**Files:**
- Create: `frontend/apps/palworld/src/changelog.json`
- Test: `frontend/apps/palworld/src/changelog.test.ts`
- Modify: `frontend/apps/palworld/tsconfig.app.json`

- [ ] **Step 1: Enable JSON imports**

In `frontend/apps/palworld/tsconfig.app.json`, add `"resolveJsonModule": true`
directly below `"moduleResolution": "bundler",`:

```json
    /* Bundler mode */
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "allowImportingTsExtensions": true,
```

- [ ] **Step 2: Write the failing test**

Create `frontend/apps/palworld/src/changelog.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { compareVersions, validateChangelog, type ChangelogFile } from '@gamemap/ui'

import raw from './changelog.json'

const file = raw as ChangelogFile

describe('palworld changelog.json', () => {
  it('is structurally valid', () => {
    expect(validateChangelog(file)).toEqual([])
  })

  // Asserted as a floor, not an equality: every future release bumps this, and a
  // pinned literal would turn each bump into a test edit.
  it('is at or beyond the backfilled state', () => {
    expect(compareVersions(file.entries[0].version, '1.7.1')).toBeGreaterThanOrEqual(0)
    expect(file.entries.length).toBeGreaterThanOrEqual(20)
  })

  it('covers the whole history back to launch', () => {
    expect(file.entries.at(-1)).toMatchObject({ version: '0.1.0', date: '2026-07-03' })
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run from `E:/arkive-games/arkive/frontend`: `pnpm vitest run apps/palworld/src/changelog.test.ts`

Expected: FAIL — `Failed to resolve import "./changelog.json"`.

- [ ] **Step 4: Copy the authored data into place**

Run from `E:/arkive-games/arkive`:

```bash
cp docs/superpowers/plans/2026-07-28-version-history/palworld-changelog.json frontend/apps/palworld/src/changelog.json
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm vitest run apps/palworld/src/changelog.test.ts`

Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add frontend/apps/palworld/src/changelog.json frontend/apps/palworld/src/changelog.test.ts frontend/apps/palworld/tsconfig.app.json
git commit -m "feat(palworld): backfill version history from git log"
```

---

## Task 5: aion2 changelog backfill

aion2 is the original project (2025-11-16), so its history spans three layouts:
root-level `src/` until 2026-07-02, then `apps/aion2`, then
`frontend/apps/aion2`. The pre-2026-07-02 era predates the `type(scope):`
convention, so those arcs come from the whole-repo log with `backend`, `tools` and
`ci` scopes excluded, not from a path filter.

`1.0.0` is the Phase-2 rebuild — a genuine site-level reinvention, which is
exactly what MAJOR means here. The legacy 0.x features (character profiles,
crafting, leaderboards, artifacts, accounts) really did ship, so they stay in the
history; `1.0.0` carries a second entry recording that they now live on the
archived old version, which is what the top bar's archive notice tells users.

Authored data: `docs/superpowers/plans/2026-07-28-version-history/aion2-changelog.json`
(17 entries, 1.5.0 down to 0.1.0).

**Files:**
- Create: `frontend/apps/aion2/src/changelog.json`
- Test: `frontend/apps/aion2/src/changelog.test.ts`
- Modify: `frontend/apps/aion2/tsconfig.app.json`

- [ ] **Step 1: Enable JSON imports**

In `frontend/apps/aion2/tsconfig.app.json`, add `"resolveJsonModule": true`
directly below `"moduleResolution": "bundler",`:

```json
    /* Bundler mode */
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "allowImportingTsExtensions": true,
```

- [ ] **Step 2: Write the failing test**

Create `frontend/apps/aion2/src/changelog.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { compareVersions, validateChangelog, type ChangelogFile } from "@gamemap/ui";

import raw from "./changelog.json";

const file = raw as ChangelogFile;

describe("aion2 changelog.json", () => {
  it("is structurally valid", () => {
    expect(validateChangelog(file)).toEqual([]);
  });

  // A floor, not an equality — future releases bump this and should not need a
  // test edit.
  it("is at or beyond the backfilled state", () => {
    expect(compareVersions(file.entries[0].version, "1.5.0")).toBeGreaterThanOrEqual(0);
    expect(file.entries.length).toBeGreaterThanOrEqual(17);
  });

  it("records the phase-2 rebuild as the 1.0.0 major", () => {
    const major = file.entries.find((e) => e.version === "1.0.0");
    expect(major?.date).toBe("2026-07-01");
  });

  it("covers the whole history back to the first release", () => {
    expect(file.entries.at(-1)).toMatchObject({ version: "0.1.0", date: "2025-11-17" });
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run from `E:/arkive-games/arkive/frontend`: `pnpm vitest run apps/aion2/src/changelog.test.ts`

Expected: FAIL — `Failed to resolve import "./changelog.json"`.

- [ ] **Step 4: Copy the authored data into place**

Run from `E:/arkive-games/arkive`:

```bash
cp docs/superpowers/plans/2026-07-28-version-history/aion2-changelog.json frontend/apps/aion2/src/changelog.json
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm vitest run apps/aion2/src/changelog.test.ts`

Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add frontend/apps/aion2/src/changelog.json frontend/apps/aion2/src/changelog.test.ts frontend/apps/aion2/tsconfig.app.json
git commit -m "feat(aion2): backfill version history from git log"
```

---

## Task 6: palworld /changelog page

**Files:**
- Create: `frontend/apps/palworld/src/changelogStrings.ts` (copy from the appendix)
- Create: `frontend/apps/palworld/src/features/changelog/ChangelogPage.tsx`
- Modify: `frontend/apps/palworld/src/i18n.ts`
- Modify: `frontend/apps/palworld/src/main.tsx`
- Modify: `frontend/apps/palworld/src/components/TopNav.tsx`
- Modify: `frontend/apps/palworld/src/components/ContentPage.tsx`
- Modify: `frontend/edgeone.json`

- [ ] **Step 1: Copy the locale labels into place**

Run from `E:/arkive-games/arkive`:

```bash
cp docs/superpowers/plans/2026-07-28-version-history/palworld-changelogStrings.ts frontend/apps/palworld/src/changelogStrings.ts
```

- [ ] **Step 2: Merge the labels into i18n**

In `frontend/apps/palworld/src/i18n.ts`, add the import alongside the other
`*Strings` imports (keep them grouped, after `./catalogStrings`):

```ts
import { CHANGELOG_STRINGS } from './changelogStrings'
```

Then in the per-locale merge block, add a `changelog` key next to `research`
(around the `research: RESEARCH_STRINGS[lng] ?? RESEARCH_STRINGS['en-US'],` line):

```ts
      research: RESEARCH_STRINGS[lng] ?? RESEARCH_STRINGS['en-US'],
      changelog: CHANGELOG_STRINGS[lng] ?? CHANGELOG_STRINGS['en-US'],
```

- [ ] **Step 3a: Add the site-version module**

Create `frontend/apps/palworld/src/lib/siteVersion.ts`. A standalone module (same
shape as aion2's) so the page, the footer and the top bar all read the version
without importing each other — importing `SITE_VERSION` from the page component
would create a `ContentPage → ChangelogPage → ContentPage` cycle:

```ts
import { type ChangelogFile } from '@gamemap/ui'

import raw from '../changelog.json'

export const changelog = raw as ChangelogFile

/** Current site version — the newest changelog entry. */
export const SITE_VERSION = changelog.entries[0].version
```

- [ ] **Step 3b: Write the page**

Create `frontend/apps/palworld/src/features/changelog/ChangelogPage.tsx`:

```tsx
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { VersionHistory, resolveChangelog } from '@gamemap/ui'

import { ContentPage } from '../../components/ContentPage'
import { changelog } from '../../lib/siteVersion'

export default function ChangelogPage() {
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'
  const entries = useMemo(() => resolveChangelog(changelog, lng), [lng])

  return (
    <ContentPage active="/changelog" title={t('changelog.title')} heading>
      <VersionHistory
        entries={entries}
        labels={{
          current: t('changelog.current'),
          empty: t('changelog.empty'),
          kinds: {
            feature: t('changelog.kind.feature'),
            improvement: t('changelog.kind.improvement'),
            fix: t('changelog.kind.fix'),
            data: t('changelog.kind.data'),
          },
        }}
      />
    </ContentPage>
  )
}
```

- [ ] **Step 4: Register the route**

In `frontend/apps/palworld/src/main.tsx`, add the import after the other feature
page imports (after `PartnerSkillsPage`):

```ts
import ChangelogPage from './features/changelog/ChangelogPage'
```

Add the route definition after `regionDetailRoute`:

```ts
// Site version history. Not a nav item — reached from the footer version link
// and the top-bar build hovercard.
const changelogRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/changelog',
  component: ChangelogPage,
})
```

And add `changelogRoute,` to the end of the `rootRoute.addChildren([...])` array,
after `regionDetailRoute,`.

- [ ] **Step 5: Widen NavKey and wire the top bar**

In `frontend/apps/palworld/src/components/TopNav.tsx`, add `'/changelog'` to the
`NavKey` union (at the end):

```ts
export type NavKey = '/' | '/pals' | '/breeding' | '/passives' | '/active-skills' | '/partner-skills' | '/stat-simulator' | '/items' | '/buildings' | '/merchants' | '/technology' | '/dungeons' | '/quests' | '/basecamp' | '/research' | '/raids' | '/fishing' | '/changelog'
```

Add the site-version import at the top:

```ts
import { SITE_VERSION } from '../lib/siteVersion'
```

And pass the version row into `BuildInfo`:

```tsx
          <BuildInfo
            commit={__BUILD_GIT_COMMIT__}
            buildTime={__BUILD_TIME__}
            dev={import.meta.env.DEV}
            gameVersion={getGameVersion()}
            siteVersion={<Link to="/changelog">v{SITE_VERSION}</Link>}
            labels={{ siteVersion: t('changelog.title') }}
          />
```

`Link` is already imported in this file.

- [ ] **Step 6: Add the footer version link**

In `frontend/apps/palworld/src/components/ContentPage.tsx`, add the imports:

```tsx
import { Link } from '@tanstack/react-router'
import { SITE_VERSION } from '../lib/siteVersion'
```

And pass `versionLink` to the `SiteFooter`:

```tsx
          <SiteFooter
            className="pb-[calc(env(safe-area-inset-bottom)+4rem)] md:pb-4"
            homeUrl={import.meta.env.VITE_HOME_URL}
            githubUrl={import.meta.env.VITE_GITHUB_URL}
            icpBeian={import.meta.env.VITE_ICP_BEIAN}
            versionLink={<Link to="/changelog">v{SITE_VERSION}</Link>}
          />
```

Both this file and `TopNav.tsx` read `SITE_VERSION` from `src/lib/siteVersion.ts`
(Step 3a), not from the page component — that is what keeps `ContentPage` and
`ChangelogPage` free of a circular import.

- [ ] **Step 7: Add the SPA rewrite**

In `frontend/edgeone.json`, add two entries before the `/wiki` block (this file
serves both sites, so one pair covers palworld and aion2):

```json
    { "source": "/changelog", "destination": "/index.html" },
    { "source": "/changelog*", "destination": "/index.html" },
```

- [ ] **Step 8: Type-check and build**

Run from `E:/arkive-games/arkive/frontend`: `pnpm build:palworld`

Expected: `tsc -b` clean, vite build succeeds.

- [ ] **Step 9: Commit**

```bash
git add frontend/apps/palworld/src/changelogStrings.ts frontend/apps/palworld/src/features/changelog frontend/apps/palworld/src/i18n.ts frontend/apps/palworld/src/main.tsx frontend/apps/palworld/src/components/TopNav.tsx frontend/apps/palworld/src/components/ContentPage.tsx frontend/edgeone.json
git commit -m "feat(palworld): version history page at /changelog"
```

---

## Task 7: aion2 /changelog page — extract the shared layout

The page chrome (top bar / mobile header / max-width scroll column / footer)
currently exists only inline inside `routes/wiki/route.tsx`. Extract it first so
the new route reuses it instead of duplicating the shell.

**Files:**
- Create: `frontend/apps/aion2/src/lib/siteVersion.ts`
- Create: `frontend/apps/aion2/src/components/ContentLayout.tsx`
- Modify: `frontend/apps/aion2/src/routes/wiki/route.tsx`

- [ ] **Step 1: Add the site-version module**

Create `frontend/apps/aion2/src/lib/siteVersion.ts` — a standalone module so the
layout, the top bar and the page all read the version without importing each
other:

```ts
import { type ChangelogFile } from "@gamemap/ui";

import raw from "../changelog.json";

export const changelog = raw as ChangelogFile;

/** Current site version — the newest changelog entry. */
export const SITE_VERSION = changelog.entries[0].version;
```

- [ ] **Step 2: Extract the layout**

Create `frontend/apps/aion2/src/components/ContentLayout.tsx` — the body of the
existing `WikiLayout`, with `children` in place of `<Outlet />` and the footer
version link added:

```tsx
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { SiteFooter, useIsMobile } from "@gamemap/ui";

import TopNavbar from "@/components/TopNavbar";
import GlobalSearchWidget from "@/components/GlobalSearchWidget";
import { SITE_VERSION } from "@/lib/siteVersion";

/**
 * Shared chrome for every non-map page (wiki + changelog): desktop top bar or a
 * compact mobile utility bar, a max-width scroll column, and the site footer.
 *
 * Exactly ONE of the two bars is mounted, rather than CSS-hiding one: both
 * contain a GlobalSearchWidget, and two of those in the DOM means two elements
 * share `data-testid="global-search-button"` — which breaks strict locators in
 * this app's existing e2e specs.
 */
export default function ContentLayout({ children }: { children: ReactNode }) {
  const isMobile = useIsMobile();

  return (
    <div className="flex h-dvh w-screen flex-col overflow-hidden bg-background text-foreground">
      {isMobile ? (
        /* Compact utility bar. Deliberately NOT a page title: every wiki page
           already renders its own <h1>, so a title here would duplicate it and
           would have to be threaded through the router. */
        <header
          data-testid="wiki-mobile-header"
          className="flex min-h-12 shrink-0 items-center justify-between border-b border-border bg-topnavbar px-4"
          /* viewport-fit=cover lets content sit under a notch / status bar in
             standalone mode, so pad the top by the inset (0 in a normal
             browser, where the chrome already occupies that space). */
          style={{ paddingTop: "env(safe-area-inset-top)" }}
        >
          <Link
            to="/"
            className="text-lg font-bold tracking-tight text-[#2E97FF] select-none"
          >
            AION2
          </Link>
          <GlobalSearchWidget />
        </header>
      ) : (
        <TopNavbar />
      )}
      <main className="flex-1 overflow-y-auto">
        <div className="flex min-h-full flex-col">
          <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</div>
          {/* Last element in the scroll column, so its bottom padding is what
              lifts content clear of the fixed bottom tab bar + safe area. */}
          <SiteFooter
            className="pb-[calc(env(safe-area-inset-bottom)+4rem)] md:pb-4"
            homeUrl={import.meta.env.VITE_HOME_URL}
            githubUrl={import.meta.env.VITE_GITHUB_URL}
            icpBeian={import.meta.env.VITE_ICP_BEIAN}
            versionLink={<Link to="/changelog">v{SITE_VERSION}</Link>}
          />
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Reduce wiki/route.tsx to the extracted layout**

Replace the whole contents of `frontend/apps/aion2/src/routes/wiki/route.tsx`:

```tsx
import { createFileRoute, Outlet } from "@tanstack/react-router";

import ContentLayout from "@/components/ContentLayout";

export const Route = createFileRoute("/wiki")({
  component: () => (
    <ContentLayout>
      <Outlet />
    </ContentLayout>
  ),
});
```

- [ ] **Step 4: Verify the wiki still builds and renders**

Run from `E:/arkive-games/arkive/frontend`: `pnpm build:aion2`

Expected: build succeeds. (The `/changelog` link in the footer does not resolve
until Task 8 adds the route; TanStack's typed `Link` will fail `tsc` here, so if
the build errors on `to="/changelog"`, complete Task 8 before re-running.)

- [ ] **Step 5: Commit**

```bash
git add frontend/apps/aion2/src/lib/siteVersion.ts frontend/apps/aion2/src/components/ContentLayout.tsx frontend/apps/aion2/src/routes/wiki/route.tsx
git commit -m "refactor(aion2): extract ContentLayout from the wiki route"
```

---

## Task 8: aion2 changelog route, top bar and locales

**Files:**
- Create: `frontend/apps/aion2/src/routes/changelog.tsx`
- Modify: `frontend/apps/aion2/src/components/TopNavbar.tsx`
- Modify: `frontend/apps/aion2/public/locales/{en-US,zh-CN,zh-TW,ko-KR}/common.yaml`

- [ ] **Step 1: Write the route**

Create `frontend/apps/aion2/src/routes/changelog.tsx`:

```tsx
import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { VersionHistory, resolveChangelog } from "@gamemap/ui";

import ContentLayout from "@/components/ContentLayout";
import { changelog } from "@/lib/siteVersion";

function ChangelogPage() {
  const { t, i18n } = useTranslation();
  const lng = i18n.resolvedLanguage ?? "en-US";
  const entries = useMemo(() => resolveChangelog(changelog, lng), [lng]);

  return (
    <ContentLayout>
      <h1 className="mb-6 text-3xl font-bold">{t("changelog.title")}</h1>
      <VersionHistory
        entries={entries}
        labels={{
          current: t("changelog.current"),
          empty: t("changelog.empty"),
          kinds: {
            feature: t("changelog.kind.feature"),
            improvement: t("changelog.kind.improvement"),
            fix: t("changelog.kind.fix"),
            data: t("changelog.kind.data"),
          },
        }}
      />
    </ContentLayout>
  );
}

export const Route = createFileRoute("/changelog")({
  component: ChangelogPage,
});
```

- [ ] **Step 2: Regenerate the route tree**

Routes are generated into `src/routeTree.gen.ts` by `@tanstack/router-plugin`,
which runs on dev/build. Run from `E:/arkive-games/arkive/frontend`:

`pnpm build:aion2`

Expected: `src/routeTree.gen.ts` gains a `/changelog` route and the build
succeeds (the footer `Link` from Task 7 now type-checks).

- [ ] **Step 3: Wire the top-bar version row**

In `frontend/apps/aion2/src/components/TopNavbar.tsx`, add:

```tsx
import { SITE_VERSION } from "@/lib/siteVersion";
```

`Link` and `useTranslation` are already imported in this file. Extend the
existing `BuildInfo` usage (around line 116):

```tsx
          <BuildInfo
            commit={__BUILD_GIT_COMMIT__}
            buildTime={__BUILD_TIME__}
            dev={import.meta.env.DEV}
            gameVersion={import.meta.env.VITE_GAME_VERSION}
            siteVersion={<Link to="/changelog">v{SITE_VERSION}</Link>}
            labels={{ siteVersion: t("changelog.title") }}
          />
```

If `t` is not in scope in that component, add `const { t } = useTranslation();`
alongside the file's existing hooks.

- [ ] **Step 4: Add the locale strings**

Append a `changelog:` block to each of the four
`frontend/apps/aion2/public/locales/<lng>/common.yaml` files.

`en-US/common.yaml`:

```yaml
# Version-history page (/changelog). Entry text itself lives in
# src/changelog.json with its own per-locale strings.
changelog:
  title: "Version History"
  current: "Current"
  empty: "No entries yet."
  kind:
    feature: "New"
    improvement: "Improved"
    fix: "Fixed"
    data: "Data"
```

`zh-CN/common.yaml`:

```yaml
changelog:
  title: "更新历史"
  current: "当前"
  empty: "暂无记录。"
  kind:
    feature: "新增"
    improvement: "优化"
    fix: "修复"
    data: "数据"
```

`zh-TW/common.yaml`:

```yaml
changelog:
  title: "更新歷史"
  current: "目前"
  empty: "暫無記錄。"
  kind:
    feature: "新增"
    improvement: "最佳化"
    fix: "修復"
    data: "資料"
```

`ko-KR/common.yaml`:

```yaml
changelog:
  title: "업데이트 내역"
  current: "현재"
  empty: "아직 항목이 없습니다."
  kind:
    feature: "신규"
    improvement: "개선"
    fix: "수정"
    data: "데이터"
```

- [ ] **Step 5: Build and lint**

Run: `pnpm build:aion2 && pnpm --filter aion2 lint`

Expected: build succeeds, lint clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/apps/aion2/src/routes/changelog.tsx frontend/apps/aion2/src/routeTree.gen.ts frontend/apps/aion2/src/components/TopNavbar.tsx frontend/apps/aion2/public/locales
git commit -m "feat(aion2): version history page at /changelog"
```

---

## Task 9: changelog:add helper script

A mechanical way to append an entry, so the agent is not hand-editing JSON and
mis-ordering versions. It does light validation only (flag presence, enum
membership, semver arithmetic); `pnpm test` runs the real validator from
`@gamemap/ui` over the result.

**Files:**
- Create: `frontend/scripts/changelog-add.mjs` (copy from the appendix)
- Modify: `frontend/package.json`

- [ ] **Step 1: Copy the script into place**

Run from `E:/arkive-games/arkive`:

```bash
mkdir -p frontend/scripts
cp docs/superpowers/plans/2026-07-28-version-history/changelog-add.mjs frontend/scripts/changelog-add.mjs
```

- [ ] **Step 2: Register the workspace script**

In `frontend/package.json`, add to `scripts` after `"test": "vitest run",`:

```json
    "test": "vitest run",
    "changelog:add": "node scripts/changelog-add.mjs",
```

- [ ] **Step 3: Verify it rejects bad input**

Run from `E:/arkive-games/arkive/frontend`:

```bash
pnpm changelog:add --app nope --kind feature --en a --zh-cn b --zh-tw c
```

Expected: exits non-zero with `changelog-add: --app must be one of palworld, aion2`.

- [ ] **Step 4: Verify a dry bump, then undo it**

```bash
pnpm changelog:add --app palworld --bump patch --kind fix \
  --en "Scratch entry." --zh-cn "测试条目。" --zh-tw "測試條目。"
```

Expected: prints `changelog-add: palworld 1.7.2 (fix) -> …/changelog.json`.

Confirm the file still validates, then discard the scratch entry:

```bash
pnpm vitest run apps/palworld/src/changelog.test.ts
git checkout -- apps/palworld/src/changelog.json
```

Expected: the validity test passes; the "starts at the current version" test
FAILS while the scratch entry is present (it expects `1.7.1`) — that is the proof
the script wrote a real new version. After `git checkout`, re-run and all 3 pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/scripts/changelog-add.mjs frontend/package.json
git commit -m "chore(frontend): changelog:add helper for version bumps"
```

---

## Task 10: record the convention in CLAUDE.md

This is the part that makes the feature self-sustaining: without it, the
changelog goes stale after one release.

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add the convention**

In `CLAUDE.md`, add this bullet to the `## Conventions` list, directly after the
**Typography / font sizes** bullet (it is the last one in that section):

```markdown
- **Version history (bump at commit):** each frontend app owns
  `frontend/apps/<app>/src/changelog.json`, newest entry first — `entries[0]` **is**
  that app's current version, shown in the footer and the top-bar build hovercard.
  **Not every commit gets a version.** Bump only when a commit ships something a
  visitor would notice, and do it **in the same commit** as the change:
  - `MINOR` — a new user-facing feature or page. `PATCH` — a batch of visible
    fixes or polish. `MAJOR` — a site-level reinvention (rare; aion2 `1.0.0` was
    the Phase-2 rebuild).
  - Write all three locales (`en-US`, `zh-CN`, `zh-TW`); other locales fall back
    to English. Describe the **user-visible change**, not the implementation.
  - **No entry** for internal-only work: refactors, tooling, tests, docs, CI, or
    data-pipeline plumbing with no visible effect.
  - Append mechanically rather than hand-editing JSON:
    `pnpm changelog:add --app palworld --bump minor --kind feature --en "…" --zh-cn "…" --zh-tw "…"`
    (`--kind` ∈ `feature|improvement|fix|data`; add `--append` for a second bullet
    on the version you just created). `pnpm test` validates ordering, dates and
    locale coverage.
```

- [ ] **Step 2: Verify the file still reads coherently**

Run from `E:/arkive-games/arkive`: `grep -n "Version history" CLAUDE.md`

Expected: one hit inside the `## Conventions` section.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: version-bump-at-commit convention"
```

---

## Task 11: end-to-end coverage

**Files:**
- Create: `frontend/apps/palworld/e2e/changelog.spec.ts`
- Create: `frontend/apps/aion2/e2e/changelog.spec.ts`

- [ ] **Step 1: Write the palworld spec**

Create `frontend/apps/palworld/e2e/changelog.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

test('changelog lists versions newest-first with the current badge', async ({ page }) => {
  await page.goto('/changelog')
  const entries = page.getByTestId('changelog-entry')
  // Shape, not a pinned literal — the newest version changes on every release.
  await expect(entries.first()).toHaveAttribute('data-version', /^\d+\.\d+\.\d+$/)
  expect(await entries.count()).toBeGreaterThanOrEqual(20)
  await expect(page.getByTestId('changelog-current')).toHaveCount(1)
  await expect(page.getByText('v0.1.0')).toBeVisible()
})

test('footer version link reaches the changelog', async ({ page }) => {
  await page.goto('/pals')
  await page.getByTestId('site-footer-version').getByRole('link').click()
  await expect(page).toHaveURL(/\/changelog$/)
  await expect(page.getByTestId('changelog-entry').first()).toBeVisible()
})
```

- [ ] **Step 2: Run it**

Run from `E:/arkive-games/arkive/frontend`: `pnpm e2e:palworld -- changelog.spec.ts`

Expected: 2 passed.

- [ ] **Step 3: Write the aion2 spec**

Create `frontend/apps/aion2/e2e/changelog.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("changelog lists versions newest-first with the current badge", async ({ page }) => {
  await page.goto("/changelog");
  const entries = page.getByTestId("changelog-entry");
  // Shape, not a pinned literal — the newest version changes on every release.
  await expect(entries.first()).toHaveAttribute("data-version", /^\d+\.\d+\.\d+$/);
  expect(await entries.count()).toBeGreaterThanOrEqual(17);
  await expect(page.getByTestId("changelog-current")).toHaveCount(1);
  await expect(page.getByText("v1.0.0")).toBeVisible();
});

test("footer version link reaches the changelog", async ({ page }) => {
  await page.goto("/wiki");
  await page.getByTestId("site-footer-version").getByRole("link").click();
  await expect(page).toHaveURL(/\/changelog$/);
  await expect(page.getByTestId("changelog-entry").first()).toBeVisible();
});
```

- [ ] **Step 4: Run it**

aion2's Playwright config defaults to port 5173, which a running palworld dev
server may already hold — pass an explicit port. Run from
`E:/arkive-games/arkive/frontend`:

`E2E_PORT=15173 pnpm e2e:aion2 -- changelog.spec.ts`

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add frontend/apps/palworld/e2e/changelog.spec.ts frontend/apps/aion2/e2e/changelog.spec.ts
git commit -m "test: e2e coverage for the version history pages"
```

---

## Task 12: dogfood the convention and verify the whole thing

The feature's own release is the first real exercise of the rule from Task 10: a
new user-facing page is a MINOR bump in both apps, entered via the script rather
than by hand.

**Files:**
- Modify: `frontend/apps/palworld/src/changelog.json` (via the script)
- Modify: `frontend/apps/aion2/src/changelog.json` (via the script)

- [ ] **Step 1: Bump palworld to 1.8.0**

Run from `E:/arkive-games/arkive/frontend`:

```bash
pnpm changelog:add --app palworld --bump minor --kind feature \
  --en "Version history page — every release and what changed, at /changelog." \
  --zh-cn "新增更新历史页面：在 /changelog 查看每个版本的变更内容。" \
  --zh-tw "新增更新歷史頁面：在 /changelog 查看每個版本的變更內容。"
```

Expected: `changelog-add: palworld 1.8.0 (feature) -> …`

- [ ] **Step 2: Bump aion2 to 1.6.0**

```bash
pnpm changelog:add --app aion2 --bump minor --kind feature \
  --en "Version history page — every release and what changed, at /changelog." \
  --zh-cn "新增更新历史页面：在 /changelog 查看每个版本的变更内容。" \
  --zh-tw "新增更新歷史頁面：在 /changelog 查看每個版本的變更內容。"
```

Expected: `changelog-add: aion2 1.6.0 (feature) -> …`

- [ ] **Step 3: Run the full unit suite**

Run from `E:/arkive-games/arkive/frontend`: `pnpm test`

Expected: all suites pass, including both `changelog.test.ts` files and the
`packages/ui` tests.

- [ ] **Step 4: Confirm the shared-package boundary still holds**

The `@gamemap/ui` additions must not have pulled in i18n, routing, storage or
fetch. Run:

```bash
pnpm check:engine && pnpm check:shell
grep -rn --include=*.ts --include=*.tsx -P "i18next|useTranslation|react-router|localStorage|fetch\(" packages/ui/src && echo "BOUNDARY VIOLATION" || echo "ui boundary clean"
```

Expected: `check:engine`/`check:shell` exit 0; the grep prints `ui boundary clean`.

- [ ] **Step 5: Build both apps**

```bash
pnpm build:palworld && pnpm build:aion2
```

Expected: both builds succeed.

- [ ] **Step 6: Run both e2e changelog specs**

```bash
pnpm e2e:palworld -- changelog.spec.ts
E2E_PORT=15173 pnpm e2e:aion2 -- changelog.spec.ts
```

Expected: 2 passed each.

- [ ] **Step 7: Look at the pages**

Start palworld (`pnpm dev:palworld`, port 15174) and open
`http://localhost:15174/changelog`. Confirm: newest version first with a
"Current" badge, coloured kind badges, the footer shows `v1.8.0` linking here, and
the top-bar GitHub hovercard shows a `Version` row. Switch the language to
简体中文 and confirm the entry text changes; switch to 日本語 and confirm entries
fall back to English while the badges stay Japanese.

Then the same for aion2 (`pnpm dev:aion2`, port 15173) at
`http://localhost:15173/changelog`.

- [ ] **Step 8: Commit**

```bash
git add frontend/apps/palworld/src/changelog.json frontend/apps/aion2/src/changelog.json
git commit -m "feat: version history pages for both apps (palworld 1.8.0, aion2 1.6.0)"
```

---

## Done when

- `/changelog` renders in both apps, newest version first, in the app's own chrome.
- The footer and the build hovercard both link to it.
- `pnpm test` validates both changelog files; `pnpm check:engine`/`check:shell`
  and the `packages/ui` boundary grep stay clean.
- Both e2e specs pass; both apps build.
- `CLAUDE.md` records the bump-at-commit rule, and `pnpm changelog:add` works.
