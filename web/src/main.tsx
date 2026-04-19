import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router'
import './index.css'
import './i18n'
import { SettingsPage } from '@/components/SettingsPage'
import { ToastContainer } from '@/components/ToastContainer'
import { PrefsProvider } from '@/hooks/usePrefs'
import { I18nSync } from '@/i18n/I18nSync'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
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
