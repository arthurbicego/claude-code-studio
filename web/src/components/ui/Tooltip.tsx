import { type ReactNode, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

type Side = 'top' | 'right' | 'bottom' | 'left'

type Props = {
  content: ReactNode
  children: ReactNode
  side?: Side
  className?: string
}

const MARGIN = 4
const EDGE_PAD = 6

export function Tooltip({ content, children, side = 'top', className }: Props) {
  const triggerRef = useRef<HTMLSpanElement | null>(null)
  const tooltipRef = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !tooltipRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const tw = tooltipRef.current.offsetWidth
    const th = tooltipRef.current.offsetHeight
    let top = 0
    let left = 0
    switch (side) {
      case 'top':
        top = rect.top - th - MARGIN
        left = rect.left + rect.width / 2 - tw / 2
        break
      case 'right':
        top = rect.top + rect.height / 2 - th / 2
        left = rect.right + MARGIN
        break
      case 'bottom':
        top = rect.bottom + MARGIN
        left = rect.left + rect.width / 2 - tw / 2
        break
      case 'left':
        top = rect.top + rect.height / 2 - th / 2
        left = rect.left - tw - MARGIN
        break
    }
    left = Math.max(EDGE_PAD, Math.min(left, window.innerWidth - tw - EDGE_PAD))
    top = Math.max(EDGE_PAD, Math.min(top, window.innerHeight - th - EDGE_PAD))
    setCoords({ top, left })
  }, [open, side, content])

  const show = () => setOpen(true)
  const hide = () => {
    setOpen(false)
    setCoords(null)
  }

  return (
    <>
      <span
        ref={triggerRef}
        className={cn('inline-flex', className)}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </span>
      {open && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={tooltipRef}
              role="tooltip"
              className="pointer-events-none fixed z-50 whitespace-nowrap rounded bg-popover px-2 py-1 text-[10px] text-popover-foreground shadow-md"
              style={
                coords
                  ? { top: coords.top, left: coords.left }
                  : { top: -9999, left: -9999, visibility: 'hidden' }
              }
            >
              {content}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
