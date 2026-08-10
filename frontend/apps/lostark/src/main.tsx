import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from '@gamemap/auth'
import { initBaiduAnalytics, ThemeProvider } from '@gamemap/map-shell'
import { createArkiveThemeStorage } from '@gamemap/ui'
import { AUTH_CONFIG } from './lib/auth'
import './index.css'
import App from './App'

const themeStorage = createArkiveThemeStorage({ legacyKeys: ['lostark.theme'] })

// Single-page, no router: the entry pageview hm.js reports is the whole visit.
initBaiduAnalytics({
  dev: import.meta.env.DEV,
  toy: Boolean(import.meta.env.VITE_TOY),
})

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
