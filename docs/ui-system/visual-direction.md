# Arkive Shared Visual Foundations

Updated 2026-11-15. Confirmed visual rules, scoped reference dimensions and open
items; no production conformance is claimed; scoped canonical migration is recorded below.

## Authority and reading scope

Preserve the accepted [live homepage](https://arkive.games/); copy deployed
structure/styles rather than stale local code or a lookalike. Explicit product
decisions govern intentional differences. Read only the needed canonical
[UI foundation](../ARKIVE_UI_FOUNDATIONS_SPEC.yaml) or
[color](../ARKIVE_SITE_COLOR_SYSTEM.yaml) sections. Unaffected rules stand;
the approved stage 4 local batch reconciles the scoped rules below.

## Identity, typography and color

- Warm, youthful, reliable, information-dense. Game logos/artwork/schemas may
  differ; shared controls keep common meaning. AION2: sky fantasy; other game
  personalities open. Use real [wordmark assets](assets/arkive/README.md).
- Keep 17px root, Noto Sans SC/TC Variable and Tailwind type scale/role defaults;
  content floor `text-xs`. Dense content must not shrink text to fit. A type
  role does not require a visible heading.
- Quiet neutral surfaces; preserve reviewed neutral active navigation/filter
  states and warm login/search-arrow accents in their contexts. Decoration does
  not define feedback colors. Existing semantic roles, contrast and light/dark
  legibility apply; no new universal palette. Preserve meaningful focus.

## Shape, height and spacing

| Role | Decision / reference | Scope |
| --- | --- | --- |
| Catalog search + filter | Equal outer height, 3.2rem in sample; pill radius | Reviewed desktop composites, not all fields/selects |
| Internal options/arrow | 2.5rem sample | Visual size; keep adequate hit targets |
| States of one control | Same radius/height/reserved slots | No silhouette shift on hover/focus/selection/disabled/pending |
| All Games cards | 1.25rem radius/gap; 4:3 cover | Desktop reference, not all cards/tools |
| Catalog toolbar to All Games cards | 1.5rem clear sample gap | No overlapping controls/lines |
| Ordinary fields, popups, dense panels | Existing foundation defaults | Shared Card does not globally become 1.25rem |
| Homepage composition | Preserve deployed artwork/tray/shelf/carousel geometry | No universal decorative template |

Existing spacing steps/content-width roles remain the only scales. Layout owns
inter-region gaps; controls own padding. Preserve real alignment/right clearance.
Measured widths at one viewport are not fixed widths for every screen.
Catalog search implementation comes from `CatalogSearchInput`, including its
round arrow action; encyclopedia collapse uses the shared panel-frame icon.
Do not recreate either control in individual game pages. Omit interface
instructions, implementation notes and visible result-total summaries site-wide.

## Shells, footers and boundaries

| Surface | Rule |
| --- | --- |
| Portal header | Preserve floating capsule and utility grouping |
| Game header | Flush top; wordmark/game chip + label-sized game links left, utilities right. Desktop reference: 3.5rem height, 2rem horizontal padding, 2.5rem chip |
| Root homepage footer | Blue filled-wave/sea, white wordmark, centered About/Contact/Updates/Settings, right legal metadata; use [copied HTML/CSS](home-footer-copy.html) |
| Ordinary footer | Neutral; original wordmark, centered same four links, legal metadata; includes `#games`, Tool Library and ordinary game pages |
| Fullscreen map | No ordinary footer; filing in About |

Exactly two footer designs; map omission is not a third. Root `/` differs from
`#games`. The footer copy is static, excluding original dialogs/scroll voyage.
[Page skeleton](page-skeleton.md) owns bottom placement, scrolling and optional
single-owner dividers; do not add a toolbar line or redraw the homepage footer.
Exact surface measurements remain in [Live audit](live-visual-audit.md).

## Stage 4 migration map

| Canonical owner | Current local reconciliation |
| --- | --- |
| Foundations `shape.rules` / `control_geometry` | Reviewed pill/equal-height catalog and All Games card roles, preserving ordinary form/popup/touch defaults |
| Foundations `shared_component_contracts.desktop_brand_block` | Deployed wordmark/game-chip shells, not old two-line brand |
| Site `product_model.home_page.footer`; foundations `compact_site_footer` | Two reviewed footer roles, replacing old four-track home/metadata-only ordinary wording; no mandatory separator |
| Color `brand_direction` / navigation tokens | Scope neutral active chrome/warm decoration separately from semantic feedback; retain contrast |
| Older galleries/reconciliation records | Historical/behavior evidence, not final art baseline or new implementation authorization |

## Open scope and handoff

Sidebar dimensions remain adjustable in [Encyclopedia](encyclopedia.md) and
[Map workspace](map-workspace.md). Encyclopedia content/detail is contextual;
its mobile composition is deferred. Map mobile and tool-card reflow/truncation
remain provisional. Real state/theme/cross-game acceptance remains partial; see the verified local batch in Adoption.
[Adoption](adoption.md) owns next work and the stage 4 permission boundary.
