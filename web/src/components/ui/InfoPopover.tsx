import { Info, X } from 'lucide-react'
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Tooltip } from '@/components/ui/Tooltip'
import { cn } from '@/lib/utils'

type Props = {
  ariaLabel?: string
  triggerClassName?: string
  tooltip?: string
  children: ReactNode
}

export function InfoPopover({ ariaLabel, triggerClassName, tooltip, children }: Props) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLButtonElement | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)

  const resolvedAriaLabel = ariaLabel ?? t('infoPopover.show')

  useLayoutEffect(() => {
    if (!open || !anchorRef.current || !popoverRef.current) return
    const rect = anchorRef.current.getBoundingClientRect()
    const pw = popoverRef.current.offsetWidth
    const ph = popoverRef.current.offsetHeight
    let top = rect.bottom + 4
    let left = rect.right - pw
    left = Math.max(6, Math.min(left, window.innerWidth - pw - 6))
    top = Math.max(6, Math.min(top, window.innerHeight - ph - 6))
    setCoords({ top, left })
  }, [open])

  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (
        popoverRef.current?.contains(e.target as Node) ||
        anchorRef.current?.contains(e.target as Node)
      )
        return
      setOpen(false)
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  const triggerButton = (
    <button
      ref={anchorRef}
      type="button"
      className={cn(
        'inline-flex rounded p-0.5 cursor-pointer',
        open ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
        triggerClassName,
      )}
      onClick={(e) => {
        e.stopPropagation()
        setOpen((v) => !v)
      }}
      aria-label={resolvedAriaLabel}
      aria-expanded={open}
    >
      <Info size={12} />
    </button>
  )

  return (
    <>
      {tooltip && !open ? <Tooltip content={tooltip}>{triggerButton}</Tooltip> : triggerButton}
      {open && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={popoverRef}
              role="dialog"
              className="fixed z-50 flex max-w-[min(480px,90vw)] items-start gap-2 rounded border border-border bg-popover px-2 py-1.5 text-[10px] text-popover-foreground shadow-md"
              style={
                coords
                  ? { top: coords.top, left: coords.left }
                  : { top: -9999, left: -9999, visibility: 'hidden' }
              }
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="min-w-0 flex-1">{children}</div>
              <Tooltip content={t('infoPopover.close')}>
                <button
                  type="button"
                  className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground cursor-pointer"
                  onClick={() => setOpen(false)}
                  aria-label={t('infoPopover.close')}
                >
                  <X size={12} />
                </button>
              </Tooltip>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
