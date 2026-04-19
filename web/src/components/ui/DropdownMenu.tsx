import { useEffect, useLayoutEffect, useRef, useState, type ComponentType } from 'react'
import { createPortal } from 'react-dom'
import { MoreVertical } from 'lucide-react'
import { Tooltip } from '@/components/ui/Tooltip'
import { cn } from '@/lib/utils'

export type DropdownMenuItem = {
  label: string
  onSelect: () => void
  destructive?: boolean
  icon?: ComponentType<{ size?: number | string; className?: string }>
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
              className="fixed z-50 overflow-hidden rounded border border-border bg-popover text-[13px] text-popover-foreground shadow-md"
              style={
                coords
                  ? { top: coords.top, left: coords.left }
                  : { top: -9999, left: -9999, visibility: 'hidden' }
              }
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {items.map((item, i) => {
                const prev = items[i - 1]
                const needsSeparator = item.destructive && prev && !prev.destructive
                const Icon = item.icon
                return (
                  <div key={item.label}>
                    {needsSeparator ? (
                      <div role="separator" className="h-px bg-border" />
                    ) : null}
                    <button
                      type="button"
                      role="menuitem"
                      className={cn(
                        'flex w-full items-center gap-2 whitespace-nowrap px-3 py-2 text-left cursor-pointer',
                        item.destructive
                          ? 'text-red-400 hover:bg-red-500/10 hover:text-red-300'
                          : 'text-foreground hover:bg-accent',
                      )}
                      onClick={() => {
                        setOpen(false)
                        item.onSelect()
                      }}
                    >
                      {Icon ? <Icon size={14} className="shrink-0 opacity-80" /> : null}
                      <span className="flex-1">{item.label}</span>
                    </button>
                  </div>
                )
              })}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
