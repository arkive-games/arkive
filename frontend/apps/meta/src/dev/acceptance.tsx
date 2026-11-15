import { createRoot } from 'react-dom/client'
import { ARKIVE_PRODUCTION_API_URL, AuthProvider, CORE_API_PREFIX, createLocalTokenStorage } from '@gamemap/auth'
import { ThemeProvider } from '@gamemap/map-shell'
import App from '../App'
import { UserSystemProvider } from '../UserSystemState'
import '../i18n'
import '../index.css'
import '../home.css'
import '../home-landing.css'

// A real session in an isolated local browser; no mocked identity or profile.
// Bearer transport is the existing supported alternative to cross-site cookies.
createRoot(document.getElementById('root')!).render(
  <ThemeProvider defaultTheme="auto">
    <AuthProvider baseUrl={`${ARKIVE_PRODUCTION_API_URL}${CORE_API_PREFIX}`} transport="bearer" storage={createLocalTokenStorage()}>
      <UserSystemProvider><App /></UserSystemProvider>
    </AuthProvider>
  </ThemeProvider>,
)
