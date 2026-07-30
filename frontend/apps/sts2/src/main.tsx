import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router'
import { ThemeProvider, type Theme, type ThemeStorage } from '@gamemap/map-shell'
import './index.css'
import './i18n'
import HomePage from './features/home/HomePage'
import CardListPage from './features/cards/CardListPage'
import CardDetailPage from './features/cards/CardDetailPage'
import CharacterListPage from './features/characters/CharacterListPage'
import CharacterDetailPage from './features/characters/CharacterDetailPage'
import ChangelogPage from './features/changelog/ChangelogPage'
import { initDataVersion } from './lib/urls'

const THEME_KEY = 'sts2.theme'
const themeStorage: ThemeStorage = {
  get: () => {
    try {
      const v = localStorage.getItem(THEME_KEY)
      return v === 'light' || v === 'dark' || v === 'auto' ? (v as Theme) : null
    } catch { return null }
  },
  set: (t) => { try { localStorage.setItem(THEME_KEY, t) } catch { /* no storage */ } },
}

const rootRoute = createRootRoute({ component: () => <Outlet /> })

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
