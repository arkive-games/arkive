# Arkive Shared Visual Foundations

Preserve the accepted [live homepage](https://arkive.games/) and actual deployed
chrome. Copy existing structure/assets; apply explicit product decisions only
where needed. Game art/data layouts remain game-owned. AION2's identity is sky
fantasy; other game identities are contextual, not new universal chrome.

Canonical owners: [UI foundations](../ARKIVE_UI_FOUNDATIONS_SPEC.yaml) for type,
spacing, shape, layers and motion; [color system](../ARKIVE_SITE_COLOR_SYSTEM.yaml)
for values/contrast. Read only relevant sections. Use the real
[wordmark](assets/arkive/README.md), not recreated text or artwork.

## Shape, height and spacing

| Role | Confirmed scope |
| --- | --- |
| Catalog search + filter | Same outer height (3.2rem reference), pill silhouette; round warm arrow (2.5rem reference). Not a rule for every form field/select. |
| One control across states | Same radius/height/reserved slots; no silhouette change on hover, focus, selection, disabled or pending. |
| All Games cards | Desktop reference: 1.25rem radius/gap, 4:3 cover and 1.5rem clear toolbar-to-card gap. Not universal tool/card geometry. |
| Ordinary fields/popups/dense panels | Foundation defaults; shared Card does not inherit the catalog-card radius globally. |
| Homepage | Existing carousel, artwork, mixed shelf and decoration retain their composition. |

Layout owns region gaps; controls own padding. Use existing spacing/content-width
roles and preserve right clearance. One viewport's measured width is not a
universal fixed width. Reuse `CatalogSearchInput` and the shared panel-frame
encyclopedia toggle. Omit interface tutorials, implementation commentary and
visible result-total summaries; retain actual game facts, taxonomy/progress and
errors. A type role does not require displaying a redundant heading.

## Shells, footers and boundaries

| Surface | Confirmed rule |
| --- | --- |
| Portal header | Existing floating capsule and utility grouping. |
| Game header | Flush-top wordmark/game chip and label-sized links left, utilities right; retain existing spacing. |
| Root homepage footer | Existing blue sea/waves, white wordmark, four center links and legal metadata. [Copied reference](home-footer-copy.html); do not redraw. |
| Ordinary footer | Neutral, original wordmark, centered About/Contact/Updates/Settings, legal metadata and applicable game version. |
| Fullscreen map | No page footer; filing belongs in About. |

Exactly two footer designs. Root `/` differs from `#games`/Tools; the static
homepage copy excludes runtime dialogs/voyage. [Page skeleton](page-skeleton.md)
owns bottom placement, scrolling and single-owner boundaries; no mandatory
separator or duplicate toolbar line. Shared ordinary footer behavior reuses the
real components, including its thin voyage layer.

## Open scope and handoff

Rail/picker dimensions stay adjustable; encyclopedia content/details stay
contextual. Encyclopedia mobile redesign is deferred; existing map/catalog
mobile composition remains provisional. [Adoption](adoption.md) alone owns
current implementation, scoped acceptance, deferrals and delivery status.
