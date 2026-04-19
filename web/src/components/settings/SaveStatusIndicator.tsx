import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useFormatTime } from '@/hooks/useFormatDate'
import { useSaveStatus } from '@/hooks/useSaveStatus'

export function SaveStatusIndicator() {
  const { t } = useTranslation()
  const formatTime = useFormatTime()
  const { state } = useSaveStatus()

  if (state.status === 'idle' && !state.lastSavedAt) return null

  if (state.status === 'saving') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 size={12} className="animate-spin" />
        {t('settings.saveStatus.saving')}
      </span>
    )
  }

  if (state.status === 'error') {
    return (
      <span
        className="flex items-center gap-1.5 text-xs text-red-400"
        title={state.error ?? undefined}
      >
        <AlertCircle size={12} />
        {t('settings.saveStatus.error', { message: state.error ?? '' })}
      </span>
    )
  }

  if (state.lastSavedAt) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <CheckCircle2 size={12} className="text-emerald-400" />
        {t('settings.saveStatus.savedAt', { time: formatTime(state.lastSavedAt) })}
      </span>
    )
  }

  return null
}
