import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router'
import './index.css'
import App from './App.tsx'
import { SettingsPage } from '@/components/SettingsPage'
import { PrefsProvider } from '@/hooks/usePrefs'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PrefsProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<App />} />
        </Routes>
      </BrowserRouter>
    </PrefsProvider>
  </StrictMode>,
)
