import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider, initBaiduAnalytics, trackPageview } from '@gamemap/map-shell'
import { App } from './App'
import './index.css'

initBaiduAnalytics({ dev: import.meta.env.DEV, toy: Boolean(import.meta.env.VITE_TOY) })
trackPageview()

createRoot(document.getElementById('root')!).render(
  <StrictMode><ThemeProvider><App /></ThemeProvider></StrictMode>,
)
