# Map Workspace

Baseline: current AION2 desktop behavior/appearance, except explicit decisions
here, in [Markers](map-markers.md) and [About](map-about.md). Preserve game-owned
coordinates, valid zoom limits, data, marker schemas and artwork.

## Desktop page mode

```text
Shared top navigation
  Left sidebar | Flexible map canvas | Optional About sidebar
```

Fullscreen lower row fills remaining viewport; no document scroll/footer/ICP.
Sidebars own internal scrolling; canvas owns camera and overlays and may shrink
without horizontal overflow. About carries filing information. Each sidebar and
top navigation owns its boundary; no duplicate canvas borders.

Initial adjustable AION2 geometry:

```css
--arkive-map-sidebar-expanded: 20rem;
--arkive-map-sidebar-collapsed: 0;
--arkive-map-about-expanded: 19rem;
--arkive-map-about-collapsed: 0;
```

Left collapse leaves its edge tab; About starts collapsed and takes space from
the canvas when opened. This differs from the encyclopedia icon rail. Canvas
controls stay lower-left for status/coordinates and lower-right for zoom.

## Sidebar and map picker

Preserve order, scrolling, disclosure and show/hide controls: game identity >
map selector > supported display/bulk actions > marker categories. Marker rows
read icon, name, count/progress left-to-right. Category expansion and marker
visibility are separate actions; retain individual/category/bulk visibility.

One map selector at its existing position. Flat for short inventories; group
only real map relationships and add in-menu search when scanning is difficult.
Disambiguate similar names with context; selected map stays identifiable in the
trigger/list. Long names wrap with growing option height and stable icons;
hover text is supplementary. Switching restores destination-map state if present.

## Counts and progress

Configured tracked types show completed/total and expose Mark as Completed in
marker details; others show ordinary counts. Both share the same completion state.

## Search and selection

Search the active map only, including hidden markers. Retain AION2 input/action,
count, scrollable result structure (two columns at reference desktop width),
icon/name, type, applicable summary, coordinates and regional context. Game-only
fields such as spawn data are optional, not universal schema.

Result identity is active-map scoped. Selection reveals a hidden target,
locates/highlights it and opens detail without switching maps. Keep AION2
transitions. Explicit links/results override conflicting remembered view/target,
not unrelated state; ordinary returns restore camera. No cross-map search.

## Return memory

Remember selected map; per-map camera/zoom, marker filters/display switches,
category expansion, sidebar collapse/scroll, active search, selected marker and
supported completion. Hover/animation/temporary overlays remain transient.
Use [State memory](../ARKIVE_STATE_MEMORY_SPEC.yaml) for scope, lifetime and
precedence; no extra account/cross-device guarantee. Tool explicit saving does
not replace map memory/progress. Closing About must not reset map operations.

## Provisional mobile composition

Touch drag/pinch plus zoom; search/filter sheets; marker-detail bottom sheet
with tap copy; optional live pointer coordinates; selected-marker coordinates
remain available. Apply shared safe areas. Basic proposal only, open to redesign.
