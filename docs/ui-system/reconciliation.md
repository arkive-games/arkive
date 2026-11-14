# Stage 4 Reconciliation

Historical audit and implementation record, not a current execution plan.
Some entries predate the reviewed live visuals. Use
[adoption](adoption.md#stage-4-permission-required) and the
[visual migration map](visual-direction.md#stage-4-migration-map) for the next
batch, which requires explicit user approval. Reverify source before acting;
older standard-radius or footer wording does not override the reviewed roles.

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
