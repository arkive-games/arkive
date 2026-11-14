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

Remaining: encyclopedia reconstruction and return adapters outside RO3/Palworld/AION2; remaining
map lifecycle migration and OSS preview adoption; production credits generation/manual editor; tool explicit
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
| Map | Picker geometry/group names, legacy memory retirement, OSS preview adoption, provisional mobile |
| Tools | Save destination/account scope, saved-record workflow, per-tool applicability |
| Credits | Identity/aliases, bots, ordering, refresh and manual editor |
| Acceptance/data | Unreviewed states/themes, contrast/geometry, current inventory/child parity, signed-in ordering and direct-post routes |

Package a team Skill only after canonical adoption and validation mature.
About/credits implementation is deferred at the user's request on 2026-11-15.

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

Map return-memory batch: AION2, Palworld, V Rising and PBZ now restore tab-local
map queries, category disclosure and sidebar collapse/scroll. Palworld/PBZ
visibility is map-partitioned; existing global preferences seed new contexts
without deleting old data. AION2 keeps its existing per-map visibility records
with map-load write guards. Bare entry restores the last available map; explicit
targets take precedence, and stale map ids fall back to an available map.
Breakpoint remounts reread the current camera. Completion keys are unchanged.

Browser checks cover AION2/Palworld/PBZ map switching and bare entry, independent
queries/visibility, category/sidebar restoration, AION2 stale links and marker
priority, Palworld coordinate priority, and V Rising reload restoration. Four
affected app builds/lints pass; full suite: 158 files / 1875 tests. The generated
key inventory includes the shared map-context factory. No remote delivery.
This is scoped adoption: legacy selection/display/progress lifecycles, all
account/storage-failure scenarios and OSS preview are not certified complete.

Palworld encyclopedia return-memory batch: 13 existing reference categories
(pals, active skills, partner skills, passives, items, buildings, merchants,
quests, dungeons, technology, research, fishing and raids) now retain applicable
tab-local browsing fields and result-scoped scroll. Legacy pal facets seed new
session fields without rewriting the old preference. Item/building reveal depth
survives async loading and remains independent by result set; mobile pages are
no longer clamped by desktop visits. Technology links temporarily bypass a
conflicting query without replacing it. Content layout and tool saving are unchanged.

Browser checks verify item search/facets across category changes and details,
2400-pixel scroll return, 320-item reveal restoration after reload, technology
target priority, and mobile page two through detail/reload/breakpoint changes.
Palworld lint/build and the generated memory-key inventory pass. Full suite:
161 files / 1882 tests pass. No remote delivery.

AION2 encyclopedia return-memory batch: the overview, type hubs, grouped lists
and item/NPC/quest details bind the existing content scroller to tab-local
restoration. Hub group/faction and sibling searches are scoped independently;
search-result navigation retains the query and restores the lazy search index.
New anchor links take precedence; Back/reload resumes that history entry's
position without replacing an ordinary group's saved context. Pending routes
cannot reuse the previous page's browsing scope. The shell's default reset is
disabled only where the encyclopedia descendant owns restoration.

Browser checks cover search-result return/reload, category isolation, grouped
list return, remembered hub selection/faction, explicit faction/anchor priority,
anchor Back/reload, and sibling search restoration. Palworld return smoke passes.
AION2 lint/build, map-shell typecheck and memory-key inventory pass. Full suite:
162 files / 1887 tests pass. Existing layout/mobile composition is unchanged;
this is return-memory adoption, not certification of the full encyclopedia UI.
