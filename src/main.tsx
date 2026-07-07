import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { AuthProvider } from './lib/auth.tsx'
import { ProviderRoot } from './lib/provider/root.tsx'
import AppRoutes from './routes.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <ProviderRoot>
        <AppRoutes />
      </ProviderRoot>
    </AuthProvider>
  </StrictMode>,
)
