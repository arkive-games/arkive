# Product Structure

Goal: quick information lookup and tool use. Shared visual identity is owned by
[visual foundations](visual-direction.md); game artwork and schemas may differ.

| Surface | User task and boundary |
| --- | --- |
| Homepage | Curated discovery; preserve its existing composition and direct destinations |
| All Games | Complete introduced-game directory, independent of homepage promotion |
| Game space | Reach its content through hierarchical navigation; homepage is optional and entry may open a map |
| Game homepage | When present, expose the same parents, children, names and targets as navigation |
| Tool Library | Complete tool directory, including tools without an Arkive game page and general utilities |
| Encyclopedia | Structured category lookup; presentation follows the game's data |
| Map / tool | Spatial exploration / focused task completion |
| Community | Player discussion; detailed forum work deferred |

## Content registration

| Addition | Required placement |
| --- | --- |
| New game | All Games; launched game entry/navigation; pending announcements may have only a directory item |
| Game content | Appropriate navigation parent, plus matching homepage branch if present |
| Game tool with a game entry | The same game surfaces plus Tool Library |
| Tool for a game without an entry | Tool Library, with association/types and Other membership |
| Unassociated utility | Tool Library under Other |

Use shared content definitions for navigation/homepage parity. Do not create a
homepage just to add content. Inventories remain expandable; an encyclopedia
child is not automatically a separate tool. Carousel, shelf and selected-tool
promotion are independent editorial decisions, never automatic registration.

See [catalogs](catalogs.md) for membership/targets and [portal](portal.md) for
curation. Current game/tool counts belong only in [dated evidence](evidence.md).

## New game and new tool launch checklist

Cross-check these single-source owners before opening or shipping a new surface:

**Desktop navigation, including portal-hosted game routes:** Follow the
[game identity rule](../ARKIVE_SITE_SPEC.yaml) and the
[Palworld TopNav implementation](../../frontend/apps/palworld/src/components/TopNav.tsx).
Use the shared `ArkiveMapTopBar` with both the localized game name and the
game icon. This applies equally to a standalone game app and a game inside
the portal (such as Glimmith); the portal homepage itself has no game chip.
Before launch, run `pnpm check:game-navigation` from `frontend/` after building
the apps and installing Playwright Chromium. PR CI checks each open entry in
the site registry, skipping only announced games without a public page.

| Surface | Required wiring and verification |
| --- | --- |
| New game app (`frontend/apps/<game>`) | 1. Register `GameId` in `backend-go` OpenAPI / `@gamemap/api-core` and add the `SiteCard` + `GAME_LOGOS` entry in `frontend/apps/meta/src/sites.ts` (keep `comingSoon: true` until artifacts and HTTPS are verified).<br>2. Add fixed port dev/build/lint scripts in `frontend/package.json` and include the app in `.github/workflows/ci.yml`.<br>3. Import `@gamemap/map-shell/arkive-map-theme.css` and declare `@custom-variant dark (&:is(.dark *));` in `src/index.css`; adopt shared top bar, mobile header/menu drawer, `ArkiveSiteFooter` (or map `About` panel), theme, account, and `@gamemap/state-memory` records (`pnpm memory:keys`).<br>4. Initialize `initBaiduAnalytics` + `trackPageview` and declare `VITE_TOY` in `env.d.ts` (`pnpm check:analytics`).<br>5. Provide branded `index.html` (`brand_identity.search_metadata.title_brand from ARKIVE_SITE_SPEC.yaml`), `public/robots.txt`, `public/sitemap.xml`, and enumerated `edgeone.json` rewrites (`"/x"` + `"/x*"`).<br>6. Add the `App` option on the GitHub Project board before opening the first PR; add the `.github/workflows/deploy.yml` matrix entry and custom domain only when ready to go live. |
| New tool or calculator | 1. Place under the game's navigation and game homepage (if the game has one), using shared content definitions.<br>2. Register in `frontend/apps/meta/src/toolCatalog.ts` with accurate game association, game types, and `Other` membership when applicable (editorial `HOME_TOOL_IDS` promotion is separate).<br>3. Choose persistence contract in [State memory](../ARKIVE_STATE_MEMORY_SPEC.yaml): automatic device draft for stateless calculators, or [explicit save/leave guard](tool-saving.md) for scheme editors; run `pnpm memory:keys`.<br>4. Add route rewrites to the host app's `edgeone.json` and `public/sitemap.xml` in the same commit. |
| New encyclopedia category | 1. Register in the game's shared navigation/directory inventory and `frontend/apps/meta/src/featureCatalog.ts` if exposed at portal level.<br>2. Reuse `ArkiveEncyclopediaWorkspace`, `CatalogSearchInput`, shared facet popovers, and `space-4` filter-to-content rhythm; omit `Showing N records` result-total rows and attach `data-pagination-anchor` to the persistent results wrapper when paginated.<br>3. Update `edgeone.json` and `public/sitemap.xml` together. |
