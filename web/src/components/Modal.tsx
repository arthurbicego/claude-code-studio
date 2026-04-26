import { X } from 'lucide-react'
import { type ReactNode, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Tooltip } from '@/components/ui/Tooltip'
import { cn } from '@/lib/utils'

type ModalSize = 'sm' | 'lg'

type Props = {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  className?: string
  size?: ModalSize
}

const SIZE_CLASSES: Record<ModalSize, string> = {
  sm: 'max-h-[86vh] w-[min(560px,94vw)]',
  lg: 'h-[75vh] w-[75vw]',
}

export function Modal({ open, onClose, title, children, footer, className, size = 'sm' }: Props) {
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
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => {
        if (e.currentTarget === e.target) onClose()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
    >
      <div
        className={cn(
          'flex flex-col overflow-hidden rounded-lg border border-border bg-card shadow-2xl',
          SIZE_CLASSES[size],
          className,
        )}
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
