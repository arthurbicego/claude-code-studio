import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router'
import './index.css'
import './i18n'
import { SettingsPage } from '@/components/SettingsPage'
import { ToastContainer } from '@/components/ToastContainer'
import { PrefsProvider } from '@/hooks/usePrefs'
import { I18nSync } from '@/i18n/I18nSync'
import { loadBootToken } from '@/lib/bootToken'
import App from './App.tsx'

const root = createRoot(document.getElementById('root')!)

// Block render until the boot token is in memory so the first PTY/shell WebSocket open never
// races the auth fetch. The token is only used to gate /pty WS upgrades; failing to load it
// here means the backend is unreachable, in which case rendering an empty shell is fine —
// the user will see fetch errors as soon as the App tries to talk to /api anyway.
loadBootToken()
  .catch((err) => {
    console.warn('failed to load boot token before render', err)
  })
  .finally(() => {
    root.render(
      <StrictMode>
        <PrefsProvider>
          <I18nSync />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<App />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<App />} />
            </Routes>
          </BrowserRouter>
          <ToastContainer />
        </PrefsProvider>
      </StrictMode>,
    )
  })
