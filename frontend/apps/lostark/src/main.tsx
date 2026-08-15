import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { AuthProvider } from '@gamemap/auth'
import { initBaiduAnalytics, ThemeProvider } from '@gamemap/map-shell'
import { createArkiveThemeStorage } from '@gamemap/ui'
import { AUTH_CONFIG } from './lib/auth'
import './index.css'
import App from './App'
import MapPage from './features/map/MapPage'

const themeStorage = createArkiveThemeStorage({ legacyKeys: ['lostark.theme'] })

initBaiduAnalytics({
  dev: import.meta.env.DEV,
  toy: Boolean(import.meta.env.VITE_TOY),
})

const rootRoute = createRootRoute({ component: () => <Outlet /> })

// The calculator keeps `/`, so every existing link and bookmark still lands on
// it and the map is purely additive.
const calculatorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: App,
})

const mapRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/map',
  component: MapPage,
})

const router = createRouter({
  routeTree: rootRoute.addChildren([calculatorRoute, mapRoute]),
  basepath: import.meta.env.BASE_URL,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider defaultTheme="dark" storage={themeStorage}>
      {/* Mounted unconditionally, with `enabled` doing the gating: mounting
          the provider conditionally would change hook order between builds. */}
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
