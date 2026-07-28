# AION2 App — Mobile Phone Compatibility

**Date:** 2026-07-28
**Scope:** Make every route of the `aion2` app usable on a phone. Do not touch `palworld` or
`meta`; do not change any desktop (`md+`) layout.

This is the deferred half of
[`2026-07-07-palworld-mobile-compatibility-design.md`](2026-07-07-palworld-mobile-compatibility-design.md),
whose "Defer aion2 (leave untouched)" non-goal this spec closes. The mobile primitives that work
landed (`useIsMobile`, `Sheet`, `SiteFooter`, `SearchPanel variant="inline"`) already ship in the
shared packages and are reused here rather than rebuilt.

## Audit — measured state at 390×844

Every route was inspected live in a 390×844 viewport before writing this spec.

| Route | State |
| --- | --- |
| `/` (map) | **Unusable.** The 346px `ShellSidebar` occupies 346 of 390 available px, leaving the map a ~44px sliver. The floating `SearchPanel` is clipped off the right edge. |
| all routes (top bar) | **Broken.** `ShellTopBar` measures `scrollWidth` 518px in a 390px viewport. The `lang-menu`, `theme-menu` and `contact-menu` buttons sit entirely outside the viewport and are **unreachable** — there is no way to change language or theme on a phone. The 「旧版入口」notice block renders 106px tall inside the `h-12` (48px) header and is clipped. |
| `/wiki`, `/wiki/$type`, `/wiki/$type/$slug` | Body *layout* is already responsive — `min-w-0`, `md:`-gated column ordering, `grid-cols-1` defaults. Measured zero horizontal overflow inside `main`; the embedded quest map sizes correctly (340×339). One real defect: the section chips on the type hubs measure **25px tall with a 5px vertical gap** between wrapped rows (96 of them on `/wiki/item`) — far under the ~44px touch guidance, and dense enough to mis-tap. |

Two further defects found by reading, not measurement:

- `apps/aion2/index.html` lacks `viewport-fit=cover`; `palworld` and `meta` both have it.
- `routes/wiki/route.tsx` uses `h-screen` (`100vh`), which mobile browser chrome clips.
  Everywhere else in the monorepo this is `h-dvh`.

There is no mobile navigation of any kind.

## Goal

All six aion2 routes render and function on a 390px-wide viewport: no clipped or unreachable
controls, no horizontal page overflow, the map usable at full width, and every top-bar function
(navigation, search, language, theme, contact, archive link) reachable by touch.

## Non-goals

- No `palworld` or `meta` changes.
- No desktop (`md+`) layout changes. Desktop output stays visually identical.
- No new dependencies. `Sheet` and `useIsMobile` already exist in `@gamemap/ui`.
- No `map-engine` changes.
- No wiki content, data or taxonomy changes. (The group lists show raw map ids such as
  `World_D_Starter` and item rows render without icons — both are pre-existing content/data
  gaps, out of scope here.)
