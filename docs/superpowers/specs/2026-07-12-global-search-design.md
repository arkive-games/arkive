# Global Search Widget — Design

**Date:** 2026-07-12
**Scope:** frontend (`packages/map-shell`, `packages/ui` consumers, `apps/aion2`, `apps/palworld`)
**Request:** "In the topbar of both sites, add a global search widget. It is similar to the map
search, but can search everything in the site. Do not use fuzzy."

> Note: designed and approved autonomously (no interactive user available this session).
> Decisions below record the rationale that would otherwise have been clarified interactively.

## Goal

A single search entry point in the shared topbar of both apps that finds **any entity on the
site** — not just the markers of the currently open map — and navigates to it. Matching
semantics mirror the map search (MiniSearch, prefix matching, Latin/digit/CJK tokenizer) with
**fuzzy matching disabled everywhere** (explicit user constraint).

## Interaction model (approach decision)

**Command-palette dialog** (approaches considered: inline topbar input + dropdown; dedicated
`/search` page — rejected for topbar space, missing keyboard-nav infra, and navigation
heaviness respectively):

- A ghost **trigger button** in the topbar right cluster: search icon + localized placeholder
  text (text hidden below `lg`, icon-only) + a `Ctrl K` kbd hint on desktop.
- **Ctrl/Cmd+K** toggles the dialog from anywhere.
- The dialog is `CommandDialog` from `@gamemap/ui` (cmdk), with `shouldFilter={false}` — cmdk
  provides list rendering, arrow-key navigation, Enter-to-select; **MiniSearch provides all
  matching/ranking** (cmdk's own fuzzy-ish filter is bypassed).
- Typing shows up to **50 results**, displayed **grouped by content type** (`CommandGroup`),
  groups ordered by their best-scoring hit, hits within a group in score order. Each row:
  optional icon, optional monospace id chip (e.g. Paldeck number), name, and a muted detail
  line (category / map name).
- Selecting a result **navigates** to the entity and closes the dialog.
- Empty query → hint/empty state; while sources load → loading row; a failed source is
  tolerated (its entries are simply absent; other groups still work).

## Architecture

### Shared component: `packages/map-shell/src/GlobalSearch.tsx`

Headless w.r.t. routing and i18n, like the rest of map-shell. Apps supply data sources,
localized labels, and navigation.

```ts
export type GlobalSearchEntry = {
  id: string        // unique within its source
  name: string      // localized display name (indexed)
  idLabel?: string  // e.g. Paldeck "No.011" (indexed)
  detail?: string   // muted secondary text (category label, map name…) — not indexed
  iconUrl?: string
}

export type GlobalSearchSource = {
  key: string       // stable group key, e.g. "pals", "wiki-npc", "markers"
  label: string     // localized group heading
  load: () => Promise<GlobalSearchEntry[]>  // lazy; called on first dialog open
}

export type GlobalSearchProps = {
  sources: GlobalSearchSource[]
  onSelect: (sourceKey: string, entryId: string) => void  // app navigates + may close
  labels: { button: string; placeholder: string; empty: string; loading: string }
  /** Current language — cache key; language change discards loaded entries. */
  lang: string
}
```

Behavior:

- **Lazy loading:** on first open per `lang`, run every `source.load()` in parallel; render
  results as sources settle. Cache loaded entries keyed by `lang` for the component's
  lifetime (the underlying app loaders already cache per language too).
- **Index:** one MiniSearch over all loaded entries. `fields: ["name", "idLabel"]`,
  `storeFields: ["id", "sourceKey"]`, search options `{ prefix: true, fuzzy: false,
  combineWith: "AND" }`. Tokenizer = the map search's Latin-run/digit-run/per-CJK-char
  tokenizer with leading-zero stripping, **extracted** from `SearchPanel.tsx` into
  `packages/map-shell/src/searchTokenizer.ts` and reused by both (no behavior change to the
  map search).
- **No fuzzy anywhere** — including the numeric-query path (prefix still applies).
- Query debounced ~200 ms (same as map search).

### Topbar slot

`ShellTopBar` gains an optional `search?: ReactNode` prop rendered at the start of the
right-side cluster (before language/theme switchers). Both app topbars pass the wired
`GlobalSearch` there.

### App wiring — palworld (`apps/palworld/src/components/GlobalSearchWidget.tsx`)

Sources (all reuse existing per-language cached loaders; labels via `t()`):

| source | data | idLabel | navigate |
|---|---|---|---|
| pals | `loadPals(lng)` → `text[id].name` | Paldeck no. | `/pals/$id` |
| active skills | `buildActiveSkills(bundle)` | — | `/active-skills/$id` |
| passives | bundle passives + passive text | — | `/passives` (list; no detail route) |
| items | `loadItems(lng)` | — | `/items/$id` |
| buildings | `loadBuildings(lng)` | — | `/buildings/$id` |
| technology | `loadTech(lng)` | — | `/technology?tech=<id>` (existing param) |
| quests | `loadQuests(lng)` → `text[id].title` | — | `/quests/$id` |
| markers | `loadMarkers(mapId, lng)` for each map in `maps.json` | — | `/?map=<mapId>&q=<name>` (existing deep link seeds the map search) |

Navigation uses TanStack `router.navigate`. The map deep link must work when already on
`/` — verified in implementation; fall back to a full-page navigation if the route doesn't
react to search-param-only changes.

`TopNav` is desktop-only (`hidden md:flex`); the mobile `BottomTabBar` is **out of scope**
for this iteration (request says topbar).

### App wiring — aion2 (`apps/aion2/src/components/GlobalSearchWidget.tsx`)

Sources:

| source | data | navigate |
|---|---|---|
| wiki npc / quest / item (3 groups) | `loadWikiIndex(type)` ids + names from i18n ns `wiki/<type>` (`i18n.loadNamespaces` then resource bundle) | `/wiki/$type/$slug` (router navigate) |
| markers (all 10 maps) | i18n namespaces `markers/<map>` — the locale files are keyed by marker id, so **no raw `markers/<map>.json` fetch is needed** (~1 MB of locale JSON per language, lazy, vs 2.3 MB raw) | `/?map=<mapName>&marker=<id>` |
| | map display names for the detail line via the `maps` namespace | |

aion2's map page reads deep-link params **once on mount** from `window.location`
(`appliedDeepLink` guard), so marker results use a **full-page navigation**
(`window.location.assign`) — reliable both from the wiki and when already on the map. Wiki
results use client-side router navigation.

## Error handling

- A source whose `load()` rejects logs to console and contributes zero entries; the dialog
  still works with the remaining sources.
- Entries with empty localized names are skipped at source-build time.
- Dialog open before data settles shows the `loading` label; empty result set shows `empty`.

## i18n

New UI strings (button/placeholder/empty/loading + group headings):
- palworld: bundled string resources (en-US baseline + zh-CN/zh-TW at minimum; other locales
  fall back to en-US per existing pattern).
- aion2: `public/locales/<lng>/common.yaml` for all 4 locales (en-US, zh-CN, zh-TW, ko-KR).
Group headings reuse existing localized nouns where available (e.g. palworld `pal.title`,
`item.title`; aion2 `wiki/taxonomy:types.<type>.name`).

Language switch invalidates the widget's cache; next open re-loads and re-indexes.

## Testing

- **Unit (vitest, map-shell):** tokenizer extraction keeps `SearchPanel` tests green; new
  `GlobalSearch` tests — builds index from multiple sources, prefix match works, **typo'd
  query returns nothing (fuzzy off)**, CJK query AND-combines, numeric idLabel prefix works,
  grouping/order, `onSelect` payload, per-language cache invalidation, failed source
  tolerated.
- **e2e (playwright, both apps):** open via button and via Ctrl+K; type a known entity name;
  Enter/click navigates to the detail page (palworld: a pal; aion2: a wiki NPC and a marker
  deep link landing on the map).

## Out of scope

- Mobile entry point (palworld `BottomTabBar`) — follow-up.
- Fulltext search of page/description bodies — only names + id labels are indexed.
- Search-result URLs (`/search?q=`) — palette is ephemeral UI.
