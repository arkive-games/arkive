import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { AuthProvider } from '@gamemap/auth'
import { createArkiveThemeStorage } from '@gamemap/ui'
import { initBaiduAnalytics, ThemeProvider, trackPageview } from '@gamemap/map-shell'
import { AUTH_CONFIG } from './lib/auth'
import 'leaflet/dist/leaflet.css'
import '@gamemap/map-engine/engine.css'
// The WebGL engine's own stylesheet is NOT imported here: it rides along with the
// engine's lazy chunk (see features/map/GlMapView) so only the map route pays for
// it — the catalog/detail pages never fetch it.
import './index.css'
import './i18n'
import App from './App'
import BreedingPage from './features/breeding/BreedingPage'
import { parseTreeParam, type BreedTreeNode } from './lib/breeding'
import PalListPage from './features/pals/PalListPage'
import PalDetailPage from './features/pals/PalDetailPage'
import ItemListPage from './features/items/ItemListPage'
import ItemDetailPage from './features/items/ItemDetailPage'
import BuildingListPage from './features/buildings/BuildingListPage'
import BuildingDetailPage from './features/buildings/BuildingDetailPage'
import MerchantListPage from './features/merchants/MerchantListPage'
import MerchantDetailPage from './features/merchants/MerchantDetailPage'
import TechnologyPage from './features/technology/TechnologyPage'
import DungeonListPage from './features/dungeons/DungeonListPage'
import DungeonDetailPage from './features/dungeons/DungeonDetailPage'
import DungeonLayoutPage from './features/dungeons/DungeonLayoutPage'
import QuestListPage from './features/quests/QuestListPage'
import QuestDetailPage from './features/quests/QuestDetailPage'
import BaseCampPage from './features/basecamp/BaseCampPage'
import ResearchPage from './features/research/ResearchPage'
import RaidsPage from './features/raids/RaidsPage'
import FishingPage from './features/fishing/FishingPage'
import RegionDetailPage from './features/regions/RegionDetailPage'
import StatSimulatorPage from './features/simulator/StatSimulatorPage'
import PassivesPage from './features/pals/PassivesPage'
import ActiveSkillsPage from './features/pals/ActiveSkillsPage'
import ActiveSkillDetailPage from './features/pals/ActiveSkillDetailPage'
import PartnerSkillsPage from './features/pals/PartnerSkillsPage'
import ChangelogPage from './features/changelog/ChangelogPage'
import { BottomTabBar } from './components/BottomTabBar'
import { initDataVersion } from './lib/urls'
import { isMapEngineChoice, type MapEngineChoice } from './lib/mapEngineChoice'

const themeStorage = createArkiveThemeStorage({ legacyKeys: ['palworld.theme'] })

