# Shared Page Skeleton

## Flow and scrolling

Ordinary page: shared top navigation > content > ordinary footer.
Use a minimum-viewport-height vertical flex root and growing content so the footer
stays low on short pages and follows long content. Never fix it over content.
One primary vertical scroller; sticky elements declare that scroller. Dialogs
and detail panels may own internal scrolling. No horizontal document overflow.

| Surface | Content after top navigation |
| --- | --- |
| Homepage | Carousel > mixed entry shelf > selected tools > popular posts > homepage footer |
| Catalog | Toolbar > results > pagination/status; Tool Library has no visible title/intro |
| Game overview | Game identity/navigation > optional overview > game content |
| Encyclopedia | Left directory beside right controls + game-owned content |
| Tool | Task controls/work area > results/status > explicit saving where supported |
| Community | Existing forum content; detailed redesign deferred |
| Map | Fullscreen lower row: sidebar, flexible canvas, optional About; no ordinary footer |

A game context is part of its shell, not automatically another header row.
Page identity is optional: never add a heading/intro where the topic omits it.
Loading, empty and error belong to the page's content/status region.

## Ownership and geometry

Shell owns brand/navigation/utilities; page owns composition, toolbar placement,
content and status; shared controls own semantics/states. Game adapters own data,
assets and routes. Use foundation width roles: reading 72ch, standard 80rem,
wide_data 96rem, workspace available viewport. Pick by content; do not invent
another scale. Shared appearance lives in [visual foundations](visual-direction.md).

Dividers are optional, with at most one owner per boundary. A shell, toolbar or
footer does not automatically require a border; adjacent regions must not draw
duplicate lines. Use layout gaps, not lines, to separate controls and results.

## Responsive boundary

Ordinary mobile pages use the shared mobile shell and clear safe areas/bottom
navigation. Reflow is content-driven, with reachable independent actions. Map
mobile is provisional in [Map workspace](map-workspace.md). Encyclopedia mobile
is deferred; do not derive a drawer or rail from the desktop specification.
Exact content layouts and sidebar/sticky dimensions belong to the page topic.
