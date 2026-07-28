# Common Right Sidebar — Site Info & Feedback

**Date:** 2026-07-28
**Scope:** `frontend/packages/ui`, `frontend/packages/map-shell`, `frontend/apps/aion2`, `frontend/apps/palworld`

## Goal

Give both sites a shared "site information & feedback" surface that mirrors the existing left
sidebar: a collapsible right sidebar on the desktop map, plus the same content reachable from
every page. Its job is to say briefly what the site is, disclaim any official affiliation, and
invite users into the QQ group **1091411026** for feedback, suggestions and bug reports.

## Background

A right sidebar existed in the pre-monorepo aion2 site and was deleted in commit `c470d62`
("feat: add contact us, remove right sidebar"), which moved its contact text into a top-bar
popover. The locale key group `rightSidebar.*` survived that removal and is still the source of
the popover's text today — a name that describes UI which no longer exists.

Current state per app:

| | aion2 | palworld |
|---|---|---|
| Contact text in top bar | yes — `Mail` popover, `TopNavbar.tsx:83-118` | none |
| Contact text on mobile | yes — inline in More sheet, `BottomTabBar.tsx:205-213` | none |
| Right sidebar | none | none |
| Intro / disclaimer | long `introModal` only | none |

Both apps hide their top bar below `md` (`hidden … md:flex`) and use a `BottomTabBar` with a
"More" bottom sheet instead. Both map routes already branch on `useIsMobile()` (aion2
`MapRoute.tsx:356`, palworld `App.tsx:773`), and neither mobile branch renders `ShellSidebar`.

`ShellSidebar` (`packages/map-shell/src/ShellSidebar.tsx`, 109 lines) is shared by both apps and
is the only left-sidebar implementation in the repo. Its only left-specific code is the collapse
button (`right-0 translate-x-full rounded-r-md rounded-l-none`) and its chevron direction.
`ShellLayout` has a single `sidebar` slot.

Shared packages are string-free and storage-free by policy, enforced by `check:shell` (greps
`packages/map-shell/src` for `i18next|useTranslation|react-router|import.meta.env|localStorage|fetch(|@/`).
Text arrives as required props; persistence arrives as an injected adapter (`ThemeStorage`).

## Decisions

| Question | Decision |
|---|---|
| Placement | Right sidebar on desktop map pages **and** a top-bar entry on every page |
| Content | Site intro + disclaimer, and the QQ group. Nothing else |
| QQ presentation | Number with a copy button (no QR, no join link) |
| Locale gating | QQ block for `zh-CN` / `zh-TW` only |
| Non-zh locales | Per-locale contact block: aion2 `en-US`/`ko-KR` keep their existing Discord invites; palworld's other 15 locales get no contact block |
| aion2 legacy groups | Keep the three AION2 discussion groups **and** add 1091411026 as the feedback channel |
| Mobile entry | Inline section in each app's existing More sheet |
| Desktop default state | Expanded on first visit, then the user's choice is remembered |
| Architecture | Extend `ShellSidebar` with a `side` prop rather than writing a second sidebar |

Rejected: a real right rail on wiki/catalog pages (centered `max-w` columns would need layout
surgery); a dedicated `ShellInfoSidebar` (duplicates ~40 lines of collapse logic that will
drift); popover-only with no sidebar (drops the requested mirroring).

## Architecture

### `packages/ui/src/site-info-panel.tsx` (new)

Presentational only. No i18n, no storage, no `react-markdown` — palworld does not depend on
`react-markdown` (only aion2 does), so the panel accepts already-rendered nodes.

```ts
export interface SiteInfoSection {
  /** Optional heading; omit for a lead paragraph. */
  title?: string
  /** Rendered body — aion2 passes <ReactMarkdown>, palworld passes <p> elements. */
  body: ReactNode
}

export interface SiteInfoFeedbackGroup {
  /** e.g. "QQ 群" */
  label: string
  /** e.g. "1091411026" */
  number: string
  copyLabel: string
  copiedLabel: string
}

export interface SiteInfoPanelProps {
  sections: SiteInfoSection[]
  /** Omitted → no feedback card (non-zh locales). */
  feedbackGroup?: SiteInfoFeedbackGroup
  className?: string
}
```

Behaviour:

- Stacked sections: optional `text-sm font-semibold` heading, then `body`.
- `feedbackGroup` renders a bordered `bg-muted/40` card: label in `text-xs text-muted-foreground`,
  number in `font-mono select-all`, and a `Button size="sm" variant="secondary"` that calls
  `navigator.clipboard.writeText(number)` and swaps to `copiedLabel` + check icon for ~2s.
