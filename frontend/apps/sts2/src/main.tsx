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
import CardListPage from './features/cards/CardListPage'
import CardDetailPage from './features/cards/CardDetailPage'
import CharacterListPage from './features/characters/CharacterListPage'
import CharacterDetailPage from './features/characters/CharacterDetailPage'
import ChangelogPage from './features/changelog/ChangelogPage'
import { initDataVersion } from './lib/urls'
import { BottomTabBar } from './components/BottomTabBar'

const themeStorage = createArkiveThemeStorage({ legacyKeys: ['sts2.theme'] })

const rootRoute = createRootRoute({
  component: () => (
    <>
      <Outlet />
      <BottomTabBar />
    </>
  ),
})

const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: HomePage })
const cardsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/cards', component: CardListPage })
const cardDetailRoute = createRoute({ getParentRoute: () => rootRoute, path: '/cards/$id', component: CardDetailPage })
const charactersRoute = createRoute({ getParentRoute: () => rootRoute, path: '/characters', component: CharacterListPage })
const characterDetailRoute = createRoute({ getParentRoute: () => rootRoute, path: '/characters/$id', component: CharacterDetailPage })
const changelogRoute = createRoute({ getParentRoute: () => rootRoute, path: '/changelog', component: ChangelogPage })

const routeTree = rootRoute.addChildren([
  homeRoute, cardsRoute, cardDetailRoute, charactersRoute, characterDetailRoute, changelogRoute,
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
