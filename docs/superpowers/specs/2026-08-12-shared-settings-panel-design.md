# Shared settings panel

**Date:** 2026-08-12
**Issue:** [#14](https://github.com/arkive-games/arkive/issues/14) item 2 — "Local-data controls were
removed from all four games with no replacement"

## Problem

`406813ef` dropped the `localDataStrings` prop from `ArkiveSiteInfo` and its four call sites, so
`LocalDataControls` became reachable only from `meta` and `lostark`. aion2, palworld, sts2 and
vrising store completed markers, filter state, view preferences and engine choice, and a visitor
now has no way to see or clear any of it.

The removal was deliberate — the About panel is the wrong home for a destructive control. This
design gives those controls a home that is right, and takes the two preferences that were already
scattered across the top bar with them.

A second, older problem is folded in. Theme and language are global by construction: both travel in
a cookie scoped to `.arkive.games` / `.tc-imba.com` so that choosing 简体中文 on Palworld does not
leave AION2 in English (`state-memory/src/language.ts:11-21`). That is right as a default and wrong
as an absolute — a reader may want one game in the source language and the rest in their own. There
is currently no way to express that.

## Model

Two layers:

```
effective = site override ?? global ?? browser detection
```

**The site override needs no game identifier.** Each game is a separate origin, so `localStorage` is
already partitioned per game; the override is simply this origin's record. Global is the existing
cookie, which is the only transport that crosses origins.

| Writer | Writes |
| --- | --- |
| Game top bar (globe / moon) | the site override, **and** global when global is still unset |
| Panel › General | global only |
| Panel › *&lt;game&gt;* | the site override, plus a "Follow general" reset |
| meta top bar, meta panel | global only — meta has no override layer |

Seeding global on first write is what keeps today's behaviour intact. A first-time visitor who picks
简体中文 on Palworld writes both layers, so AION2 follows. A later change on Palworld finds global
already set and moves only Palworld.

### Limitation, recorded deliberately

General cannot clear another game's override. Separate origins, no cross-origin write. Setting
General on meta moves global; a game that already overrides keeps its own value until it is reset
from that game's own panel. The panel says so, rather than implying a reach it does not have.

## Components

### `@gamemap/state-memory` — `preferences.ts`

Owns the override records and the pure resolution helpers. This package already owns `language.ts`,
the record definitions and the cookie transport, so the second layer belongs beside the first.

- `themeOverrideRecord`, `languageOverrideRecord` — `memoryPolicy.userPreference`, device scope,
  therefore per origin.
- `resolvePreference({ override, global, fallback })` — precedence, one place.
- `writeFromSiteControl(...)` — the seed-on-first-write rule, one place.

### `@gamemap/ui` — `arkive-theme-storage.ts`

Grows from `{ get, set }` to also expose `readLayers`, `setGlobal`, `setOverride` and
`clearOverride`. `ThemeProvider`'s existing `storage` contract is a structural subset of the new
one, so every current call site keeps working unchanged.

### `@gamemap/map-shell` — `ArkiveSettingsPanel`, `ArkiveSettingsDialog`

Pure presentation: values, callbacks and strings are injected, so the `check:shell` purity gate
(no `localStorage`, `fetch`, env or i18n named anywhere in the package, tests and comments included)
still passes. `LocalDataControls` moves inside the panel as its third group rather than being
reimplemented.

Layout is a single scroll with three grouped headings, not a category rail. The panel holds about
eight rows; a rail is chrome built for thirty. More importantly, one scroll keeps both layers on
screen at once, and "this game is overriding general" is the one thing a two-layer model has to
communicate without being clicked.

```
┌ Settings ─────────────────────────────────┐
│ GENERAL — EVERY ARKIVE SITE               │
│   Theme      [ Auto | Light | Dark ]      │
│   Language   [ 简体中文            ▾ ]     │
│                                           │
│ PALWORLD ONLY                             │
│   Theme      [ Follow | Light | Dark ]    │
│   Language • [ 日本語              ▾ ]     │
│              Overriding general           │
│                                           │
│ DATA ON THIS DEVICE                       │
│   … LocalDataControls …                   │
└───────────────────────────────────────────┘
```

Strings follow the `localDataStringsFor` precedent — a catalogue bundled in map-shell with an
English fallback — extended to en-US, zh-CN, zh-TW, ja-JP and ko-KR.

### Entry points

**Desktop.** `ShellAccountMenu` gains a Settings row in every state. The signed-out button gets the
same hover/focus wrapper the signed-in trigger already uses (`ArkiveMapTopBar.tsx:248-251`), so
clicking still opens the sign-in dialog in one click while hovering reveals Settings. No caret, no
extra click on the primary call to action. The top-bar globe and moon stay exactly where they are.

**Auth disabled.** `resolveAuthConfig` falls back to `ARKIVE_PRODUCTION_API_URL`, so this is local
development only, never production. The existing `fallback` prop on `ArkiveAccountControl` carries a
settings-only trigger for that case.

**Mobile.** A Settings row in the `ShellBottomNav` More sheet, opening as a drill-down pane —
the mechanism the language row already uses — and **not** as a Dialog inside the Sheet. A portalled
dialog nested in a sheet has its pointer events swallowed by the overlay and goes dead rather than
merely looking wrong. The sheet keeps its existing language row and theme control, mirroring the
desktop bar.

## Testing

- Unit: layer precedence; seed-on-first-write on both a virgin and an already-seeded global;
  override clearing; cookie and localStorage fallbacks.
- Component: the override marker and the "Follow general" reset; the Settings row present in all
  three account states; the anonymous trigger still signing in on click.
- The existing `check:shell` and `check:engine` purity gates.

## Out of scope

- Moving palworld's map-renderer choice into the panel. The panel takes an optional slot for
  game-owned rows, but no game uses it yet.
- Issue #14 items 1, 3, 4, 5, 6 and 7.

## Changelog

None. `CLAUDE.md` states that site-wide shared UI is not stamped into an individual game's history,
and this ships identically to all six sites. Issue #14 item 7 notes that this policy is unsettled
for shared components; this change follows the rule as written rather than pre-empting that
decision.
