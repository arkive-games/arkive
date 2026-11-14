# Adoption and Remaining Work

Updated 2026-11-15. Current scope: approved stage 4 local code/spec reconciliation.
Hierarchy, page rules, component/state contracts and shared visual roles are
recorded in the [index](../ARKIVE_PRODUCT_IA_DRAFT.md); production compliance is
not implied. Preserve existing homepage design. Forum redesign/Skill are deferred.

## Stage 4: permission required

Local stage 4 work was approved on 2026-11-15. The active worktree is
`.scratch/ui-stage4`, based on `origin/master` at `c70f9509`; the previous spec
worktree remains intact. No push, PR or deployment is authorized by this batch.

Implemented: catalog type/Other filters and game-name search, independent tool/
game/favorite targets, account-scoped tool favorites, stable favorites-first
ordering, confirmed-write failure/retry, equal-height catalog controls, map
footer coordinates and silent copy, removed Details upload/comment sort row,
account-menu UID removal and hidden redundant account section heading.
Canonical foundation/color/site/map/memory owners now record these scoped rules.
The current homepage source remains unchanged.

Remaining: encyclopedia reconstruction and return adapters outside RO3; per-map memory
lifecycle migration; production credits generation/manual editor; tool explicit
save adapters after their open save destinations/account scopes are resolved.
Do not call the whole stage complete from the catalog/map-detail batch.

## Validation after implementation

The copied older gallery and [acceptance plan](visual-regression.md) are
reference artifacts, not complete acceptance. The new baseline has no token guard script yet. Run affected checks and real flows;
compare matched viewports/themes with reviewed live references. Verify applicable
auth/favorite failure, save/discard, map memory and direct routes. Local filtering
needs no invented network error. Keep final evidence and state actual limitations.

## Open and deliberately contextual

| Topic | Remaining scope |
| --- | --- |
| Homepage | Mobile shelf/overflow, empty-section treatment, promotion cadence |
| Catalogs | Tool geometry/truncation/reflow, optional game grouping, Other membership after game entry launches |
| Encyclopedia | Adjustable rail/sticky calibration; game-owned schema/detail and related links; mobile deferred |
| Map | Picker geometry/group names, return lifecycle, provisional mobile |
| Tools | Save destination/account scope, saved-record workflow, per-tool applicability |
| Credits | Identity/aliases, bots, ordering, refresh and manual editor |
| Acceptance/data | Unreviewed states/themes, contrast/geometry, current inventory/child parity, signed-in ordering and direct-post routes |

Package a team Skill only after canonical adoption and validation mature.

## Verified local batch

2026-11-15: 155 test files / 1865 tests pass with `--maxWorkers=2`; Meta,
AION2 and Palworld production builds pass. Browser checks cover desktop/narrow
Tool Library, associated-game search, independent links, anonymous login gate,
and real AION2/Palworld detail layout. Authenticated page flows remain unverified
in the browser; favorite failure/retry is exercised by unit tests. No deployment.
On this Windows machine unrestricted Vitest forks exhausted V8 memory while
builds were active; bound workers to two for the closeout run.

RO3 return-memory batch: all seven categories integrated with session context;
verified page-two/scroll restore, search/facet restore after Back and reload,
and selected-record restore across categories. Full suite: 157 files / 1871
tests pass. RO3 lint and production build pass. Its fixed port belongs to a
separate worktree; this batch is previewed on temporary port 15180 without
stopping that workspace. No mobile layout changes or remote delivery.
