import { lazy, Suspense, StrictMode } from 'react'
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
// The map engine's stylesheet is NOT imported here: it rides along with the
// engine's lazy chunk (see features/map/GlMapView) so only the routes that draw a
// map pay for it.
import './index.css'
import './i18n'
import App from './App'
import { parseTreeParam, type BreedTreeNode } from './lib/breeding'
// Non-map routes are independent surfaces. Keep their code out of the map
// entry chunk; the root Suspense boundary below displays the map shell while
// the selected page is fetched.
const BreedingPage = lazy(() => import('./features/breeding/BreedingPage'))
const PalListPage = lazy(() => import('./features/pals/PalListPage'))
const PalDetailPage = lazy(() => import('./features/pals/PalDetailPage'))
const ItemListPage = lazy(() => import('./features/items/ItemListPage'))
const ItemDetailPage = lazy(() => import('./features/items/ItemDetailPage'))
const BuildingListPage = lazy(() => import('./features/buildings/BuildingListPage'))
const BuildingDetailPage = lazy(() => import('./features/buildings/BuildingDetailPage'))
const MerchantListPage = lazy(() => import('./features/merchants/MerchantListPage'))
const MerchantDetailPage = lazy(() => import('./features/merchants/MerchantDetailPage'))
const TechnologyPage = lazy(() => import('./features/technology/TechnologyPage'))
const DungeonListPage = lazy(() => import('./features/dungeons/DungeonListPage'))
const DungeonDetailPage = lazy(() => import('./features/dungeons/DungeonDetailPage'))
const DungeonLayoutPage = lazy(() => import('./features/dungeons/DungeonLayoutPage'))
const QuestListPage = lazy(() => import('./features/quests/QuestListPage'))
const QuestDetailPage = lazy(() => import('./features/quests/QuestDetailPage'))
const BaseCampPage = lazy(() => import('./features/basecamp/BaseCampPage'))
const ResearchPage = lazy(() => import('./features/research/ResearchPage'))
const RaidsPage = lazy(() => import('./features/raids/RaidsPage'))
const FishingPage = lazy(() => import('./features/fishing/FishingPage'))
const RegionDetailPage = lazy(() => import('./features/regions/RegionDetailPage'))
const StatSimulatorPage = lazy(() => import('./features/simulator/StatSimulatorPage'))
const PassivesPage = lazy(() => import('./features/pals/PassivesPage'))
const ActiveSkillsPage = lazy(() => import('./features/pals/ActiveSkillsPage'))
const ActiveSkillDetailPage = lazy(() => import('./features/pals/ActiveSkillDetailPage'))
const PartnerSkillsPage = lazy(() => import('./features/pals/PartnerSkillsPage'))
const ChangelogPage = lazy(() => import('./features/changelog/ChangelogPage'))
import { BottomTabBar } from './components/BottomTabBar'
import { initDataVersion } from './lib/urls'

const themeStorage = createArkiveThemeStorage({ legacyKeys: ['palworld.theme'] })

const rootRoute = createRootRoute({
  component: () => (
    <>
      <Suspense fallback={<div className="min-h-dvh bg-background" aria-busy="true" />}>
        <Outlet />
      </Suspense>
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
}
const mapRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  validateSearch: (s: Record<string, unknown>): MapSearch => ({
    q: typeof s.q === 'string' ? s.q : undefined,
    map: typeof s.map === 'string' ? s.map : undefined,
    x: (typeof s.x === 'string' || typeof s.x === 'number') && Number.isFinite(Number(s.x)) ? Number(s.x) : undefined,
    y: (typeof s.y === 'string' || typeof s.y === 'number') && Number.isFinite(Number(s.y)) ? Number(s.y) : undefined,
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
