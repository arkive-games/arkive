import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router'
import { AuthProvider } from '@gamemap/auth'
import { initBaiduAnalytics, trackPageview, ThemeProvider } from '@gamemap/map-shell'
import { AUTH_CONFIG } from './lib/auth'
import 'leaflet/dist/leaflet.css'
import '@gamemap/map-engine/engine.css'
import './index.css'
import './i18n'
import MapPage from './features/map/MapPage'
import ChangelogPage from './features/changelog/ChangelogPage'
import VBloodListPage from './features/vblood/VBloodListPage'
import VBloodDetailPage from './features/vblood/VBloodDetailPage'
import KnowledgePage from './features/knowledge/KnowledgePage'
import { themeStorage } from './lib/storage'
import { initDataVersion } from './lib/urls'
import { isMapEngineChoice, type MapEngineChoice } from './lib/mapEngineChoice'
import { BottomTabBar } from './components/BottomTabBar'

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
    engine: isMapEngineChoice(s.engine) ? s.engine : undefined,
  }),
  component: MapPage,
})

// Site version history. Not a nav item — reached from the footer version link
// and the top-bar build hovercard.
const changelogRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/changelog',
  component: ChangelogPage,
})

const vbloodRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/vblood',
  component: VBloodListPage,
})

const vbloodDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/vblood/$id',
  component: VBloodDetailPage,
})

const databaseRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/database',
  component: () => <KnowledgePage kind="database" />,
})

const systemsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/systems',
  component: () => <KnowledgePage kind="systems" />,
})

const routeTree = rootRoute.addChildren([
  mapRoute,
  vbloodRoute,
  vbloodDetailRoute,
  databaseRoute,
  systemsRoute,
  changelogRoute,
])

const router = createRouter({ routeTree, basepath: import.meta.env.BASE_URL })
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
