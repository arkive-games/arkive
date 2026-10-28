import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider, initBaiduAnalytics, trackPageview } from '@gamemap/map-shell'
import { App } from './App'
import { ChangelogPage } from './ChangelogPage'
import './index.css'

initBaiduAnalytics({ dev: import.meta.env.DEV, toy: Boolean(import.meta.env.VITE_TOY) })
trackPageview()

// Each page is a full document load, so the path is read once rather than routed.
const page = window.location.pathname.startsWith('/changelog') ? <ChangelogPage /> : <App />

createRoot(document.getElementById('root')!).render(
  <StrictMode><ThemeProvider>{page}</ThemeProvider></StrictMode>,
)
