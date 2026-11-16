# Encyclopedia

## Desktop shell and search

Reference: [Ragnarok 3 Talents](https://ro3.arkive.games/talents).
After shared top navigation: left category/subsection directory beside right
category filters/search, then game-owned content. Do not repeat the selected
category as a right-side title/intro. Search only the current category, e.g.
Talents searches talents, not the whole encyclopedia.
Use the shared capsule search and panel-frame directory toggle from the visual
foundations. Do not add click/hover tutorials, implementation commentary or
visible result-total summaries. Actual game descriptions and progress remain.

Reuse the actual game shell, not an older local approximation: wordmark, game
icon/name chip, then game-owned links (RO3: Home, Encyclopedia, Build Manual),
with current section active. Flush-top geometry and ordinary footer follow
[Visual foundations](visual-direction.md#shells-footers-and-boundaries).

One primary document scroller; detail surfaces may scroll internally. Use the
wide-data foundation width for the desktop directory and content together,
matching the RO3 skills page rather than centering the directory in a narrower
standard-width column. Keep the shared page gutter at the viewport edges.
Shared states come from [States](state-matrix.md);
loading reserves geometry and errors retain query/filters.

The Palworld pal catalog shows 64 records per desktop page and 24 per phone
page, with independent resumable paging. Desktop facets share one muted pill
track on the left, with the shared capsule search on the right. Both use the
catalog control geometry and text-sm labels. Elements, work suitability,
reaction, size and sleeplessness remain directly available on the same row;
keep the drop picker as a peer entry. Mouse hover opens a facet without stealing
input focus, and leaving the trigger/panel closes it after a short transit delay.
Keyboard focus, Arrow Down and Escape work, while touch opens by activation.
Only one facet panel opens at a time. Show aligned options and selection checks,
without redundant visible panel titles. Selected facets remain visible below
with individual removal and Clear filters. Pagination belongs below the results;
search and filter changes start at page one. Do not add a grid/list switch.
Keep original Pal thumbnails and compact metadata/name regions.
Palworld finite filter groups reuse the catalog facet primitives from
`@gamemap/ui` across Paldeck, skills, items, buildings, merchants, quests,
raids, research and fishing. Row counts follow measured localized content,
including selection indicators, rather than category-specific column counts.
Active Skills supplies element, type and skill-fruit choices on the left and
keeps category search on the right; it must not fork the interaction or styling.
Facet popover sizing and balanced row layout follow
`catalog_controls_and_copy.facet_popovers` in the
[UI foundations](../ARKIVE_UI_FOUNDATIONS_SPEC.yaml): content-sized surfaces,
a 22rem outer width cap, and automatic row counts instead of per-facet columns.
Searchable drop results use the documented large-set exception.
The directory uses collapsible parent groups with indented child links and
game-owned artwork. When the quiet directory collapses, retain each parent's
artwork and directly available child icon links with accessible names/tooltips.
Parent toggles still fold their own children, without navigation or filter reset.
Use a simple directional chevron for the overall expand/collapse control.
Encyclopedia remains the highest directory level, with its original text-2xl
title and orange leading bar. Align that title box with the desktop toolbar top;
both inherit the shared content-page top-space token below navigation.

## Desktop sidebar

Start expanded with icons, labels and relevant children. Adjustable provisional
values, initially calibrated from RO3:

```css
--arkive-encyclopedia-rail-expanded: 11.5rem;
--arkive-encyclopedia-rail-collapsed: 4rem;
```

Collapse shows only primary icons, hides labels/inline children and releases
content width. Keep expand control, selected indication and accessible icon
names. Presentation collapse/loading must retain selected branch, search and
filters. Hide the directory scrollbar while retaining wheel, touch and keyboard
scrolling so long game directories remain fully reachable.
Structural reference: supplied [ZCOOL](https://www.zcool.com.cn/recommend#tab_anchor)
screenshots; do not borrow its branding.

## Details and returning

Content schemas, graphs/tables/cards, detail page/panel/dialog and information
layout remain game/content-specific. Related-record links remain open.
Returning or closing detail restores game/category/subsection, query, filters,
page/reveal depth and stable scroll position. Restore data/depth before position.
Use `session_context` and precedence/lifetimes in
[State memory](../ARKIVE_STATE_MEMORY_SPEC.yaml); no extra cross-device promise.

## Mobile

Composition is deferred. Do not specify a drawer, icon rail, toolbar reflow or
content schema from the desktop design. Existing mobile pages are retained references, not a finished shared standard
or authorization to reconstruct them now.

## Local adoption status

The six scoped game spaces use the shared desktop directory/search shell and
applicable return-memory adapters. Local closeout covers 47 category routes for
shell/overflow and representative collapse/query/reload/no-match flows; it does
not certify every record, future category or mobile design. New categories must
bind their own browsing scope and readiness before scroll restoration.
See [Adoption](adoption.md) for remaining acceptance and the
[implementation archive](reconciliation.md#local-implementation-evidence-through-2026-11-15)
for per-game coverage, migration details and historical STS2 fixture limitations.
