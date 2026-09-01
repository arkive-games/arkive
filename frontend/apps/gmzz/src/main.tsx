import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router'
import { AuthProvider } from '@gamemap/auth'
import { createArkiveThemeStorage } from '@gamemap/ui'
import { initBaiduAnalytics, ThemeProvider, trackPageview } from '@gamemap/map-shell'
import { AUTH_CONFIG } from './lib/auth'
import './index.css'
import './i18n'
import HomePage from './features/home/HomePage'
import TrainTradeGoodsPage from './features/traintrade/TrainTradeGoodsPage'
import TrainTradeStationToolPage from './features/traintrade/TrainTradeStationToolPage'
import UtopiaPage from './features/utopia/UtopiaPage'
import ReforgePage from './features/reforge/ReforgePage'
import ScorePage from './features/score/ScorePage'
import ChangelogPage from './features/changelog/ChangelogPage'
import { initDataVersion } from './lib/urls'
import { BottomTabBar } from './components/BottomTabBar'

const themeStorage = createArkiveThemeStorage({ legacyKeys: ['gmzz.theme'] })

const rootRoute = createRootRoute({
  component: () => (
    <>
      <Outlet />
      <BottomTabBar />
    </>
  ),
})

const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: HomePage })
const trainTradeRoute = createRoute({ getParentRoute: () => rootRoute, path: '/traintrade', component: TrainTradeGoodsPage })
const stationToolRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tools/traintrade-station', component: TrainTradeStationToolPage })
const utopiaRoute = createRoute({ getParentRoute: () => rootRoute, path: '/utopia', component: UtopiaPage })
const reforgeRoute = createRoute({ getParentRoute: () => rootRoute, path: '/reforge', component: ReforgePage })
const scoreRoute = createRoute({ getParentRoute: () => rootRoute, path: '/score', component: ScorePage })
const changelogRoute = createRoute({ getParentRoute: () => rootRoute, path: '/changelog', component: ChangelogPage })

const routeTree = rootRoute.addChildren([
  homeRoute, trainTradeRoute, stationToolRoute, utopiaRoute, reforgeRoute, scoreRoute, changelogRoute,
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
