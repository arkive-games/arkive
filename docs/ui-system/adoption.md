# Adoption and Remaining Work

Updated 2026-11-15. Current scope: approved stage 4 local code/spec reconciliation.
Hierarchy, page rules, component/state contracts and shared visual roles are
recorded in the [index](../ARKIVE_PRODUCT_IA_DRAFT.md); production compliance is
not implied. Preserve existing homepage design. Forum redesign/Skill are deferred.

## Stage 4: approved local reconciliation

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

Remaining: encyclopedia reconstruction and category-specific return adapters not covered below; remaining
map lifecycle migration in released games; production credits generation/manual editor; tool explicit
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
| Map | Picker geometry/group names, legacy memory retirement in released games, provisional mobile; OSS deferred |
| Tools | Explicit-save editor destinations/account scope and exit guards; ordinary calculators use automatic device memory |
| Credits | Identity/aliases, bots, ordering, refresh and manual editor |
| Acceptance/data | Unreviewed states/themes, contrast/geometry, current inventory/child parity, signed-in ordering and direct-post routes |

Package a team Skill only after canonical adoption and validation mature.
About/credits implementation is deferred at the user's request on 2026-11-15.
Further adoption work is limited to released games at the user's request.
STS2, OSS preview and other unreleased surfaces are deferred; the earlier STS2
local batch remains recorded as historical work, not a reason to extend it.

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

PBZ/V Rising encyclopedia batch: PBZ's weapons, Phantom Edges, accessories,
medicines, items and enemies retain queries/facets and result-scoped scroll.
Details retain reading position, weapon-level expansion and item-document page
selection by entity. Skills retain ordinary reading position; hash visits use
the existing anchor behavior. V Rising's V Blood list/detail retain reading
position alongside existing query/act/hide-completed state. Completion data,
reward disclosure and layout remain unchanged. The shared state-memory adapter
binds a declared record, result scope and loading readiness to the existing shell.

Browser checks verify PBZ search/filter return/reload, weapon/Phantom Edge
isolation, 1000-pixel item-list return, 59-level expansion and item-document
page isolation. V Blood query/filter and 1200-pixel return/reload pass, with
completion storage unchanged. Both app lints/builds, state-memory typecheck and
the key inventory pass; full suite: 163 files / 1890 tests. No remote delivery.
Other unintegrated encyclopedia surfaces remain outside this batch; this does
not certify the entire stage.

V Rising knowledge follow-up: the available recipe/passive/building/research
sections now retain independent queries, result-scoped reveal depth, passive
disclosure and scroll. Existing page-level search/reveal records are adopted
once into their original subsection, preserved as read-only seeds and never
allowed to replace newer subsection state. Unavailable categories and layout
remain unchanged. Browser checks verify subsection/route isolation, passive
disclosure after reload and 96 loaded building records with 1200-pixel return/
reload restoration. App lint/build and the key inventory pass. Full suite:
164 files / 1894 tests pass. No remote delivery.

GMZZ reference-memory follow-up: autochess rules/pieces/bonds/items/talents,
the fellows roster/relations, reforge reference, trade goods and Utopia cards
retain applicable tab-local queries/facets, pagination, reading disclosures
and result-scoped scroll. Trade/Utopia views use device preferences. Explicit
piece links reveal the target without overwriting ordinary saved filters.
Builds, scores, equipment, relics, saved characters, trade calculators, league
tools, managed trade and progress records keep their existing lifecycles.

Browser checks verify piece query/cost return/reload and explicit-link priority,
trade/Utopia page-two and list-view restoration, fellows query/story/upgrade
restoration, independent relation grades and 1200-pixel return/reload position.
Relation story disclosure has no current data to exercise in the browser.
GMZZ lint/build and the memory-key inventory pass. Full suite: 165 files / 1897
tests pass. No layout change or remote delivery; other unintegrated surfaces
and the deferred About panel remain outside this batch.

STS2 reference-memory follow-up: card/character lists and details now bind
result/entity-scoped reading positions to the shared shell. Card facets move
to tab-local context, seeded from the former device preference without rewriting
it or replacing newer session choices; the existing search key is unchanged.
Layout, home, version history and account behavior are unchanged.

The local artifact directory is absent and known live data endpoints were not
available. Browser checks therefore use an explicitly controlled 400-card/two-
character fixture, not production data: search/facet Back/reload, 1200-pixel
list restoration, 900-pixel character return, per-entity detail isolation,
detail reload, explicit targets and query retention across a phone breakpoint
pass. This does not certify live inventory or mobile layout. App lint/build,
memory-key inventory and full suite pass: 166 files / 1900 tests. No remote
delivery. Remaining map/OSS/tool workflows and deferred credits are still open.

V Rising map-filter follow-up: marker visibility is now map-partitioned tab
context. The former device filter remains a read-only migration seed; new
choices never overwrite it. Loading cannot write an empty placeholder before
the taxonomy resolves. Camera, selected marker, labels, boundaries and progress
retain their existing behavior. Browser checks with the actual local artifact
verify legacy adoption, Hide All through return/reload, independent new-tab
filters and unchanged device seed. App lint/build and focused tests pass.
Full suite: 166 files / 1900 tests pass; memory-key inventory is unchanged.
Unreleased games and OSS preview are excluded from further adoption work.

Calculator memory decision: ordinary calculators without a save workflow use
automatic device-local task drafts, without a Save button or leave reminder.
Named build/loadout editors retain the explicit-save contract. Palworld breeding
and stat inputs already use local records; this batch adds GMZZ league points,
station planning and trade-profit inputs with independent validated records.
Trade inputs validate current goods/sites/caravan/part ids. Results are recomputed,
and the existing league/station reset controls plus the trade reset replace
remembered input. The shared 30-day local-draft retention applies.

Browser checks against the current game data verify return/reload, independent
tool records and persistent reset behavior. Closing/reopening the browser with
the same profile restores the league input. GMZZ lint/build, inventory and full
suite pass: 167 files / 1904 tests. No remote delivery. Explicit-save editor exit
guards and their save destinations remain separate outstanding work.

Map lifetime follow-up: AION2 subtype/region filters now use map-scoped tab
context. A device migration flag adopts each legacy filter once, preserves the
old record and never replaces newer tab choices. Later independent tabs start
with current defaults. AION2, Palworld, V Rising and PBZ now use one shared
adapter separating device-local camera history from tab-local selected markers.
Legacy camera coordinates remain readable; legacy durable markers are ignored.
Layout, label/boundary preferences and completion records remain unchanged.

Browser checks verify AION2 one-time adoption, explicit empty filters, independent
new-tab defaults and preserved legacy data; AION2/Palworld selection return and
new-tab isolation; AION2/PBZ direct marker links; PBZ map switching/new-tab
selection isolation; and V Rising selection reload. V Rising's remote data
connection failed during QA, so its check used actual local artifacts. PBZ used
temporary port 15182 because 15180 belongs to the RO3 preview. Four app lints/
builds and the inventory pass. Full suite: 169 files / 1909 tests. No remote
delivery; broader account/storage failure and visual acceptance remain open.
