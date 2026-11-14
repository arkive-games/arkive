# Visual Regression Acceptance

This is an acceptance plan, not a report that all checks passed. Stage 5 uses
the component gallery and the live routes as two separate checks:
the gallery isolates shared geometry and states; live routes confirm that page
composition does not override those decisions.

## Required captures

| Surface | Desktop | Narrow viewport | States |
| --- | --- | --- | --- |
| Shared component gallery | 1440 × 1000 | 390 × 844 | Light and dark, default/focus/selected/invalid/disabled/loading/error |
| Portal home | 1440 × 1000 | 390 × 844 | Light and dark, short and long content |
| All Games | 1440 × 1000 | 390 × 844 | Search, type filter, empty result, favorite action |
| Tool Library | 1440 × 1000 | 390 × 844 | All/Other filters, game-name query, empty result, favorite failure |
| AION2 map | 1440 × 1000 | 390 × 844 | Expanded/collapsed sidebar, map selector, search, About closed/open |
| Palworld map | 1440 × 1000 | 390 × 844 | Expanded/collapsed sidebar, map switch, search, completion counts |

Below `md`, encyclopedia composition remains deferred by product decision. A
mobile encyclopedia capture is therefore not an acceptance requirement until
that redesign is opened.

## Acceptance rules

- No page creates document-level horizontal overflow at either viewport.
- One surface owns each boundary line; a toolbar and its result region do not
  draw duplicate separators.
- Search and filter controls use the shared radius, input fill, focus ring, and
  selected-filter roles.
- Loading reserves expected card/toolbar space. Errors retain the page structure;
  natural wrapping or a different result count may change document height.
- A failed search preserves its query and filters. A failed favorite preserves
  the previous state and exposes retry.
- Short pages place the compact footer at the viewport bottom while keeping it
  in normal document flow.
- Light/dark changes preserve text, control-boundary, and focus contrast.
- Reduced motion removes decorative transforms without hiding state changes.

## Evidence

Desktop reference observations are recorded in [live visual audit](live-visual-audit.md).
Use the [shared visual roles](visual-direction.md) and the directly
[copied homepage footer](home-footer-copy.html) to interpret those captures.
They do not certify every listed surface, viewport, theme or functional state.

Keep only the final capture set for a review. Store temporary screenshots and
Playwright logs in ignored output directories and remove intermediate variants
after acceptance. The browser smoke check is a functional gate; this matrix is
the visual gate and requires a human comparison against the accepted reference.

## First baseline observations

The first desktop and narrow captures on 2026-11-12 established these findings:

- Tool Library footer placement, desktop three-column cards, mobile one-column
  cards, search, and filter controls are structurally usable. The mobile bottom
  navigation overlays the viewport while the page remains scrollable; the final
  safe-area pass should confirm that the last card and footer can be brought
  fully above it.
- AION2 and Palworld keep the agreed map control positions: search at the top,
  coordinates at lower left, zoom at lower right, and mobile map actions above
  the bottom navigation. No document-level horizontal overflow appeared in the
  captures.
- AION2 and Palworld marker labels become visually dense at the loaded default
  zoom. This is a map data-density and LOD decision, not a shared radius/color
  decision; it remains a follow-up for each game's map configuration.
- Palworld tiles arrive after the data and shell. Capture baselines after tiles
  settle so a loading frame is not mistaken for a blank-map regression.

These observations do not freeze the visual style. They identify which issues
belong to page/map configuration and which belong to the shared component layer.
