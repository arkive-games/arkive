import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from '@gamemap/auth'
import { ThemeProvider, type Theme, type ThemeStorage } from '@gamemap/map-shell'
import { AUTH_CONFIG } from './lib/auth'
import './index.css'
import App from './App'

const THEME_KEY = 'lostark.theme'

// The shared ThemeProvider is storage-free by contract, so the app supplies the
// adapter. Wrapped in try/catch because private mode makes localStorage throw
// rather than return null.
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
    } catch {
      /* no storage */
    }
  },
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
        <App />
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
)
