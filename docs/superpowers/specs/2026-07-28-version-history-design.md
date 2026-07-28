# Version History Pages — Design

**Date:** 2026-07-28
**Scope:** `frontend/packages/ui`, `frontend/apps/{aion2,palworld}`, `CLAUDE.md`

## Problem

Neither site tells visitors what changed. The only build metadata exposed is the
`BuildInfo` hovercard (commit hash, build time, game-data version) — useful for
debugging, useless as release notes. There is no version number for the sites
themselves and no record of the eight months of shipped work.

Three things are needed:

1. A version-history page in each app, sharing one component.
2. A convention that makes the agent bump the version and append an entry at
   commit time — for notable changes only, not every commit.
3. A backfill of the existing history so the page is not empty on day one.

## Versioning model

Each app carries its own SemVer-lite line. The two apps ship on unrelated
cadences (288 `palworld`-scoped commits vs. an `aion2` history spread across
unscoped and legacy scopes), so a shared version line would mean bumping one app
with an empty changelog every time the other shipped.

| Part | Meaning |
| --- | --- |
| MAJOR | Site-level reinvention — new app launch, full redesign. Rare. |
| MINOR | A user-facing feature or page ships. |
| PATCH | A batch of visible fixes or polish. |

**`frontend/apps/<app>/src/changelog.json` is the sole source of truth.** Entry
`[0]` *is* the app's current version. The apps' `package.json` versions stay at
`0.0.0` (they are `private` and unpublished) so there is no second copy to drift.

## Data format

`frontend/apps/<app>/src/changelog.json`, newest entry first. It lives inside
`src/` because both apps' `tsconfig.app.json` set `"include": ["src", "env.d.ts"]`
— a file at the app root would fall outside the program. Both tsconfigs also need
`"resolveJsonModule": true` added, which they currently lack.

```jsonc
{
  "entries": [
    {
      "version": "1.8.0",
      "date": "2026-07-28",
      "changes": [
        {
          "kind": "feature",
          "text": {
            "en-US": "Pal stat simulator with a hidden-IV solver.",
            "zh-CN": "帕鲁属性模拟器，支持隐藏个体值反解。",
            "zh-TW": "帕魯屬性模擬器，支援隱藏個體值反解。"
          }
        }
      ]
    }
  ]
}
```

- `kind` ∈ `feature` | `improvement` | `fix` | `data`. Drives a coloured badge.
- `text` carries `en-US`, `zh-CN`, `zh-TW`. palworld ships 17 locales and aion2
  ships 4; hand-writing every entry in 17 languages would make each version bump
  a translation task, so other locales fall back to English. Traditional Chinese
  is a mechanical conversion of the Simplified text, so it costs nothing to
  include and covers a real slice of the audience.
- The file is `import`ed and bundled, not fetched. The page therefore cannot
  break on a slow or unversioned data host, unlike the runtime-fetched datasets.

## Shared component (`@gamemap/ui`)

The package already holds the cross-app chrome (`BuildInfo`, `SiteFooter`) and
follows the shared-package rule: no i18n, no fetch, no storage, labels injected
by the consuming app. The version history follows the same shape.

**`resolveChangelog(raw, locale)`** — pure function, no dependencies. Collapses
each `text` map to a single string using the fallback chain `zh-TW → zh-CN →
en-US`; every other locale falls back to `en-US` directly. `en-US` is required on
every change, so resolution always terminates.

**`<VersionHistory entries labels />`** — presentational only. Takes *resolved*
entries plus injected labels (badge names, the "current" marker). Locale
selection and routing stay in the apps, which keeps the component testable
without an i18n runtime and keeps the router out of the package.

Types `ChangelogFile`, `ChangelogEntry`, `Change`, and `ChangeKind` are exported
alongside, so both apps and the validation test share one definition.

## Pages and discoverability

Route `/changelog` in both apps, plus a rewrite in `frontend/edgeone.json` — that
file serves both sites, so a single entry covers them.

**palworld** — a `createRoute` in `main.tsx` wrapped in the existing
`ContentPage`. `NavKey` widens to include `/changelog`; nothing highlights in the
top nav because the page is not a nav item, which is the correct behaviour.

**aion2** — a new `src/routes/changelog.tsx`. The page chrome (top bar / mobile
header / max-width scroll column / footer) currently exists only inline inside
`routes/wiki/route.tsx`. Rather than copy it, extract it into a
`components/ContentLayout.tsx` and have both `wiki/route.tsx` and the new route
render it. This is the one piece of pre-existing code the feature touches, and
extracting it is cheaper than maintaining two copies of the shell.

**Entry points.** `SiteFooter` gains an optional version link (`v1.8.0`) beside
the copyright line, so both apps get it from one change. `BuildInfo` gains a site
version row linking to `/changelog` — that hovercard is already where a user
looks for "what am I running".

## Agent workflow at commit

A convention recorded in `CLAUDE.md`, plus a `pnpm changelog:add` helper that
appends a schema-valid entry.

Deliberately **not** a git hook: deciding whether a change is version-worthy is a
judgment call about user-visible impact, which a hook cannot make. A hook would
either bump on every commit (defeating the requirement) or require a flag that is
easy to forget.

The `CLAUDE.md` rule states:

- Each app owns `frontend/apps/<app>/src/changelog.json`, newest entry first.
- Not every commit gets a version. Bump when a commit ships something a visitor
  would notice — a new page, a new feature, a visible fix batch — in the **same
  commit** as the change itself.
- MINOR for a user-facing feature or page, PATCH for a fix/polish batch, MAJOR
  only for a site-level redesign.
- Write all three locales (`en-US`, `zh-CN`, `zh-TW`). Describe the user-visible
  change, not the implementation.
- Internal-only work — refactors, tooling, docs, tests, data-pipeline plumbing
  with no visible effect — gets **no entry**.
- `pnpm test` validates the file; `pnpm changelog:add` writes it mechanically.

## Backfill

959 commits since 2025-11-16 are grouped into the feature arcs a visitor would
have noticed, roughly 15–25 versions per app, climbing to each app's real current
version. A near-1:1 mapping to commits would produce hundreds of entries of
internal noise; monthly buckets would lump unrelated features together.

Method: walk `git log` restricted to each app's paths, cluster consecutive
commits that delivered one visible capability (for example "stat simulator",
"base raids page", "mobile layout"), and write one entry per cluster. aion2's
early history predates the `type(scope):` convention, so it is filtered by path
rather than by commit scope. Dates come from the last commit in each cluster.

## Testing

- `resolveChangelog` unit tests: exact-locale hit, `zh-TW → zh-CN` fallback,
  unknown locale → `en-US`, and a `zh-TW`-missing-but-`zh-CN`-present case.
- `VersionHistory` render test (jsdom, matching the existing
  `// @vitest-environment jsdom` pragma convention): groups changes under their
  version, renders one badge per `kind`, marks entry `[0]` as current, and
  renders an empty state for zero entries.
- Data validation test per app (`apps/<app>/src/changelog.test.ts`) using a
  `validateChangelog` helper exported from `@gamemap/ui`, so the rule lives in one
  place and each app asserts its own file: parses, versions
  strictly descending by semver, dates non-increasing, every change carries all
  three locales, every `kind` is in the enum.
- e2e per app: `/changelog` renders the current version and the footer version
  link navigates to it.

## Out of scope

- Localizing entries beyond the three locales above.
- Per-entry deep links to commits or pull requests.
- A changelog for `apps/meta` (a static landing page with no feature surface) or
  for `backend`/`tools` (no user-facing release surface).
- Any automated release tagging or npm publishing.