- If `navigator.clipboard` is unavailable the button is **not rendered** (rather than shown
  broken); the number stays `select-all` so manual copy still works.
- Only generic semantic tokens (`bg-card`, `border-border`, `text-muted-foreground`,
  `text-primary`) so it renders correctly in both apps' themes without per-app overrides.
- `data-testid="site-info-panel"`, copy button `data-testid="site-info-copy"`.
- Font sizes come from the Tailwind scale only (`text-xs` floor), per workspace convention.

### `packages/map-shell/src/ShellSidebar.tsx` (modified)

Add `side?: "left" | "right"`, defaulting to `"left"` so no existing call site changes.

- `side="left"` (unchanged): button `right-0 translate-x-full rounded-r-md rounded-l-none`;
  chevron `collapsed ? Right : Left`; `data-testid="sidebar-toggle"`.
- `side="right"`: button `left-0 -translate-x-full rounded-l-md rounded-r-none`;
  chevron `collapsed ? Left : Right`; `data-testid="sidebar-toggle-right"`.

The distinct right-side testid matters: existing e2e specs select `sidebar-toggle` and must keep
resolving to exactly one element.

Everything else (width, animation, controlled/uncontrolled collapse, slots, `classNames`) is
reused as-is.

### `packages/map-shell/src/ShellLayout.tsx` (modified)

Add `rightSidebar?: ReactNode`, rendered after the content column inside the existing flex row:

```tsx
<div className="flex min-h-0 flex-1 overflow-hidden">
  {sidebar}
  <div className="flex min-w-0 flex-1 flex-col overflow-hidden">{children}</div>
  {rightSidebar}
</div>
```

## Host surfaces

Three per app, all rendering the same `SiteInfoPanel`.

### 1. Desktop map right sidebar

- **aion2** — new `src/features/map/sidebar/InfoSidebar.tsx` wrapping
  `ShellSidebar side="right" width={346}`, mounted in `MapRoute.tsx`'s desktop `ShellLayout` via
  the new `rightSidebar` prop. `classNames` follow the left sidebar's bespoke aion2 vars
  (`bg-[color:var(--color-sidebar-collapse)]` on the toggle).
- **palworld** — new `src/components/InfoSidebar.tsx`, mounted in `App.tsx`'s desktop branch
  (currently lines 823-861). `classNames` mirror the left sidebar's
  `bg-gradient-to-b from-card to-background`, with `border-l` instead of `border-r`.

Width 346 matches the left sidebar so the map is symmetric. The toggle tab label is
`siteInfo.tabLabel` (not the generic collapse/expand strings) so the tab names what it opens.

Mobile needs no work here: neither app's mobile map branch renders `ShellSidebar`.

### 2. Desktop top-bar popover (every page)

- **aion2** — `TopNavbar.tsx`: keep the `Mail` trigger and `data-testid="contact-menu"`, replace
  the popover's markdown body with `<SiteInfoPanel>`.
- **palworld** — `TopNav.tsx`: add the same popover to `rightExtras`, before `ThemeToggle`, with
  `data-testid="contact-menu"` for parity.

The popover remains available on map pages too. A duplicate entry point is harmless and cheaper
than conditionally hiding it, and the sidebar may be collapsed.

### 3. Mobile More sheet

- **aion2** — `BottomTabBar.tsx`: replace the existing inline contact section (lines 205-213)
  with `<SiteInfoPanel>`, keeping the surrounding `mt-3 border-t border-border pt-3` section
  wrapper and leaving the archive link below it untouched.
- **palworld** — `BottomTabBar.tsx`: add the equivalent section to its More sheet.

