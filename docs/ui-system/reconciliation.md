# Stage 4 Reconciliation

Historical audit and implementation evidence, not a current execution plan.
Use [current status and acceptance](adoption.md) for remaining work and delivery
boundaries. The earlier audit below retains the observations and wording from
its own batch; later local implementation supersedes its unfinished actions.
Confirmed rules live in the reading index and canonical specifications.

Status: implementation audit started 2026-11-11. This file records verified
differences between the confirmed product topics, canonical specifications, and
the current checkout. It is not a claim that the production website has been
audited or that every listed fix has shipped.

## Confirmed implementation conflicts

| Area | Current checkout | Required behavior | Next action |
| --- | --- | --- | --- |
| Tool Library | `frontend/apps/meta/src/ToolsPage.tsx` rendered one titled tool card with one outer link. | No visible title/intro; complete directory; left All/types/Other filters; right search; independent tool, game, and favorite targets. | Implemented the extensible shell, six verified online entries, filters, search, three-column cards, independent targets, and account-scoped tool favorites in `7f1f1d5e` plus the online-data sync follow-up. The current online page uses game-specific filter chips and remains a visual/reference difference to reconcile against the confirmed type-filter rule. |
| Tool Library visual ownership | Before commit `3d85b91e`, `tools-page.css` contained legacy `.tools-list`/`.tool-entry*` rules beside the active `.tools-grid`/`.tools-card` rules, with hard-coded card radii and no explicit retry action. | One current card pattern with foundation-owned shape tokens; pending must remain observable for async-capable writes; failure needs a clear retry action. | Implemented the active-only stylesheet, foundation radius tokens, and a visible retry action in `3d85b91e`; browser visual acceptance remains. The current favorite write is synchronous local memory, so its pending window is intentionally too short to display. |
| Game favorites | `AllGamesPage.tsx` toggled a signed-in favorite synchronously and dropped the write result. Auth loading was treated like anonymous. Favorites were not moved ahead of non-favorites before pagination. | Auth loading is distinct; pending prevents repeats; success confirms state; failure keeps the prior state and offers retry without moving the item. Resolve result membership first, then sort favorites first while preserving default order within both groups. | Implemented the page-owned pending/failed states, returned the persistence result from `toggleFavoriteGame`, added retry UI, and sort favorites before pagination. |
| Catalog search | All Games search is local and currently has no request failure state. | If data is local, loading/request failure is owned by the host and marked not applicable. If remote data is introduced, preserve query/filters and offer retry. | Keep local filtering semantics explicit; do not invent network states. |
| Shared input and select | Base `Input` and `SelectTrigger` used framework radius aliases without stating the Arkive shape owner; no shared Field or Combobox boundary was documented. | Inputs, select triggers, and cards use the foundation `standard_radius`; Field owns label/help/error associations; page contracts own combobox scope and async states. | Implemented token-backed radius classes and the shared Field primitive; documented the page-owned Combobox boundary in `component-contracts.md`. |
| Account field errors | Profile `FormField` exposes label/helper but not field-level error ids or `aria-describedby`; save failures are only reported at form level. | Field errors identify the affected control while form-level failures remain available for request errors. | Migrate the account form to the shared Field primitive when field-level validation messages are introduced; current form has no field-specific error payload. |
| Card geometry | Shared `Card` used the generic `rounded-xl` class. | Shared card geometry follows the foundation `standard_radius` and keeps the existing surface/elevation behavior. | Implemented an explicit token-backed standard radius in `frontend/packages/ui/src/card.tsx`. |
| Marker details | `MarkerDetailDrawer` kept header coordinates, Add Image in the footer, visible copy status, and the Comments count/Popular/Latest row. | Coordinates move to the Details footer lower-left; Add Image entry is removed; coordinate group is icon + native tuple + copy icon; no visible copy status; comments row is removed. | Implemented in shared map-shell commit `5f7d8c58`; focused tests pass. |
| Marker popup copy | `MarkerPopupCard` changed icon/text and exposed live copy status. | Copy remains an identifiable action but shows no visible success/failure feedback. | Implemented in shared map-shell commit `5f7d8c58`; focused tests pass. |
| Map search scope | Map `SearchPanel` instances are built from the active map's items and clear the query after selection; the shared result has no owning-map identity. | Search only the currently selected map, including hidden markers; selecting a result exposes it and preserves the active map's browsing context. Cross-map search and result-driven map switching are out of scope. | Keep the active-map data source and selection behavior; remove the stale all-map requirement from the docs and acceptance checks. |
| Tool drafts | GMZZ Score/Relics/Equipment and Palworld Breeding/Stat use `task_draft` records that auto-write and restore without a shared Save/Leave/Discard flow. | Each tool must declare whether its configuration is explicitly saveable; leaving dirty work offers Save and Leave, Leave Without Saving, and Continue Editing, and discard starts the next ordinary visit fresh. | Keep the explicit-saving contract as the source of truth and migrate tools one by one after each tool's save destination and account scope are decided. Do not clear all task drafts globally. |
| Map memory | Before `f2707440`, AION2/Palworld did not restore the selected map or active search, and left map-sidebar collapse/scroll were local to the shell. AION2/Palworld multi-map sidebar and filter records still shared values. | Restore the full meaningful map/sidebar/search state per map; stale map ids fall back to a valid map; deep links and explicit results override conflicting target/view state. | Implemented map-partitioned sidebar, search, disclosure, and filter records for AION2/Palworld and valid-map fallback; V Rising remains single-map. Full deep-link and lifecycle checks remain follow-up verification. |
| Map shell geometry | The public AION2, Palworld, and V Rising routes pass the same `320` left-rail width; the shared shell fallback remains `346`, and the legacy Lost Ark route uses `280`. | Keep the public map shell structure shared and treat widths as named calibration variables until visual verification settles them; legacy routes remain separate until they return to the public inventory. | Public map widths and lower-left status/lower-right zoom positions were verified; keep the shared width owner under review. |
| Map top navigation | Public map routes use the shared `ArkiveMapTopBar` through app-owned wrappers (`TopNavbar`/`TopNav`) with the same `h-14` and boundary classes. Lost Ark still owns a legacy raw header. | Top navigation must keep one shared height, boundary, utility order, and active-state meaning above the map workspace. | Public routes are aligned; defer the legacy Lost Ark header until that product returns to the public inventory. |
| Account center | Before commit `3d85b91e`, `AccountCenterPage` rendered a visible title and description for each account section. | Keep the left navigation and actual right-side content, but remove the redundant visible current-page heading and introduction. | Implemented for the account center in `3d85b91e`; notification and public-profile headings remain separate surfaces. |
| Meta page root and footer | Before commit `3d85b91e`, `App.tsx` used a minimum-height root without a shared vertical flex page frame; `ToolsPage` did not grow to fill it. | Ordinary pages use a vertical flex root, a growing content region, and a footer that stays in document flow while reaching the viewport bottom on short pages. | Implemented the root flex frame and direct route-main growth in `3d85b91e`; verify the single footer boundary in browser QA. |
| Live catalog data | Current checkout still contains STS2 catalog entries and lacks the confirmed Phantom Blade Zero entry. | Current public inventory is AION2, Palworld, Lord of Mysteries, Ragnarok 3, V Rising, and Phantom Blade Zero. | Audit catalog data separately from component work before changing promotion or routes. |
| Behavior tests | Tool registry helpers now cover Other overlap, game-name search, filter membership, and favorites-first order; page-level All Games/Tool Library interaction tests are still absent. | Each shared action and catalog acceptance scenario must be executable before visual regression work. | Add focused page behavior tests with the next catalog action batch; leave gallery and broad visual coverage for stage 5. |

