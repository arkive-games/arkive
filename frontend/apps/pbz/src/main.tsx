import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createHashHistory, createRootRoute, createRoute, createRouter, lazyRouteComponent, Outlet, RouterProvider } from '@tanstack/react-router'
import { AuthProvider } from '@gamemap/auth'
import { initBaiduAnalytics, ThemeProvider, trackPageview } from '@gamemap/map-shell'
import { AUTH_CONFIG } from './lib/auth'
import './index.css'
import './i18n'
import ChangelogPage from './features/changelog/ChangelogPage'
import { WeaponDetailPage, WeaponListPage } from './features/wiki/WeaponPages'
import { AccessoryDetailPage, AccessoryListPage, MedicineDetailPage, MedicineListPage } from './features/wiki/GearPages'
import { ItemDetailPage, ItemListPage } from './features/wiki/ItemPages'
import { EnemyDetailPage, EnemyListPage } from './features/wiki/GalleryPages'
import SkillPage from './features/wiki/SkillPage'
import { BottomTabBar } from './components/BottomTabBar'
import { initDataVersion } from './lib/urls'
import { themeStorage } from './lib/storage'

const rootRoute = createRootRoute({
  component: () => (
    <>
      <Outlet />
      <BottomTabBar />
    </>
  ),
})

export interface MapSearch {
  /** Prefill the marker search box. */
  q?: string
}
const mapRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  validateSearch: (s: Record<string, unknown>): MapSearch => ({
    q: typeof s.q === 'string' ? s.q : undefined,
  }),
  // Lazy, so three.js and the map engine stay out of every other page's bundle.
  component: lazyRouteComponent(() => import('./features/map/MapPage')),
})
const changelogRoute = createRoute({ getParentRoute: () => rootRoute, path: '/changelog', component: ChangelogPage })

// The wiki pages, each spelled out: the router types its links from the literal paths.
const wikiRoutes = [
  createRoute({ getParentRoute: () => rootRoute, path: '/weapons', component: () => <WeaponListPage kind="weapons" /> }),
  createRoute({ getParentRoute: () => rootRoute, path: '/weapons/$id', component: () => <WeaponDetailPage kind="weapons" /> }),
  createRoute({ getParentRoute: () => rootRoute, path: '/phantom-edges', component: () => <WeaponListPage kind="phantomEdges" /> }),
  createRoute({ getParentRoute: () => rootRoute, path: '/phantom-edges/$id', component: () => <WeaponDetailPage kind="phantomEdges" /> }),
  createRoute({ getParentRoute: () => rootRoute, path: '/accessories', component: AccessoryListPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/accessories/$id', component: AccessoryDetailPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/medicines', component: MedicineListPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/medicines/$id', component: MedicineDetailPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/items', component: ItemListPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/items/$id', component: ItemDetailPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/enemies', component: EnemyListPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/enemies/$id', component: EnemyDetailPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/skills', component: SkillPage }),
] as const

const routeTree = rootRoute.addChildren([mapRoute, changelogRoute, ...wikiRoutes])

// Toy builds (VITE_TOY, see scripts/toy-build.mjs) are served under
// https://www.bilibili.com/toy/<slug>/ where only index.html exists as a real
// file — deep links must live in the hash or refreshes 404.
const router = import.meta.env.VITE_TOY
  ? createRouter({ routeTree, history: createHashHistory(), basepath: '/' })
  : createRouter({ routeTree, basepath: import.meta.env.BASE_URL })
declare module '@tanstack/react-router' {
  interface Register { router: typeof router }
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
// internally, so a slow data host can't block the app).
void initDataVersion().then(() => createRoot(document.getElementById('root')!).render(
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
))
