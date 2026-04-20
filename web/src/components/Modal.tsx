import { X } from 'lucide-react'
import { type ReactNode, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Tooltip } from '@/components/ui/Tooltip'
import { cn } from '@/lib/utils'

type Props = {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  className?: string
}

export function Modal({ open, onClose, title, children, footer, className }: Props) {
  const { t } = useTranslation()
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className={cn(
          'flex max-h-[86vh] w-[min(560px,94vw)] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-2xl',
          className,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <Tooltip content={t('modal.close')}>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground cursor-pointer"
              onClick={onClose}
              aria-label={t('modal.close')}
            >
              <X size={18} />
            </button>
          </Tooltip>
        </header>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
        {footer ? (
          <footer className="flex justify-end gap-2 border-t border-border bg-black/30 px-4 py-3">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  )
}
