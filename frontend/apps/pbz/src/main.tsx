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
import ChangelogPage from './features/changelog/ChangelogPage'
import { BottomTabBar } from './components/BottomTabBar'

const themeStorage = createArkiveThemeStorage()

const rootRoute = createRootRoute({
  component: () => (
    <>
      <Outlet />
      <BottomTabBar />
    </>
  ),
})

const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: HomePage })
const changelogRoute = createRoute({ getParentRoute: () => rootRoute, path: '/changelog', component: ChangelogPage })

const routeTree = rootRoute.addChildren([homeRoute, changelogRoute])

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

// No data artifact is fetched yet: data-pbz does not exist until the first
// extraction lands. When it does, resolve its version.json before first render
// the way the other games do (initDataVersion in their lib/urls.ts).
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
