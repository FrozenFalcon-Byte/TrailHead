import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@fontsource-variable/archivo/standard.css'
import './index.css'
import './ui.css'
import App from './App'
import { AuthProvider } from './lib/auth'
import { initTheme } from './lib/theme'
import { applyPrefs } from './lib/prefs'
import { watchWake } from './lib/wake'

initTheme()
// ping the API straight away, so a sleeping host is already booting while the visitor reads or signs in
watchWake()
applyPrefs()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