const rootRoute = createRootRoute({
  component: () => (
    <>
      <Outlet />
      <BottomTabBar />
    </>
  ),
})
export interface MapSearch {
  /** Prefill the marker search box (e.g. a pal name from the encyclopedia). */
  q?: string
  /** Open a specific map instead of the default MainWorld. */
  map?: string
  x?: number
  y?: number
  /**
   * Render-engine override for this visit: `gl` mounts the WebGL (three.js) map
   * engine, `leaflet` the original one. When present it beats the persisted
   * choice without overwriting it — see `lib/mapEngineChoice`.
   */
  engine?: MapEngineChoice
}
const mapRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  validateSearch: (s: Record<string, unknown>): MapSearch => ({
    q: typeof s.q === 'string' ? s.q : undefined,
    map: typeof s.map === 'string' ? s.map : undefined,
    x: (typeof s.x === 'string' || typeof s.x === 'number') && Number.isFinite(Number(s.x)) ? Number(s.x) : undefined,
    y: (typeof s.y === 'string' || typeof s.y === 'number') && Number.isFinite(Number(s.y)) ? Number(s.y) : undefined,
    engine: isMapEngineChoice(s.engine) ? s.engine : undefined,
  }),
  component: App,
})
export interface BreedingSearch {
  a?: string
  b?: string
  c?: string
  /** Focused-recipe drill-down (multi-layer breeding tree); see BreedTreeNode. */
  tree?: BreedTreeNode
  /** Multi-generation planner mode: generation budget (present = mode active). */
  gen?: 2 | 3 | 4 | 5 | 6
  /** Planner result layout: prefix-tree grouping instead of the flat chain list. */
  view?: 'tree'
}
const breedingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/breeding',
  // Parent A / Parent B / Child prefill, e.g. /breeding?c=Anubis
  validateSearch: (s: Record<string, unknown>): BreedingSearch => ({
    a: typeof s.a === 'string' ? s.a : undefined,
    b: typeof s.b === 'string' ? s.b : undefined,
    c: typeof s.c === 'string' ? s.c : undefined,
    tree: parseTreeParam(s.tree),
    gen: [2, 3, 4, 5, 6].includes(Number(s.gen)) ? (Number(s.gen) as 2 | 3 | 4 | 5 | 6) : undefined,
    view: s.view === 'tree' ? 'tree' : undefined,
  }),
  component: BreedingPage,
})
const palsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/pals',
  component: PalListPage,
})
const palDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/pals/$id',
  component: PalDetailPage,
})
const passivesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/passives',
  component: PassivesPage,
})
const activeSkillsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/active-skills',
  component: ActiveSkillsPage,
})
const activeSkillDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/active-skills/$id',
  component: ActiveSkillDetailPage,
})
const partnerSkillsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/partner-skills',
  component: PartnerSkillsPage,
})
const itemsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/items',
  component: ItemListPage,
})
const itemDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/items/$id',
  component: ItemDetailPage,
})
const buildingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/buildings',
  component: BuildingListPage,
})
const buildingDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/buildings/$id',
  component: BuildingDetailPage,
})
const merchantsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/merchants',
  component: MerchantListPage,
})
const merchantDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/merchants/$id',
  component: MerchantDetailPage,
})
export interface TechnologySearch {
  /** Tech id to scroll to and highlight on load, e.g. /technology?tech=Workbench */
  tech?: string
}
const technologyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/technology',
  validateSearch: (s: Record<string, unknown>): TechnologySearch => ({
    tech: typeof s.tech === 'string' ? s.tech : undefined,
  }),
  component: TechnologyPage,
})
export interface DungeonsSearch {
  /** Legacy deep link (/dungeons?d=<SpawnAreaId>) — redirects to /dungeons/$id. */
  d?: string
}
const dungeonsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dungeons',
  validateSearch: (s: Record<string, unknown>): DungeonsSearch => ({
    d: typeof s.d === 'string' ? s.d : undefined,
  }),
  component: DungeonListPage,
})
const dungeonDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dungeons/$id',
  component: DungeonDetailPage,
})
const dungeonLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dungeons/$id/layouts/$variant',
  component: DungeonLayoutPage,
})
const questsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/quests',
  component: QuestListPage,
})
const questDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/quests/$id',
  component: QuestDetailPage,
})
const basecampRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/basecamp',
  component: BaseCampPage,
})
const researchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/research',
  component: ResearchPage,
})
const raidsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/raids',
  component: RaidsPage,
})
const fishingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/fishing',
  component: FishingPage,
})
export interface StatSimulatorSearch {
  /** Pal to simulate, e.g. /stat-simulator?pal=Anubis */
  pal?: string
}
const statSimulatorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/stat-simulator',
  validateSearch: (s: Record<string, unknown>): StatSimulatorSearch => ({
    pal: typeof s.pal === 'string' ? s.pal : undefined,
  }),
  component: StatSimulatorPage,
})
// Loot-region detail page ($id = a blueprint-sources area key, e.g. "Grass",
// "Sakurajima", "Oilrig") — linked from item pages' chest/fishing/… chips.
const regionDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/regions/$id',
  component: RegionDetailPage,
})
// Site version history. Not a nav item — reached from the footer version link
// and the top-bar build hovercard.
const changelogRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/changelog',
  component: ChangelogPage,
})
const routeTree = rootRoute.addChildren([
  mapRoute,
  breedingRoute,
  palsRoute,
  palDetailRoute,
  passivesRoute,
  activeSkillsRoute,
  activeSkillDetailRoute,
  partnerSkillsRoute,
  itemsRoute,
  itemDetailRoute,
  buildingsRoute,
  buildingDetailRoute,
  merchantsRoute,
  merchantDetailRoute,
  technologyRoute,
  dungeonsRoute,
  dungeonDetailRoute,
  dungeonLayoutRoute,
  questsRoute,
  questDetailRoute,
  basecampRoute,
  researchRoute,
  raidsRoute,
  fishingRoute,
  statSimulatorRoute,
  regionDetailRoute,
  changelogRoute,
])
// Toy builds (VITE_TOY, see scripts/toy-build.mjs) are served under
// https://www.bilibili.com/toy/<slug>/ where only index.html exists as a real
// file — deep links must live in the hash or refreshes 404.
const router = import.meta.env.VITE_TOY
  ? createRouter({ routeTree, history: createHashHistory(), basepath: '/' })
  : createRouter({ routeTree, basepath: import.meta.env.BASE_URL })
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

// Baidu Tongji counts the entry page only, so the router reports every
// client-side navigation after it.
initBaiduAnalytics({
  dev: import.meta.env.DEV,
  toy: Boolean(import.meta.env.VITE_TOY),
})
router.subscribe('onResolved', () => trackPageview())

// Resolve the data-artifact version before first render so every data fetch
// carries its ?v= cache-buster (initDataVersion never rejects and times out
// internally, so a slow/unversioned data host can't block the app).
void initDataVersion().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ThemeProvider defaultTheme="auto" storage={themeStorage}>
        {/* Mounted unconditionally, with `enabled` doing the gating: mounting
            the provider conditionally would change hook order between the Toy
            build and the normal one. */}
        <AuthProvider
          baseUrl={AUTH_CONFIG.baseUrl}
          transport={AUTH_CONFIG.transport}
          enabled={AUTH_CONFIG.enabled}
        >
          <RouterProvider router={router} />
        </AuthProvider>
      </ThemeProvider>
    </StrictMode>,
  )
})