- No WeChat mini-program work (see the palworld spec's section E; unchanged by this work).

## Decisions (confirmed with user)

1. **Mobile navigation:** bottom tab bar, palworld-style — **Map · Quests · NPCs · Items · More**,
   with the More sheet holding Wiki home, language, theme, contact and the 旧版入口 archive link.
2. **Wiki mobile header:** a brand + global-search bar, *not* a per-page title. Every wiki page
   already renders its own `<h1>`, so threading titles through the router would duplicate them for
   no gain.
3. **Filter UI on the map:** extract the marker-types section so the desktop sidebar and the
   mobile filter sheet render one shared source, rather than two copies that can drift.

## Breakpoint

**Mobile = viewport width < 768px** (Tailwind `md`), via the existing `useIsMobile()` from
`@gamemap/ui` (`matchMedia('(max-width: 767px)')`, initialized synchronously so there is no
desktop→mobile remount flash). CSS-expressible switches use `md:` prefixes; only layout changes
CSS cannot express (rendering a `Sheet` instead of a sidebar) go through the hook.

## Approach

**Port the palworld mobile layer into aion2** as per-app components, reusing the shared
primitives.

Two alternatives were considered and rejected:

- **Promote `ContentPage` / `BottomTabBar` into `packages/map-shell`.** Rejected: those packages
  are contractually free of i18n, router and storage access — `pnpm check:shell` greps for and
  fails on exactly that (see `frontend/package.json`). A tab bar needs all three. Palworld kept
  its copies per-app for this reason; matching that keeps the shared-package contract intact.
- **CSS-only responsive layer (no `useIsMobile` branch).** Rejected: the map sidebar must be
  *replaced* by sheets, not narrowed. A CSS-only version still mounts the 346px `ShellSidebar` and
  the floating `SearchPanel` overlay, so the map never gets the full width.

### Change inventory

#### 1. `apps/aion2/index.html`

Add `viewport-fit=cover` to the viewport meta, matching the other two apps, so
`env(safe-area-inset-*)` resolves to real values on notched devices.

#### 2. `apps/aion2/src/components/BottomTabBar.tsx` (new)

Fixed bottom navigation, `md:hidden`, `z-[2500]`, `paddingBottom: env(safe-area-inset-bottom)`.
Modelled on `apps/palworld/src/components/BottomTabBar.tsx`.

- Four primary tabs: **Map** (`/`), **Quests** (`/wiki/quest`), **NPCs** (`/wiki/npc`),
  **Items** (`/wiki/item`). The three wiki type slugs are `quest`, `npc`, `item` (confirmed
  against `data/wiki/taxonomy.json`); labels come from the `wiki/taxonomy` i18n namespace
  (`types.<slug>.name`), so they stay translated and never hard-code a name.
- Fifth item **More** opens a bottom `Sheet` containing: **Wiki home** (`/wiki`), the **language
  switcher**, the **theme toggle**, the **contact** content, and the **旧版入口** archive link —
  i.e. everything the desktop top bar carries that the four tabs don't.
- Active-tab detection from `useLocation().pathname`: `/` → Map; `/wiki/quest*` → Quests, and so
  on; bare `/wiki` and any unmatched wiki path highlight **More** (which is where Wiki home
  lives), so exactly one tab is ever active.

#### 3. `apps/aion2/src/routes/__root.tsx`

Mount `<BottomTabBar />` once inside the providers, next to `<Outlet />`. `__root` wraps every
route, so one mount covers both the map and all wiki pages — the equivalent of palworld mounting
it in `main.tsx`. It needs i18n and router context, both already established there.

#### 4. `apps/aion2/src/components/TopNavbar.tsx`

Add `hidden md:flex` to the `ShellTopBar` root class. Below `md` the whole desktop bar — including
the 518px-wide overflowing cluster and the 106px 旧版入口 block — stops rendering; the bottom tab
bar and the wiki mobile header take over. This single change fixes the unreachable
language/theme/contact controls. `ShellTopBar` itself is not modified, so palworld is unaffected.

#### 5. `apps/aion2/src/routes/wiki/route.tsx`

- `h-screen` → `h-dvh`.
- Add a mobile-only (`md:hidden`) compact header: the **AION2** home link plus
  `GlobalSearchWidget`. Per decision 2 this is a brand/utility bar, not a page title.
- The `SiteFooter` is the last element in the scroll column, so it carries the clearance for the
  fixed tab bar: `pb-[calc(env(safe-area-inset-bottom)+4rem)] md:pb-4` (same expression palworld's
  `ContentPage` uses).

#### 6. `apps/aion2/src/features/map/MapRoute.tsx`

Add a mobile branch ahead of the existing `ShellLayout` return. Desktop path untouched.

The mobile branch renders the map full-screen **inside the same flex chain the desktop
`ShellLayout` establishes** (`h-dvh` root → `flex min-h-0 flex-1` main), because Leaflet needs a
definite height at mount or it sizes to zero. Palworld hit and fixed exactly this
(`57a557a fix(palworld): reliable mobile map sizing`); the comment there records why.

Over the map, two floating action buttons positioned
`bottom: calc(env(safe-area-inset-bottom) + 4.5rem)` so they clear the tab bar:

- **Search** FAB → bottom `Sheet` hosting `SearchPanel` with `variant="inline"` (the variant added
  in `79ca549` for precisely this).
- **Filter** FAB → bottom `Sheet` with `SelectMap` in the sheet header and the marker-types
  section as the scrollable body.

Both sheets get `data-testid`s for the e2e spec. All existing map state — deep links, view
persistence, selection restore, `forceShowIds` — is shared by both branches and unchanged.

#### 7. `apps/aion2/src/features/map/sidebar/`

The marker-types block (the `Sparkles` header + `<MarkerTypes />`) currently lives inline in
`Sidebar.tsx`. Extract it into a small component so `Sidebar` (desktop) and the mobile filter
sheet render the same source. Per decision 3 this prevents the two filter UIs from drifting.
`Logo` stays desktop-only — the mobile sheet has no room for it and the tab bar already identifies
the app.

#### 8. `apps/aion2/src/features/wiki/TypeHub.tsx` — chip touch targets

Raise the section chips from 25px to at least 36px of effective tap height below `md`, and widen
the vertical gap between wrapped rows so adjacent rows are not 5px apart. Padding and gap only
(`py-1.5 md:py-0.5`, `gap-y-2`) — no font-size change, per the workspace typography rule that text
sizes stay on the Tailwind scale. `md+` keeps today's compact chips exactly.

The same treatment applies to the faction filter chips (`All / Elyos / Asmodian`) on the group
lists if they measure under 36px.

#### 9. `apps/aion2/e2e/mobile.spec.ts` (new)

Playwright at 390×844:

- Bottom tab bar is visible; tapping a wiki tab navigates and marks that tab active.
- Map route: no `ShellSidebar` is rendered, and the Leaflet container measures **≥ 380px** wide
  (today it is ~44px — assert the width, since that is the actual bug, not merely the absence of
  the sidebar).
- Filter sheet opens from its FAB and toggling a marker subtype still filters the map.
- Search sheet opens from its FAB and a query still selects a marker.
- Language and theme controls are reachable inside the More sheet — the regression guard for the
  unreachable-controls bug.
- Wiki routes report `document.documentElement.scrollWidth === 390` (no horizontal overflow).
- Section chips on `/wiki/item` measure ≥ 36px tall.

Plus one desktop-regression block at 1280×800: the tab bar is absent and the sidebar present.

## Data flow

Unchanged. Data loading (`lib/`), routing (TanStack Router) and the `data-contract` types are
untouched. This work is presentation and layout only.

## Error handling

No new error surfaces. `useIsMobile()` reads `matchMedia` synchronously on first render, so the
initial layout is already correct and there is no flash. Sheets close on overlay tap and on route
change. If `env(safe-area-inset-*)` is unsupported it resolves to `0px`, degrading to flush
edges rather than breaking layout.

## Testing

- Live audit at **390×844** across all six routes (`/`, `/wiki`, `/wiki/quest`, `/wiki/npc`,
  `/wiki/item`, `/wiki/$type/$slug`) on the dev server at `http://localhost:15173`.
- The new `e2e/mobile.spec.ts`, plus the existing aion2 suite for regressions. Run with
  `E2E_PORT` set — the aion2 Playwright config defaults to `5173`, which collides with a running
  palworld server.
- **Known pre-existing failure, not caused by this work:** the wiki embedded-map POI test fails
  deterministically on `master`. Reproduce it on `master` before and after so the comparison is
  honest, and report it as pre-existing rather than silently accepting a red suite.
- Desktop regression check at ≥768px: layout visually unchanged from `master`.

## Rollout / isolation

- Work in a git worktree per project convention; integrate back with rebase.
- Review the finished diff with Codex as a second opinion (explicitly requested for this task,
  overriding the standing "no Codex delegation" convention), then verify each finding
  independently before acting on it — implementation itself stays first-party.
