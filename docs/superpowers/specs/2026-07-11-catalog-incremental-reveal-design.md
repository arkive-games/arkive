# Palworld Catalog Incremental Reveal (auto-scroll pagination)

**Date:** 2026-07-11
**Scope:** `frontend/apps/palworld` — items & buildings list pages

## Problem

The items page mounts ~1,900 tiles (2,433 items minus 525 illegal rows), each
wrapped in a Radix HoverCard root; buildings mounts 494. All catalog data is
static JSON loaded client-side in one bundle, so this is purely a DOM-size /
first-paint problem — there is no network pagination to win.

## Decision: incremental reveal, not discrete pages

Discrete pages were rejected: they add clicks with zero data-fetch benefit,
and they interact badly with the live search + category-chip filtering that is
the primary navigation on these pages (every keystroke would invalidate the
current page). Full virtualization (`@tanstack/react-virtual`) was rejected as
overkill at this scale — responsive column counts complicate grid
virtualization and it breaks in-page Ctrl+F; it remains the escalation path.

## Design

`useIncrementalList(list, storageKey?)` in `features/catalog/`:

- Renders `list.slice(0, count)`; `count` starts at 160 (~20 rows of the
  densest 8-col grid) and grows by 160 per reveal.
- An `IntersectionObserver` sentinel (`RevealFooter`) below the grid with
  `rootMargin: 800px` reveals the next chunk before the user reaches the
  bottom. The sentinel is keyed by the shown count so it remounts after each
  reveal; a remounted observer re-reports intersection immediately, chaining
  reveals until the sentinel leaves the margin.
- The footer renders a localized **Show more ({{count}})** button
  (`catalogShowMore`, `SHOW_MORE_LABELS` in `i18n.ts`) as the manual fallback:
  keyboard users, no-IntersectionObserver environments, deterministic e2e.
- `count` resets to the initial chunk when the list identity changes (query /
  category / language). The transition from the empty pre-load list to the
  first populated list does **not** reset, so restored depth survives the
  async bundle arrival.
- With a `storageKey`, the reveal depth persists in
  `sessionStorage` (`palworld.reveal.<key>`) so list → detail → back restores
  enough tiles for browser scroll restoration to land. This closes the classic
  infinite-scroll back-navigation weakness.
- The "{{count}} items / buildings" label keeps showing the **matched** total,
  not the rendered count (`item-count` / `building-count` testids).

## Testing

`e2e/reveal.spec.ts`: capped initial mount, Show-more growth, wheel-scroll
auto-reveal, small-category filter removes the control + reset on clear,
depth restore across back-navigation, buildings parity. Assertions are
growth-based (`>=`) because clicking the button scrolls it into view, which
legitimately also trips the sentinel. `nav.spec.ts`'s chip-filter test now
compares the matched-total label instead of rendered tile counts.
