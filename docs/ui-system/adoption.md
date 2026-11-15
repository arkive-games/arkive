# Adoption and Remaining Acceptance

Updated 2026-11-15. This is the single current status list, not a product-rule
owner. Read the [task index](../ARKIVE_PRODUCT_IA_DRAFT.md) for rules and the
[acceptance procedure](visual-regression.md) for executable checks. Historical
batch details are [archived](reconciliation.md#local-implementation-evidence-through-2026-11-15).
Do not turn an old batch's unfinished action into a new task without checking
this list and the current implementation.

## Status definitions

- **Implemented locally:** code exists in the active worktree; not deployed.
- **Verified, scoped:** named checks passed; not certification of every route/state.
- **Awaiting acceptance:** behavior is specified, but the listed evidence is incomplete.
- **Provisional/contextual:** an adjustable value or game-owned choice, not missing work.
- **Deferred:** intentionally excluded; do not reopen during closeout.
- **Not started:** a later deliverable, not an implemented capability.

## Six-stage status

| Stage | Current status |
| --- | --- |
| 1. Product and experience hierarchy | Confirmed in the product topics and canonical site specification |
| 2. Page structure | Confirmed; shared desktop encyclopedia/map structures implemented locally; record layouts remain game-owned |
| 3. Component contracts and states | Confirmed; shared primitives and state contracts exist; no promise that every legacy page was migrated |
| 4. Code/spec reconciliation | Agreed local batches implemented; remaining acceptance is listed below; deferred work stays excluded |
| 5. Acceptance tooling | Implemented and verified within the scope below; human visual approval remains separate |
| 6. Team Skill | Not started; package the current rules and task-based reading router after closeout |

## Completed local scope

| Surface | Implemented / verified boundary |
| --- | --- |
| Portal catalogs | Type/Other filters, associated-game search, independent link/favorite targets, account-scoped favorites and confirmed-write recovery; existing homepage composition retained |
| Encyclopedia | Six scoped game directories, shared search/toggle, current-category search, applicable browsing restoration, reduced duplicate copy and explicit no-match states; 47 route-shell checks and representative state flows passed |
| Map | Active-map search retained; marker coordinates/silent copy and agreed detail changes; map-partitioned browsing memory, device camera/tab selection and legacy migration covered in recorded batches |
| Tools and account | Ordinary calculators use automatic device memory; RO3 explicit-save exits verified; account UID and duplicate section introduction removed; GMZZ BUILD remains deferred |
| Footers | Homepage sea footer preserved; ordinary game footers now include the four centered site links; six settings flows and portal About/Contact destinations verified |
| Shared acceptance | Real-component Chinese gallery, style guard in `pnpm test`, screenshot comparison and interaction checks; disabled search actions fixed |

Latest recorded validation: 174 test files / 1922 tests; seven affected app
builds; shared-package typechecks; 29 browser checks. The style guard covers
126 chrome files plus app search-CSS ownership, with seven existing occurrences
in six documented exceptions. Seven deterministic component images are compared;
current portal/map images are manual references, not automatic art approval.
The memory inventory contains 140 declared keys. These are recorded results,
not a claim that this documentation-only closeout reran application checks.

## Remaining acceptance

| ID | Scope | Evidence still needed |
| --- | --- | --- |
| AUTH-01 | All Games / Tool Library | Signed-in favorite priority and game/tool/account isolation through login/logout; failure/retry leaves order and previous state intact. Existing tests are not authenticated browser evidence. |
| FAIL-01 | Actual async data, account save and unavailable storage | Verify retained authored values/query/filters, truthful failure feedback and applicable recovery in representative real flows. Do not invent a network state for local filtering or promise restoration when storage is unavailable. |
| VIS-01 | Changed shared chrome and catalog controls | Finish contrast, long-label/truncation, filter overflow and light/dark state review where current samples do not cover them. Preserve game art and existing mobile composition. |
| IA-01 | Existing released game entries and tools | Refresh the dated inventory where needed, verify home/menu/tool-registry child parity and direct destinations. Exclude forum redesign and unreleased games. |

These items require targeted evidence, not rebuilding finished pages or testing
every game record. A visual difference is not permission to redesign a surface.
Record the exact checked scope and any unavailable data/account condition.

## Provisional and content-owned choices

Encyclopedia rail widths, map picker grouping/long-name calibration, and existing
mobile tool/catalog composition remain adjustable under their topic rules.
Game record schemas, detail presentation and related-record layout remain
content-owned. Homepage selection/empty-section treatment and future tool
membership changes are contextual follow-ups, not new closeout blockers.
Do not invent fixed card counts, mandatory grouping or a mobile encyclopedia
layout to make the list look complete.

## Deferred and later work

About/credits generation and manual editing, forum redesign, mobile redesign,
GMZZ BUILD exit/account-save integration, and unreleased game/OSS/STS2 work are
deferred by the user. Previous STS2 fixture checks are historical evidence only.
Explicit-save destinations/account needs remain editor-owned; RO3's completed
exit guard does not establish a universal account-save backend.
Team Skill packaging is the next deliverable after this closeout, not part of
this document cleanup. Deferred features do not block packaging the current
confirmed rules with their explicit boundaries.

## Delivery boundary

Changes are in local signed commits in `.scratch/ui-stage4` on `codex/ui-stage4`.
No push, pull request, merge or deployment has occurred in these batches.
Remote handoff requires the user's instruction and the repository PR workflow.
The production website is a visual/data reference, not proof these local fixes
are already online. This closeout changes documentation only.
