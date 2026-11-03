import { StrictMode } from 'react'
import { AuthProvider, ARKIVE_PRODUCTION_API_URL, resolveAuthConfig } from '@gamemap/auth'
import { createRoot } from 'react-dom/client'
import { ThemeProvider, initBaiduAnalytics, trackPageview } from '@gamemap/map-shell'
import { App } from './App'
import { ChangelogPage } from './ChangelogPage'
import './index.css'
import { MobileMenu } from './SiteChrome'

initBaiduAnalytics({ dev: import.meta.env.DEV, toy: Boolean(import.meta.env.VITE_TOY) })
trackPageview()

// Each page is a full document load, so the path is read once rather than routed.
const page = window.location.pathname.startsWith('/changelog') ? <ChangelogPage /> : <App />
const auth = resolveAuthConfig({ apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.PROD ? ARKIVE_PRODUCTION_API_URL : undefined), isToy: Boolean(import.meta.env.VITE_TOY) })

createRoot(document.getElementById('root')!).render(
  <StrictMode><ThemeProvider><AuthProvider {...auth}>{page}<MobileMenu /></AuthProvider></ThemeProvider></StrictMode>,
)
