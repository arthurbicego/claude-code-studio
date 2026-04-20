import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'

type Props = {
  width: number
  onChange: (width: number) => void
  min?: number
  max?: number
}

const STEP = 16
const STEP_LARGE = 64
const DEFAULT_WIDTH = 352

export function ColumnResizer({ width, onChange, min = 240, max = 900 }: Props) {
  const { t } = useTranslation()
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

  const onKeyDown = useCallback(
    (ev: React.KeyboardEvent) => {
      const step = ev.shiftKey ? STEP_LARGE : STEP
      let next = width
      switch (ev.key) {
        case 'ArrowLeft':
          next = Math.max(min, width - step)
          break
        case 'ArrowRight':
          next = Math.min(max, width + step)
          break
        case 'Home':
          next = min
          break
        case 'End':
          next = max
          break
        case 'Enter':
        case ' ':
          next = DEFAULT_WIDTH
          break
        default:
          return
      }
      ev.preventDefault()
      onChange(next)
    },
    [width, min, max, onChange],
  )

  return (
    // biome-ignore lint/a11y/useSemanticElements: <hr> is the semantic separator but cannot host children (extended hit-area div) nor interactive handlers; role=separator + tabIndex + ARIA is the accepted ARIA pattern for a resizable divider
    <div
      role="separator"
      aria-orientation="vertical"
      aria-valuenow={width}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-label={t('panels.resizer.column')}
      tabIndex={0}
      title={`${t('panels.resizer.column')} — ${t('panels.resizer.shortcuts')}`}
      onMouseDown={onMouseDown}
      onKeyDown={onKeyDown}
      onDoubleClick={() => onChange(DEFAULT_WIDTH)}
      className="group relative w-1 shrink-0 cursor-col-resize bg-border/60 transition-colors hover:bg-primary/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-0"
    >
      <div className="pointer-events-none absolute inset-y-0 -left-1 -right-1" />
    </div>
  )
}
