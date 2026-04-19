import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { usePrefs } from '@/hooks/usePrefs'
import { detectBrowserLocale, isSupportedLocale } from './index'

export function I18nSync() {
  const { i18n } = useTranslation()
  const { prefs, loaded, setLocale } = usePrefs()

  useEffect(() => {
    if (!loaded) return
    const stored = prefs.locale
    if (stored && isSupportedLocale(stored)) {
      if (i18n.language !== stored) i18n.changeLanguage(stored)
      return
    }
    const detected = detectBrowserLocale()
    if (i18n.language !== detected) i18n.changeLanguage(detected)
    setLocale(detected)
  }, [loaded, prefs.locale, i18n, setLocale])

  useEffect(() => {
    document.documentElement.lang = i18n.language
  }, [i18n.language])

  return null
}
