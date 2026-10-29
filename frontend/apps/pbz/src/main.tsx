import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createRootRoute, createRoute, createRouter, lazyRouteComponent, Outlet, RouterProvider } from '@tanstack/react-router'
import { AuthProvider } from '@gamemap/auth'
import { initBaiduAnalytics, ThemeProvider, trackPageview } from '@gamemap/map-shell'
import { AUTH_CONFIG } from './lib/auth'
import './index.css'
import './i18n'
import ChangelogPage from './features/changelog/ChangelogPage'
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

const routeTree = rootRoute.addChildren([mapRoute, changelogRoute])

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
