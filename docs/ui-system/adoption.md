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
GMZZ BUILD exit protection is deferred at the user's request; continue with
encyclopedia desktop-shell adoption and acceptance instead.
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

Reference-memory gap follow-up: Palworld base-camp progression now restores
reading position independently by desktop/existing mobile page. GMZZ puppet
search/facets and result position are tab-local, separate from existing level
records. Trade reference sections restore independent positions, goods sorting
is a validated device preference, and commission query/type/page are tab-local.
The calculator's input workflow and all existing page layouts are unchanged.

Browser checks verify puppet query/quality reload and 1200-pixel return, trade
sort return, commission page two and query/type reload, base-camp 900-pixel
return through a building detail, and existing mobile page two through reload/
breakpoint changes. Both app lints/builds and the key inventory pass; full suite:
169 files / 1909 tests. No remote delivery. This closes the three identified
browsing gaps, not the remaining encyclopedia shell/layout reconstruction.

RO3 explicit-save editor batch: the flow handbook uses the shared unsaved-work
dialog for editor Back, section changes, opening another/new build, top-level
navigation and browser Back/Forward. Three choices save successfully before
departure, discard only the unsaved draft, or stay with all inputs. Failed saves
keep the dialog/work in place; saved records and recovery data remain intact.
Dirty state compares the current draft with its loaded/saved baseline. Native
refresh/close confirmation remains best effort. Indexed app history restores
the current URL before asking about a browser traversal.

Browser checks verify top-nav interception, Continue Editing, Back cancellation/
discard, Forward, fresh input after discard, Save and Leave, simulated browser
storage failure and saved-record preservation. RO3 lint/build and shared UI
typecheck pass. GMZZ build/account synchronization and editor exit integration
remain separate outstanding work; this batch does not change its autosave policy.
Full suite: 170 files / 1913 tests pass. No remote delivery.

Encyclopedia desktop-shell pilot: audited the live RO3 Talents reference and
preserved Arkive chrome, palette, typography, routes and game-owned content.
Palworld's 14 reference categories/details now use one shared workspace with
the agreed 11.5rem/4rem rail tokens, a tab-local collapse control, accessible
icon-only links and one primary scroller. Top navigation and the rail share
the category inventory. The desktop category heading is visually hidden;
existing mobile pages and calculators keep their composition. Sidebar height
reserves footer space so short/empty pages retain a bottom-aligned footer.

Browser checks cover all 14 route selections, collapse width/query retention,
collapse across category navigation, return-memory preservation, short-page
footer position, light/dark selection state, unchanged calculator composition
and narrow-page overflow.
Palworld lint/build, map-shell typecheck, inventory and full suite pass:
171 files / 1914 tests. Other games' desktop shells and broader visual
acceptance remain open; this is local implementation, not remote delivery.

GMZZ desktop-shell adoption: 12 reference routes reuse the shared encyclopedia
workspace, existing navigation inventory and game artwork. The active People
branch exposes roster/relations children. Desktop filters/search mount once in
the right column; duplicate category headings/intros are visually hidden.
Collapse is tab-local. Record contents, top navigation, footer, tools, the trade
calculator and existing mobile composition retain their ownership and layout.

Browser checks cover every reference route, tool exclusions, nested navigation,
loaded artwork, collapse/query reload, single-toolbar placement and narrow-page
overflow. Palworld's shared-shell smoke check passes. GMZZ lint/build, Palworld
build, map-shell typecheck and the memory inventory pass; full suite: 172 files /
1916 tests. BUILD exit protection remains deferred. No remote delivery.

AION2 desktop-shell adoption: the overview, quest/NPC/item hubs, group lists
and record pages use the shared 11.5rem/4rem directory with tab-local collapse.
Existing taxonomy counts, hash-based groups, flat-group destinations and recent
reading links remain available. Duplicate desktop category headings are visually
hidden; record headings, data, navigation, footer and mobile layouts stay owned
by the app. The shared workspace accepts an expanded-only reading-history slot.

Browser checks cover all three hubs and 13 subgroup destinations, search/collapse
reload, quest detail return to the same 632-pixel reading position, recent links,
faction filtering and existing 390-pixel mobile navigation without overflow.
AION2 lint/build, map-shell typecheck, memory inventory and the full suite pass:
172 files / 1916 tests. No remote delivery; broader visual acceptance stays open.

V Rising desktop-shell adoption: V Blood list/detail, Database and Powers &
Research use the shared directory and tab-local collapse. Top navigation and
the directory share the reference inventory; desktop subsection controls and
existing mobile category cards share their own inventory. Unavailable item,
weapon, armor and spell sections remain disabled and marked as extracting.
Duplicate desktop headings/category cards are suppressed; record content,
progress, top navigation, footer and mobile composition remain game-owned.

Browser checks cover all ready subsections, collapse/query/disclosure reload,
independent subsection queries, research selection, V Blood completion reload,
chapter/search filters and detail return to the same 114-pixel list position.
At 390 pixels the existing category cards work with one search and no overflow;
empty desktop results keep the footer at the bottom. Changelog excludes the
directory. Intermittent data-host failures required a temporary browser-only
copy of the live schema-2 rewards payload (24 passives, 924 buildings, 377 tech
records); the on-disk artifact uses schema 3 and was not substituted. Production
data configuration is unchanged. App lint/build, memory inventory and full suite
pass: 172 files / 1916 tests. No remote delivery; visual acceptance remains open.

Catalog-control correction: portal catalog search CSS is now owned once by the
shared theme. CatalogSearchInput and the SearchInput adapter reuse its capsule,
leading magnifier and round warm arrow; existing live-query, lazy-index, clear,
focus and session-memory behavior remain caller-owned. Palworld, AION2, GMZZ,
V Rising, RO3 and PBZ reference searches adopt it, including RO3's custom search
rows and GMZZ's former compact primary fields. Encyclopedia toggles now use the
approved panel-frame/internal-arrow drawing. Interface tutorials, technical
source notes and visible result summaries are removed from the affected
reference views; shared map result totals remain screen-reader-only. Game data,
taxonomy counts, progress, errors and empty states remain intact.

At 1440 pixels, the portal plus six game references share the measured 23rem
width, 3.2rem height, pill radius and arrow gradient without document overflow.
GMZZ's four formerly compact searches share that height. A 390-pixel V Rising
check retains one search and the existing mobile composition without overflow;
search text and directory collapse survive reload. Seven app builds/lints,
shared-package typechecks and the full suite pass: 173 files / 1917 tests.
Browser-only copies of live V Rising/PBZ data avoid remote-data failures; source
configuration stays unchanged. Some captures timed out waiting for webfonts,
stable geometry or navigation; restarting the named session on explicit IPv4
completed final capture. Capture serially after builds and retain only the final
correction screenshot. No remote delivery.

RO3 directory adoption: seven encyclopedia categories now use the shared width
tokens and panel-frame toggle, with tab-local collapse. Original category art,
hover motion, selected-row shadow/color/radius/height and the sticky offset are
retained. A mounted subsection slot preserves the existing season/star talent
controls while hidden. The game-owned right column, header, footer, mobile strip
and build-manual layout retain their existing composition.

Live comparison confirms the selected row's computed visual properties match.
Browser checks cover all seven category selections, collapsed icon links,
search/collapse reload, star-board selection through collapse/reload/navigation,
build exclusion and the existing 390-pixel strip without overflow. Shared slot
tests verify hidden controls keep their state. RO3 lint/build, map-shell
typecheck, memory inventory and the full suite pass: 173 files / 1917 tests.
No remote delivery; the final Chinese screenshot is the visual review artifact.
