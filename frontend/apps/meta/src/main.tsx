import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from '@gamemap/auth'
import { createArkiveThemeStorage } from '@gamemap/ui'
import { initBaiduAnalytics, ThemeProvider } from '@gamemap/map-shell'
import './index.css'
import './i18n'
import App from './App'
import { AUTH_CONFIG } from './lib/auth'
import { UserSystemProvider } from './UserSystemState'

const themeStorage = createArkiveThemeStorage({ legacyKeys: ['meta.theme'] })

// Single-page, no router: the entry pageview hm.js reports is the whole visit.
initBaiduAnalytics({
  dev: import.meta.env.DEV,
  toy: Boolean(import.meta.env.VITE_TOY),
})

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
        <UserSystemProvider>
          <App />
        </UserSystemProvider>
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
)
