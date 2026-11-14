# Live Visual Audit: 2026-11-14

Status: desktop reference observations, clarified 2026-11-15 before stage 4 approval.
This record compares the deployed pages with the confirmed product topics. It
records evidence and conflicts; it does not authorize production changes.
Mobile encyclopedia composition remains deferred by product decision.

## Evidence set

Final desktop captures are stored in the ignored review directory:

- `output/playwright/control-review/all-games-card-reference-final.png`
- `output/playwright/surface-audit/portal-tools-desktop.png`
- `output/playwright/surface-audit/ro3-talents-desktop.png`
- `output/playwright/surface-audit/aion2-map-desktop.png`

The live deployed DOM and computed styles take precedence over older local
components when they disagree.

## Surface results

| Surface | Live evidence | Confirmed reference | Stage 4 work after approval |
| --- | --- | --- | --- |
| All Games | 1440px uses a 23rem search capsule, a continuous type filter, five card columns, 1.25rem grid gap, 255px cards, 4:3 covers, and 34px bookmark controls. | [Catalog controls preview](catalog-controls-preview.html) and [catalog rules](catalogs.md). | Reconcile the implementation with the six-game live inventory and add empty/loading/pending/favorite states. |
| Tool Library | The inspected deployment shows a visible Tool Library heading, game-specific filter buttons, six tools, direct tool links, and associated game labels. | [Tool Library pattern](tool-library-pattern.md): no visible title, All/types/Other filters, game-name search, independent targets. | Reconcile the deployed differences with the confirmed rule; the observation does not reopen the product decision. |
| Encyclopedia | Ragnarok 3 uses a 59.5px flush game shell with Arkive, a game chip, left-aligned Home/Encyclopedia/Build Manual links, an 11.5rem directory, and content-specific records. | [Encyclopedia](encyclopedia.md) and [RO3 shell preview](catalog-controls-preview.html). | Reconcile current content controls and game-owned schemas with the shared shell. Mobile remains deferred. |
| Map | AION2 uses the shared game shell, a left marker directory, map selector and bulk actions, map-scoped search, lower-left coordinate/status area, lower-right zoom controls, and an About entry. | [Map workspace](map-workspace.md), [map preview](map-shell-preview.html), and [map markers](map-markers.md). | Verify exact shell widths, game data groups, marker density, return memory, and About lifecycle before implementation edits. |
| Homepage footer | The root URL, checked 2026-11-15, has a filled blue wave edge, sea gradient, white Arkive artwork, gold boat, four centered links, and right-side copyright/ICP metadata. The `#games` catalog has the ordinary footer. | [Portal](portal.md), [copied HTML/CSS](home-footer-copy.html) and the embedded catalog preview. | Reconcile the older canonical wording with the two footer roles; preserve the homepage design. |
| Ordinary footer | Ordinary-page references have a neutral footer and thin voyage layer. Four centered site links are the confirmed rule, even where a deployed page lacks them. | [Shared visual foundations](visual-direction.md#shells-footers-and-boundaries). | Reconcile ordinary pages with their neutral role; do not use the homepage sea design. |

## Shared foundation results

The live pass records these values at the inspected desktop viewport:

- Shared catalog search/filter row: approximately 54.7px outer height, with
  42.5px internal options and arrow controls.
- The live All Games search measured 23rem (391px) wide at 1440px; the
  filter outer height was about 52.7px versus search 54.7px. The reviewed
  sample intentionally equalizes both to 3.2rem. Search includes its arrow.
- All Games cards: 21.25px radius, 255px desktop card width, 232.6px by
  174.5px cover at the inspected viewport, and a 21.25px grid gap.
- The All Games reference uses five columns, a roughly 255px by 255.5px
  card, 1px border, .6rem .6rem .75rem padding, and a 34px bookmark action.
  These measurements are All Games evidence, not universal Tool Library tokens.
- Game shell: 59.5px height, 34px desktop horizontal padding, 42.5px game
  chip and utility controls, label-sized navigation items.
- Ordinary page footer: 53.125px height; voyage layer above it is 34px.
- Root homepage footer: 5.625rem wave canvas and a separate sea row with
  .375rem top / 1.375rem bottom padding. Its filled wave must not be replaced
  by the ordinary footer's 34px thin-line layer.

These are measurements, not universal tokens. The confirmed equal-height
catalog sample uses 3.2rem for both outer controls despite the small live
measurement difference. [Shared visual foundations](visual-direction.md) scopes
the roles and records their pending canonical migration.

## Acceptance boundary

The desktop observations and samples support review of layout, control
relationships, card geometry, footer roles and shells. State specimens illustrate
possible loading/empty/pending/favorite-error appearances; they do not verify the
real authenticated flow or its failure recovery. This is not completed visual
acceptance of every route, theme or state. Remote failures, child routes and
deferred/provisional mobile surfaces remain outside this evidence set. See
[adoption](adoption.md) for the approval boundary and remaining validation.
