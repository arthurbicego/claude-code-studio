import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'

export function useFormatDate() {
  const { i18n } = useTranslation()
  return useCallback(
    (value: Date | number, opts?: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat(
        i18n.language,
        opts ?? { dateStyle: 'short', timeStyle: 'short' },
      ).format(value),
    [i18n.language],
  )
}

export function useFormatTime() {
  const { i18n } = useTranslation()
  return useCallback(
    (value: Date | number) =>
      new Intl.DateTimeFormat(i18n.language, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).format(value),
    [i18n.language],
  )
}