## Reconciliation order

1. Complete the shared map marker batch and focused tests.
2. Reconcile the tool-save adapter and map-memory declarations.
3. Define the catalog data contract, then rebuild Tool Library and favorite states.
4. Align shared Field/Combobox/Card contracts with foundation tokens.
5. Run affected package checks, then browser verification for the changed flows.

The order is shared-first. A page may override content, labels, routes, and
game-specific data, but it may not silently change shared action meaning.

## Decisions already closed

- Favorite requests keep their prior appearance while pending; only a confirmed
  response changes the state. Failure retains the item and allows retry.
- Search failures retain the query and active filters. Whether stale prior
  results remain visible is owned by the surface and is not implied here.
- Map search is scoped to the currently selected map, including hidden markers.
  It does not search other maps or switch maps from a result.
- Coordinate copy has no visible success/failure status in either marker detail
  or popup presentation.


## Local implementation evidence through 2026-11-15

Archived from the former append-only adoption log during documentation closeout.
Each paragraph describes its own batch, including the test count and limitations
at that time. Statements such as "remaining", "outside this batch" or "open"
are historical boundaries, not current tasks. Later batches may close them.
Only [Adoption](adoption.md) owns current status. This archive preserves fixture,
remote-data, mobile and local-only limitations; it is not a production report.

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

