# Palworld: Pals nav group + Passive Skills page

**Date:** 2026-07-08
**Scope:** (1) Group the pal-related routes under a "Pals" dropdown in the palworld top nav
(using the shell's new multi-level nav feature). (2) Add a new **Passive Skills** page that
lists every passive skill with its localized description, filterable by a search box.

## Goal

- Top nav collapses Paldeck + Breeding + the new Passive Skills into one **Pals ▾** dropdown,
  keeping the bar tidy (result: Map · Pals ▾ · Database ▾).
- A `/passives` page shows all passive skills (name + description), with a search that filters
  by name/description/id. Reachable from the Pals dropdown (desktop) and the mobile More sheet.

## Data source

`loadPals(lng)` already returns everything needed (no new fetch):
- `bundle.passives: Passive[]` — authoritative list (`id`, `rank`, `effects`).
- `bundle.passivesById: Map<string, Passive>`.
- `bundle.passiveText: Record<string, { name; description? }>` — localized text.
- `fillPassiveDesc(desc, passive)` — resolves `{EffectValue1}`-style placeholders using the
  passive's effect values.

The page's row set is the **union** of ids from `bundle.passives` and `Object.keys(passiveText)`
(so a passive with text but no metadata, or vice-versa, still appears). Name falls back to id;
description falls back to empty.

## Design

### New page — `features/pals/PassivesPage.tsx`

- Loads the pals bundle (per-language, cached). Loading → `PalPageLoading`; error → destructive
  message (same pattern as other catalog pages).
- Builds rows `{ id, name, description }`, filters by the trimmed lowercased query over
  name/description/id, sorts by localized name (`localeCompare`).
- Renders inside `ContentPage active="/passives" title={t('pal.section.passives')} maxWidth="max-w-3xl"`:
  - A search `Input` (`placeholder={t('search')}`) + a result count (`t('resultsCount', { count })`).
  - A bordered card list of `PassiveRow` (reused: `{ name, description }`).
- **No new i18n strings**: reuses `pal.section.passives` (title + nav label, localized in all 17
  locales), top-level `search`, and `resultsCount`.

### Route — `main.tsx`

Add `/passives` → `PassivesPage` (lazy-consistent with the other route imports).

### Nav grouping — `components/TopNav.tsx`

- Extend `NavKey` with `'/passives'`.
- Regroup `items`: `Map (/)`, then a **Pals** dropdown parent
  (`key: 'pals'`, `label: t('nav.pals')`, children: Paldeck `/pals`, Breeding `/breeding`,
  Passive Skills `/passives` with label `t('pal.section.passives')`), then the existing
  **Database** dropdown (Items/Buildings/Technology/Quests). Each child keeps its
  `active: active === '<route>'`.
- New i18n: `nav.pals` group label (one label map `PALS_GROUP_LABELS`, merged for all 17 locales
  like `nav.database`). Value = the game's "Pal(s)" term per locale (CJK use パル/팰/帕鲁/帕魯;
  Latin scripts use "Pals").

### Mobile — `components/BottomTabBar.tsx`

- `NavKey` gains `/passives` (imported type). Add Passive Skills (`/passives`,
  label `t('pal.section.passives')`, an icon e.g. `Sparkles`) to the **More** sheet list.
- `activeKey(pathname)` maps `/passives` → `/passives`.

Desktop top nav is `hidden md:flex`; the Pals dropdown is desktop-only. Mobile reaches the page
via the More sheet.

## Testing

- **E2E (`e2e/nav.spec.ts`, extend)** desktop: the **Pals** dropdown opens and navigates to
  Passive Skills (`/passives`); the passive page renders rows and the search input filters the
  list (type a token, row count drops; clear, rows return).
- **Regression**: existing nav/smoke/mobile e2e pass (except the known pre-existing ko-KR smoke
  failure). `build:palworld`, `lint:palworld`, `check:shell`, package typechecks pass.
- **Manual**: browser at 1280px — Pals dropdown lists Paldeck/Breeding/Passive Skills, the
  passive page lists all passives with descriptions, search narrows results, group highlights
  while on a child route.

## Non-goals

- No changes to the passive data pipeline / `tools`. No per-passive detail page. No rank/effect
  breakdown UI (name + description only). aion2 untouched. map-shell unchanged (the dropdown
  feature already exists).
