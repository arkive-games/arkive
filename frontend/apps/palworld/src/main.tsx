import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { ThemeProvider, type Theme, type ThemeStorage } from '@gamemap/map-shell'
import 'leaflet/dist/leaflet.css'
import '@gamemap/map-engine/engine.css'
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
import TechnologyPage from './features/technology/TechnologyPage'
import DungeonListPage from './features/dungeons/DungeonListPage'
import DungeonDetailPage from './features/dungeons/DungeonDetailPage'
import QuestListPage from './features/quests/QuestListPage'
import QuestDetailPage from './features/quests/QuestDetailPage'
import PassivesPage from './features/pals/PassivesPage'
import ActiveSkillsPage from './features/pals/ActiveSkillsPage'
import ActiveSkillDetailPage from './features/pals/ActiveSkillDetailPage'
import PartnerSkillsPage from './features/pals/PartnerSkillsPage'
import { BottomTabBar } from './components/BottomTabBar'

const THEME_KEY = 'palworld.theme'
const themeStorage: ThemeStorage = {
  get: () => {
    try {
      const v = localStorage.getItem(THEME_KEY)
      return v === 'light' || v === 'dark' || v === 'auto' ? (v as Theme) : null
    } catch {
      return null
    }
  },
  set: (t) => {
    try {
      localStorage.setItem(THEME_KEY, t)
    } catch { /* no storage */ }
  },
}

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
}
const mapRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  validateSearch: (s: Record<string, unknown>): MapSearch => ({
    q: typeof s.q === 'string' ? s.q : undefined,
    map: typeof s.map === 'string' ? s.map : undefined,
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
  technologyRoute,
  dungeonsRoute,
  dungeonDetailRoute,
  questsRoute,
  questDetailRoute,
])
const router = createRouter({ routeTree, basepath: import.meta.env.BASE_URL })
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider defaultTheme="auto" storage={themeStorage}>
      <RouterProvider router={router} />
    </ThemeProvider>
  </StrictMode>,
)