Rendering inline inside the already-scrollable More sheet (`max-h-[85dvh] overflow-y-auto`)
follows aion2's current pattern and avoids opening a Sheet from inside a Sheet — a known
z-index trap in this codebase (`@gamemap/ui` dialog layers sit below `Sheet`'s `z-3000`).

## Content and i18n model

The group numbers are **code, not translations**. `1091411026` lives in one constant per app and
is passed as `feedbackGroup` only when the active locale is Chinese:

```ts
const isZh = (i18n.resolvedLanguage ?? i18n.language).startsWith("zh")
```

Everything else is per-locale text under a `siteInfo` key group:

| Key | Purpose |
|---|---|
| `siteInfo.tabLabel` | Right-sidebar toggle tab text; popover `aria-label` |
| `siteInfo.title` | Panel heading |
| `siteInfo.body` | Short intro + "unofficial fan project, not affiliated with NCSoft / Pocketpair" |
| `siteInfo.contact.title` | Contact section heading |
| `siteInfo.contact.body` | Per-locale contact prose (optional) |
| `siteInfo.copy` / `siteInfo.copied` | Copy button states |

`siteInfo.body` is 2-3 sentences. It is deliberately **not** a copy of aion2's long `introModal`
text (ownership, GPL, anti-scam warnings); that modal keeps its own keys and its own job. It is
new text in every locale — four bodies to author for aion2, seventeen for palworld.

Keys map onto `SiteInfoPanelProps` as:

```
sections[0] = { title: siteInfo.title,         body: <siteInfo.body> }
sections[1] = { title: siteInfo.contact.title, body: <siteInfo.contact.body> }   // omitted when absent
feedbackGroup = isZh ? { label, number: QQ_GROUP, copyLabel, copiedLabel } : undefined
```

The panel renders every heading itself; hosts must not add their own. In particular aion2's
popover currently prints `rightSidebar.contact.title` above the markdown (`TopNavbar.tsx:102`)
and its More sheet does the same (`BottomTabBar.tsx:207`) — both go away, replaced by the
panel's own section headings.

### aion2 — `public/locales/<lng>/common.yaml`

Rename the legacy `rightSidebar.*` group to `siteInfo.*` and add the new keys. `contact.body`
inherits today's per-locale prose, so nothing regresses:

| Locale | `contact.body` |
|---|---|
| `zh-CN` | existing three AION2 groups (246681864 / 197791140 / 791286881) |
| `zh-TW` | **missing today** — author from zh-CN (this file has no `rightSidebar` keys at all) |
| `en-US` | existing Discord invites |
| `ko-KR` | existing Discord invites |

zh-CN and zh-TW additionally get the 1091411026 copy card from `feedbackGroup`; en-US and ko-KR
do not.

Call sites to update when renaming: `TopNavbar.tsx:107,111` and `BottomTabBar.tsx:207,211`.

`rightSidebar.members` and `rightSidebar.donation` are referenced by no component (verified by
grep across `apps/` and `packages/`) and duplicate content already present in `introModal`. The
plan re-verifies this, then removes them.

### palworld — new `src/siteInfoStrings.ts`

Follows the established per-feature pattern (`fishingStrings.ts` et al.): a
`Record<Language, SiteInfoStrings>` — TypeScript therefore forces all 17 locales — merged into
the `translation` namespace under `siteInfo` by the existing `addResourceBundle` loop in
`i18n.ts`. `contact` is an optional member, present only for `zh-CN` and `zh-TW`; the other 15
locales render intro + disclaimer with no contact block.

## Persistence

Desktop collapse state is owned by each app, so `ShellSidebar` stays storage-free and
`check:shell` keeps passing. Each app supplies a `{ get, set }` adapter in the `ThemeStorage`
style:

- keys: `aion2.siteInfoSidebarCollapsed`, `palworld.siteInfoSidebarCollapsed`
- absent value → expanded, so a first-time visitor sees the feedback invite
- `onCollapsedChange` writes, so a returning visitor keeps their choice

## Testing

Playwright, per app:

1. Desktop map renders the right sidebar; under `zh-CN` it contains `1091411026`, under `en-US`
   it does not.
2. `sidebar-toggle-right` collapses it, and the collapsed state survives a reload.
3. `sidebar-toggle` (left) still resolves to exactly one element.
4. On a non-map page (aion2 `/wiki`, palworld `/pals`), the top-bar popover opens the same panel.
5. At a mobile viewport, the More sheet shows the panel section.
6. Copy button: assert the label swaps to `copied` (clipboard permissions in headless make
   reading the clipboard unreliable, so assert the UI state, not the clipboard contents).

Known baselines to compare against, not to fix: aion2 e2e is 25 pass / 1 fail (embedded-map POI)
and needs `E2E_PORT` to avoid reusing a running palworld dev server; palworld has 2 known
failures (ko-KR smoke, dungeons "Hard · bonus").

Also run `pnpm check:shell` and `pnpm check:engine`, plus typecheck and lint.

## Risks

- **Map resize on collapse.** No `invalidateSize()` call exists anywhere in the repo, and the
  left sidebar's animated 300ms collapse works today, so the right sidebar carries the same
  behaviour. Verify visually that tiles fill after expand/collapse.
- **Locale coverage.** palworld's 17-locale `Record` means 17 short bodies must be authored; a
  missing locale is a type error, not a silent gap.
- **Horizontal space.** 346px on each side leaves a narrow map on ~1280px screens. Mitigated by
  the remembered-collapse default; revisit the width if it feels tight in review.

## Out of scope

Donation / Alipay QR, team-member lists, GitHub and license blocks, data-version or build-info
display, cross-links between the two sites, and any right rail on wiki/catalog pages.
