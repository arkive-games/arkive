# Shared Component Contracts

Reusable semantics only; appearance is in [Visual foundations](visual-direction.md),
task transitions in [States](state-matrix.md), storage in
[State memory](../ARKIVE_STATE_MEMORY_SPEC.yaml). These are requirements, not
claims of production compliance.

## Ownership boundaries

| Concern | Owner |
| --- | --- |
| Button, input, Field, select/combobox, overlay, card/list primitives | `frontend/packages/ui` |
| Shared top bar, sidebar/map/detail shell | `frontend/packages/map-shell` or relevant shared package |
| Persistence classes, scope, lifetime, precedence, validation/clearing | State-memory specification and package |
| Composition, content schema, game labels/assets/routes | Owning app/topic |
| Typography, color, geometry, layers, motion, accessibility | Canonical foundations plus reviewed visual exceptions |

Extend shared variants rather than copying primitives into apps. Before sharing,
record task/slots, independent targets, events/auth, applicable states/recovery,
responsive/long-content behavior, keyboard/touch/focus/labels, persistence owner,
implementation owner and reviewable keyboard/touch plus failure scenarios.

## Priority contracts

| Component | Required behavior |
| --- | --- |
| Action | Native link/button semantics and independent hit targets; labelled icon actions; stable geometry/name. Busy blocks duplicates; disabled means unavailable, not busy. Success/failure is task-owned |
| Input/search | Accessible name and value owner; define empty/filled/focus/invalid/disabled/clearable states plus applicable result/loading/error states. IME-safe. Page owns scope, submit timing and pagination reset |
| Field | Stable id, label/help/error associations, `aria-describedby` and `aria-invalid`; announce field errors and keep values. Request errors belong beside action. Read-only retains associations; page owns validation/localization |
| Select/combobox | Selected/expanded state; keyboard navigation, dismissal/focus return; long labels readable; applicable busy/empty/error/mobile behavior. Page owns query scope, identity/filtering and async retry |
| Dialog/sheet/popover | Correct layer, focus containment/return, labelled surface, declared escape/outside/close policy, safe areas; nested overlays explicit. Opening is transient |
| Async list | Reserve loading slots; distinguish empty/no-match/error/unavailable and declare partial/stale policy. Stable identity, deduplication, ordering and independent commands. No invented records |
| Directory | Explicit selected/expanded/collapsed behavior. Collapse or child loading preserves branch/query/filters. Empty/unavailable branches explain status and permit retry when supported |

Ordinary inputs/selects keep foundation defaults; catalog composites use the
reviewed pill role. One outer composite focus ring, no duplicate inner outline.
A shared primitive must not infer another page's search scope or memory policy.

## Page-specific contracts

Use one owner instead of repeating page rules:

| Concern | Owner and exception |
| --- | --- |
| Catalog targets, ordering, association | [Catalogs](catalogs.md); no nested independent links/buttons |
| Encyclopedia rail and return | [Encyclopedia](encyclopedia.md); desktop icon rail, mobile deferred |
| Map picker/search/sidebar | [Map workspace](map-workspace.md); active-map search and map-scoped memory |
| Marker/copy | [Markers](map-markers.md); plain tuple, no visible copy feedback |
| About | [About](map-about.md); opening/closing retains independent map state |
| Dirty exit | [Saving](tool-saving.md); explicit save/discard, no silently restored discarded draft |
| Account | [Account](account.md); retained fields survive request/validation failure |

For each reachable state provide visible response, allowed action, accessibility,
retained input/layout, persistence boundary and applicable recovery. N/A means
unreachable for that data/control, not permission to omit a reachable state.