PBZ directory adoption: seven encyclopedia categories and six existing detail
families use the shared expanded/collapsed widths and toggle, with tab-local
collapse. The top navigation and directory share their inventory; directory
symbols reuse the existing mobile menu. Duplicate desktop category headings
are visually hidden. Game-owned tiles, images, rarity borders, filters, detail
documents, skill sections, header, footer and mobile composition retain their
existing layout. No search is added to the existing skill document.

The live and local unfiltered weapon lists both contain 27 records. Browser
checks cover all seven category routes, six detail families, collapsed reload,
query/type preservation through reload and detail return, narrow desktop tiles,
390-pixel composition and changelog exclusion without document overflow. QA uses
the actual production data/resource URLs through temporary dev-server variables
on port 15182; repository deployment configuration is unchanged. App lint/build,
memory inventory and the full suite pass: 173 files / 1917 tests. No remote
delivery. This completes the six scoped directory integrations; their final
cross-game visual review remains open.


Six-game encyclopedia closeout: 47 existing category routes passed directory,
single-toggle and document-overflow checks. Six representative pages passed
expanded/collapsed width, shared search geometry, session query/collapse reload,
390-pixel overflow and empty-result footer checks. These checks preserve existing
game-owned records, art, navigation, footers and mobile composition.

The review removed remaining GMZZ interface tutorials, implementation notes and
result-total introductions while retaining game facts. Eight Palworld catalogs
and PBZ's shared list controls now explain no-match states only after data is
ready. Nine loaded/no-match/clear browser flows restore their original records.
The 47-route shell check is not a claim that every record or every filter was
exhaustively tested. Mobile redesign, About/credits, forum and GMZZ BUILD exit
protection remain outside this closeout.

Affected app lint/build checks, the 140-key memory inventory and the full suite
pass: 173 files / 1917 tests. Final screenshots wait for actual records and
visible images rather than treating a mounted search input as data readiness.
Chinese comparison evidence is retained in ignored output/playwright. Changes
remain local; no push, pull request or deployment is part of this review.

Ordinary-footer correction: preserving each deployed game footer left the
confirmed center navigation empty. The six scoped game shells now reuse
`ArkiveSiteFooter` around the original `SiteFooter` geometry and voyage layer.
About and Contact link to the portal's existing dialogs through a consumed
query parameter; Updates opens the shared platform history; Settings opens
the current game's existing settings panel. The homepage sea footer and its
source are unchanged. Game version, GitHub and legal links are retained.
Six game settings flows and both portal dialog destinations passed browser
checks; 1440/900/390-pixel footer checks show no document overflow. All seven
affected app builds/lints and map-shell typecheck pass. No remote delivery.

## Stage 5: executable local acceptance

The development-only Meta gallery now renders real shared controls, directory,
dialog and ordinary footer with Chinese specimen copy. It replaces the old
standalone HTML as the maintained acceptance surface; the production homepage
and its entry bundle do not import it. A disabled-search specimen exposed a
real defect: submit/clear remained enabled. The shared control now disables
those actions and prevents programmatic submission while disabled.

`pnpm test` now includes the scoped UI guard. It covers 126 shared/chrome files
and checks app CSS ownership of search geometry. Seven pre-existing occurrences
in six documented exceptions retain existing game art/local layers; new copies
or changed values fail. This is not a whole-repository style or contrast audit.

`pnpm ui:verify --routes` passes 29 checks: shared geometry and state transitions,
keyboard focus/return, reduced motion, light/dark desktop/narrow captures,
portal search/empty/footer/control parity, portal references in both themes,
and desktop/mobile AION2/Palworld map-shell references. Seven deterministic
component images can be compared without rewriting their reference. A deliberate
reference-size mismatch was rejected, then the original reference was restored.
Dynamic portal/map imagery remains a manual comparison; dense map labels are
unchanged. Authenticated favorite recovery and account failures remain outside this new
browser certification; existing regression tests still run.

All seven affected app builds, Meta lint, shared package typechecks, and the
full suite pass: 174 files / 1922 tests. The gallery is absent from production
output. Candidate images/environment and the report live only in ignored
`output/playwright/ui-acceptance/`. They are not final art approval or approval
of deferred mobile composition. No Skill, push, PR or deployment in this batch.
