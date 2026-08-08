import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from '@gamemap/auth'
import { ThemeProvider, type Theme, type ThemeStorage } from '@gamemap/map-shell'
import './index.css'
import './i18n'
import App from './App'
import { AUTH_CONFIG } from './lib/auth'

const THEME_KEY = 'meta.theme'
const themeStorage: ThemeStorage = {
  get: () => {
    try {
      const v = localStorage.getItem(THEME_KEY)
      return v === 'light' || v === 'dark' || v === 'auto' ? (v as Theme) : null
    } catch {
      return null
    }
  },
  set: (t) => {
    try {
      localStorage.setItem(THEME_KEY, t)
    } catch { /* no storage */ }
  },
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider defaultTheme="auto" storage={themeStorage}>
      {/* Mounted unconditionally, with `enabled` doing the gating: mounting the
          provider conditionally would change hook order between builds. */}
      <AuthProvider
        baseUrl={AUTH_CONFIG.baseUrl}
        transport={AUTH_CONFIG.transport}
        enabled={AUTH_CONFIG.enabled}
      >
        <App />
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
)
