import { type Locale, SUPPORTED_LOCALES } from '@shared/types'
import { useTranslation } from 'react-i18next'
import { usePrefs } from '@/hooks/usePrefs'

export function GeralTab() {
  const { t, i18n } = useTranslation()
  const { setLocale } = usePrefs()

  const current = SUPPORTED_LOCALES.includes(i18n.language as Locale)
    ? (i18n.language as Locale)
    : 'en-US'

  const handleChange = (next: Locale) => {
    setLocale(next)
    i18n.changeLanguage(next)
  }

  return (
    <div className="flex flex-col gap-6 p-4">
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-foreground">
          {t('settings.geral.language.title')}
        </h2>
        <p className="text-xs text-muted-foreground">{t('settings.geral.language.help')}</p>
        <select
          value={current}
          onChange={(e) => handleChange(e.target.value as Locale)}
          className="mt-1 max-w-xs rounded-md border border-border bg-input px-2 py-1.5 text-sm text-foreground"
        >
          {SUPPORTED_LOCALES.map((loc) => (
            <option key={loc} value={loc}>
              {t(`settings.geral.language.options.${loc}`)}
            </option>
          ))}
        </select>
      </section>
    </div>
  )
}
