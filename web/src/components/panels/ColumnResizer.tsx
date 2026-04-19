import { useCallback } from 'react'

type Props = {
  width: number
  onChange: (width: number) => void
  min?: number
  max?: number
}

export function ColumnResizer({ width, onChange, min = 240, max = 900 }: Props) {
  const onMouseDown = useCallback(
    (ev: React.MouseEvent) => {
      if (ev.button !== 0) return
      ev.preventDefault()
      const startX = ev.clientX
      const startWidth = width

      const onMove = (e: MouseEvent) => {
        const dx = startX - e.clientX
        const next = Math.max(min, Math.min(max, startWidth + dx))
        onChange(next)
      }
      const onUp = () => {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    },
    [width, onChange, min, max],
  )

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      onMouseDown={onMouseDown}
      onDoubleClick={() => onChange(352)}
      className="group relative w-1 shrink-0 cursor-col-resize bg-border/60 transition-colors hover:bg-primary/40"
    >
      <div className="pointer-events-none absolute inset-y-0 -left-1 -right-1" />
    </div>
  )
}
