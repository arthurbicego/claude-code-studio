import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { dismiss, subscribeToasts, type Toast } from '@/lib/toast'

const ICONS = {
  info: Info,
  error: AlertCircle,
  success: CheckCircle2,
} as const

const TONES = {
  info: 'border-sky-500/40 bg-sky-950/80 text-sky-100',
  error: 'border-red-500/40 bg-red-950/80 text-red-100',
  success: 'border-emerald-500/40 bg-emerald-950/80 text-emerald-100',
} as const

export function ToastContainer() {
  const { t } = useTranslation()
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => subscribeToasts(setToasts), [])

  if (toasts.length === 0) return null

  return (
    <div className="pointer-events-none fixed top-4 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((toast) => {
        const Icon = ICONS[toast.kind]
        return (
          <div
            key={toast.id}
            role={toast.kind === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto flex w-80 items-start gap-2 rounded-md border px-3 py-2 text-xs shadow-lg ${TONES[toast.kind]}`}
          >
            <Icon size={14} className="mt-0.5 shrink-0" />
            <p className="flex-1 whitespace-pre-wrap break-words">{toast.message}</p>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label={t('common.dismiss')}
              className="shrink-0 cursor-pointer rounded p-0.5 opacity-70 hover:opacity-100"
            >
              <X size={12} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
