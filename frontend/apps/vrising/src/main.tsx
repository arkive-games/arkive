import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router'
import { ThemeProvider } from '@gamemap/map-shell'
import 'leaflet/dist/leaflet.css'
import '@gamemap/map-engine/engine.css'
import './index.css'
import './i18n'
import MapPage from './features/map/MapPage'
import ChangelogPage from './features/changelog/ChangelogPage'
import { themeStorage } from './lib/storage'
import { initDataVersion } from './lib/urls'

const rootRoute = createRootRoute({ component: () => <Outlet /> })

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
  component: MapPage,
})

// Site version history. Not a nav item — reached from the footer version link
// and the top-bar build hovercard.
const changelogRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/changelog',
  component: ChangelogPage,
})

const routeTree = rootRoute.addChildren([mapRoute, changelogRoute])

const router = createRouter({ routeTree, basepath: import.meta.env.BASE_URL })
declare module '@tanstack/react-router' {
  interface Register { router: typeof router }
}

// Resolve the data-artifact version before first render so every data fetch
// carries its ?v= cache-buster (initDataVersion never rejects and times out
// internally, so a slow data host can't block the app).
void initDataVersion().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ThemeProvider defaultTheme="auto" storage={themeStorage}>
        <RouterProvider router={router} />
      </ThemeProvider>
    </StrictMode>,
  )
})
