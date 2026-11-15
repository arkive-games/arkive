# Implementation Map

Use only rows relevant to an implementation or component review. Paths below
are repository-relative locators, not copied API contracts: inspect exports and
the current caller before editing. Keep game-specific labels/assets/data in apps.

| Concern | Existing owner / starting point |
| --- | --- |
| Top navigation and ordinary page frame | `frontend/packages/map-shell/src/ArkiveMapTopBar.tsx`, `ArkiveContentPage.tsx`; owning app's `src/components/TopNav.tsx` or `TopNavbar.tsx` |
| Encyclopedia directory | `frontend/packages/map-shell/src/ArkiveEncyclopediaWorkspace.tsx`; app navigation inventory and content wrapper |
| Catalog search and filters | `frontend/packages/ui/src/catalog-search-input.tsx`, `filter-controls.tsx`; geometry/styles in `frontend/packages/map-shell/src/arkive-map-theme.css`. Portal's continuous filter track is in `frontend/apps/meta/src/all-games.css`. |
| Ordinary footer | `frontend/packages/ui/src/site-footer.tsx`; game site links/settings in `frontend/packages/map-shell/src/ArkiveSiteFooter.tsx`; portal composition in `frontend/apps/meta/src/StandardFooter.tsx` |
| Homepage sea footer | `frontend/apps/meta/src/HomeFooter.tsx` and existing homepage styles/assets; preserve its separate design |
| Map sidebar/search/marker details | `frontend/packages/map-shell/src/ShellSidebar.tsx`, `SearchPanel.tsx`, `MarkerDetailDrawer.tsx`; app-owned maps/data and coordinates |
| Settings and account | `frontend/packages/map-shell/src/ArkiveSettingsPanel.tsx`, `frontend/packages/auth/src/ArkiveAccountControl.tsx`; portal account views in `frontend/apps/meta/src/UserSystemPages.tsx` |
| Browsing/task memory | `frontend/packages/state-memory/src/index.ts`, `core.ts`, `mapSession.ts`; `frontend/packages/map-shell/src/useContentScrollRestoration.ts`; app record declarations |
| Game/tool registration | `frontend/apps/meta/src/sites.ts`, `featureCatalog.ts`, `toolCatalog.ts`; each game's shared home/navigation inventory. `HOME_TOOL_IDS` selects homepage tools independently. |
| Favorite state/recovery | `frontend/apps/meta/src/useCatalogFavorite.ts`, `UserSystemState.tsx`; game/tool/page callers own independent targets and result membership |

Run commands from `frontend/`; the repository manifest and
[acceptance procedure](../../../../docs/ui-system/visual-regression.md) remain
the command/coverage owners. `pnpm check:ui` covers scoped shared chrome;
`pnpm test --maxWorkers=2` includes regression tests. Use the affected app's
lint/build for coherent code batches. Shared changes require relevant cross-game
verification; tiny app-local follow-ups use focused checks before closeout.

The development gallery is `/ui-review.html` on the Meta dev server.
`pnpm ui:verify` compares existing local component references;
`--update-baseline` explicitly records candidates and is not a routine fix for a
failed comparison. `--routes` adds current portal/map references, not all-record
certification. A missing browser/server/login is a concrete limitation to report,
not a reason to invent successful evidence or change production configuration.
