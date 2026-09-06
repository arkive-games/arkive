import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { initBaiduAnalytics, ThemeProvider } from '@gamemap/map-shell'
import { createArkiveThemeStorage } from '@gamemap/ui'
import App from './App'
import './index.css'

// The theme is a site-wide preference, not a per-app one: every Arkive game
// reads and writes the same `arkive.memory.site.interface.theme` entry, so a
// visitor who picked dark on one game gets dark here too. Without a storage
// adapter ThemeProvider still renders, but `get`/`set` become no-ops — the
// shared preference is ignored and the visitor's choice dies on reload.
const themeStorage = createArkiveThemeStorage({ legacyKeys: ['ro3.theme'] })

// Baidu Tongji counts the entry page only. RO3 has no router, so the pushState
// navigation in App reports every client-side page change after it.
initBaiduAnalytics({
  dev: import.meta.env.DEV,
  toy: Boolean(import.meta.env.VITE_TOY),
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider defaultTheme="auto" storage={themeStorage}>
      <App />
    </ThemeProvider>
  </StrictMode>,
)
