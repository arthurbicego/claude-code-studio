import { type Locale, SUPPORTED_LOCALES } from '@shared/types'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import enUS from './locales/en-US.json'
import esES from './locales/es-ES.json'
import ptBR from './locales/pt-BR.json'

const FALLBACK: Locale = 'en-US'

export function detectBrowserLocale(): Locale {
  if (typeof navigator === 'undefined') return FALLBACK
  const candidates = [navigator.language, ...(navigator.languages ?? [])]
  for (const raw of candidates) {
    if (!raw) continue
    const lower = raw.toLowerCase()
    if (lower.startsWith('pt')) return 'pt-BR'
    if (lower.startsWith('es')) return 'es-ES'
    if (lower.startsWith('en')) return 'en-US'
  }
  return FALLBACK
}

export function isSupportedLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as string[]).includes(value)
}

i18n.use(initReactI18next).init({
  resources: {
    'pt-BR': { translation: ptBR },
    'en-US': { translation: enUS },
    'es-ES': { translation: esES },
  },
  lng: detectBrowserLocale(),
  fallbackLng: FALLBACK,
  interpolation: { escapeValue: false },
  returnNull: false,
})

export default i18n
