import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MoreVertical } from 'lucide-react'
import { Tooltip } from '@/components/ui/Tooltip'
import { cn } from '@/lib/utils'

export type DropdownMenuItem = {
  label: string
  onSelect: () => void
  destructive?: boolean
}

type Props = {
  items: DropdownMenuItem[]
  ariaLabel?: string
  triggerClassName?: string
  tooltip?: string
}

export function DropdownMenu({
  items,
  ariaLabel = 'Abrir menu',
  triggerClassName,
  tooltip,
}: Props) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    if (!open || !anchorRef.current || !menuRef.current) return
    const rect = anchorRef.current.getBoundingClientRect()
    const mw = menuRef.current.offsetWidth
    const mh = menuRef.current.offsetHeight
    let top = rect.bottom + 4
    let left = rect.right - mw
    left = Math.max(6, Math.min(left, window.innerWidth - mw - 6))
    top = Math.max(6, Math.min(top, window.innerHeight - mh - 6))
    setCoords({ top, left })
  }, [open])

  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (
        menuRef.current?.contains(e.target as Node) ||
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
        'rounded p-1 cursor-pointer',
        open
          ? 'bg-accent text-foreground'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
        triggerClassName,
      )}
      onClick={(e) => {
        e.stopPropagation()
        setOpen((v) => !v)
      }}
      aria-label={ariaLabel}
      aria-expanded={open}
      aria-haspopup="menu"
    >
      <MoreVertical size={12} />
    </button>
  )

  return (
    <>
      {tooltip && !open ? <Tooltip content={tooltip}>{triggerButton}</Tooltip> : triggerButton}
      {open && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              className="fixed z-50 min-w-[140px] overflow-hidden rounded border border-border bg-popover py-1 text-xs text-popover-foreground shadow-md"
              style={
                coords
                  ? { top: coords.top, left: coords.left }
                  : { top: -9999, left: -9999, visibility: 'hidden' }
              }
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {items.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  className={cn(
                    'block w-full px-3 py-1.5 text-left cursor-pointer hover:bg-accent',
                    item.destructive
                      ? 'text-red-400 hover:text-red-300'
                      : 'text-foreground',
                  )}
                  onClick={() => {
                    setOpen(false)
                    item.onSelect()
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
