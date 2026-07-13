import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { AuthProvider } from './lib/auth.tsx'
import { ProviderRoot } from './lib/provider/root.tsx'
import { ThemeProvider } from './components/themeKit.tsx'
import FloatingThemeBar from './components/FloatingThemeBar.tsx'
import AppRoutes from './routes.tsx'

// ThemeProvider wraps the whole DOM tree (context never crosses the R3F
// Canvas roots — the 3D scenes stay untouched; only DOM chrome themes).
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <ProviderRoot>
          <AppRoutes />
        </ProviderRoot>
      </AuthProvider>
      <FloatingThemeBar />
    </ThemeProvider>
  </StrictMode>,
)
