import { useCallback } from 'react'

type Props = {
  ratio: number
  onChange: (ratio: number) => void
  min?: number
  max?: number
}

export function RowResizer({ ratio, onChange, min = 0.15, max = 0.85 }: Props) {
  const onMouseDown = useCallback(
    (ev: React.MouseEvent) => {
      if (ev.button !== 0) return
      const parent = ev.currentTarget.parentElement
      if (!parent) return
      ev.preventDefault()
      const rect = parent.getBoundingClientRect()
      const total = rect.height
      if (total <= 0) return
      const startY = ev.clientY
      const startRatio = ratio

      const onMove = (e: MouseEvent) => {
        const dy = e.clientY - startY
        const next = Math.max(min, Math.min(max, startRatio + dy / total))
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
      document.body.style.cursor = 'row-resize'
      document.body.style.userSelect = 'none'
    },
    [ratio, onChange, min, max],
  )

  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      onMouseDown={onMouseDown}
      onDoubleClick={() => onChange(0.5)}
      className="h-1 shrink-0 cursor-row-resize bg-border/60 transition-colors hover:bg-primary/40"
    />
  )
}
