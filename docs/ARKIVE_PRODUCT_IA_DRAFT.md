# Arkive UI: Reading Index

Updated 2026-11-15. Confirmed discussion rules; observations and proposals are
labelled. No production conformance is claimed. Stage 4 local reconciliation was approved on 2026-11-15; delivery remains unshipped.

## Read by task

Read the repository-required [site specification](ARKIVE_SITE_SPEC.yaml), then
only the matching topic. Do not read every document for each task.

| Task | Rule owner |
| --- | --- |
| Add a game, content branch or tool; understand surface roles | [Product structure](ui-system/product-structure.md) |
| Page flow, scrolling, footer placement or dividers | [Page skeleton](ui-system/page-skeleton.md) |
| Shared appearance, navigation, typography, shape, spacing, footers | [Visual foundations](ui-system/visual-direction.md) |
| Homepage modules and selections | [Portal](ui-system/portal.md) |
| All Games, Tool Library, types, search, favorites and link targets | [Catalogs](ui-system/catalogs.md) |
| Encyclopedia directory, search and return memory | [Encyclopedia](ui-system/encyclopedia.md) |
| Map layout, sidebar, search and memory | [Map workspace](ui-system/map-workspace.md) |
| Marker details / About | [Markers](ui-system/map-markers.md) / [About](ui-system/map-about.md) |
| Unsaved tool work / login and personal center | [Saving](ui-system/tool-saving.md) / [Account](ui-system/account.md) |
| Shared component semantics / state transitions | [Contracts](ui-system/component-contracts.md) / [States](ui-system/state-matrix.md) |
| Remaining work and permission boundary | [Adoption](ui-system/adoption.md) |

## Foundation lookup

Load sections, not whole unrelated specifications:
[UI foundations](ARKIVE_UI_FOUNDATIONS_SPEC.yaml) owns typography, spacing,
shape, geometry, accessibility, motion and layers; [colors](ARKIVE_SITE_COLOR_SYSTEM.yaml)
owns semantic values/contrast; [memory](ARKIVE_STATE_MEMORY_SPEC.yaml) owns
storage lifetimes and restoration; [map UI](ARKIVE_INTERACTIVE_MAP_UI_SPEC.yaml)
and [mobile](ARKIVE_MOBILE_EXPERIENCE_SPEC.yaml) own their specialist details.
Known conflicts are listed in the visual migration map, pending stage 4.

## References only when needed

Visual review: [catalog sample](ui-system/catalog-controls-preview.html),
[map sample](ui-system/map-shell-preview.html), [copied live homepage footer](ui-system/home-footer-copy.html),
[brand assets](ui-system/assets/arkive/README.md).
Implementation/verification research: [live audit](ui-system/live-visual-audit.md),
[dated inventory](ui-system/evidence.md), [historical reconciliation](ui-system/reconciliation.md),
[acceptance plan](ui-system/visual-regression.md). These are not daily rules or
proof that the site is finished. Forum redesign and Skill packaging are deferred.
