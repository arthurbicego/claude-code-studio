import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'

type Props = {
  ratio: number
  onChange: (ratio: number) => void
  min?: number
  max?: number
}

const STEP = 0.02
const STEP_LARGE = 0.08
const DEFAULT_RATIO = 0.5

export function RowResizer({ ratio, onChange, min = 0.15, max = 0.85 }: Props) {
  const { t } = useTranslation()
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

  const onKeyDown = useCallback(
    (ev: React.KeyboardEvent) => {
      const step = ev.shiftKey ? STEP_LARGE : STEP
      let next = ratio
      switch (ev.key) {
        case 'ArrowUp':
          next = Math.max(min, ratio - step)
          break
        case 'ArrowDown':
          next = Math.min(max, ratio + step)
          break
        case 'Home':
          next = min
          break
        case 'End':
          next = max
          break
        case 'Enter':
        case ' ':
          next = DEFAULT_RATIO
          break
        default:
          return
      }
      ev.preventDefault()
      onChange(next)
    },
    [ratio, min, max, onChange],
  )

  return (
    // biome-ignore lint/a11y/useSemanticElements: <hr> is the semantic separator but cannot host interactive handlers/tabIndex; role=separator + tabIndex + ARIA is the accepted ARIA pattern for a resizable divider
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-valuenow={Math.round(ratio * 100)}
      aria-valuemin={Math.round(min * 100)}
      aria-valuemax={Math.round(max * 100)}
      aria-label={t('panels.resizer.row')}
      tabIndex={0}
      title={`${t('panels.resizer.row')} — ${t('panels.resizer.shortcuts')}`}
      onMouseDown={onMouseDown}
      onKeyDown={onKeyDown}
      onDoubleClick={() => onChange(DEFAULT_RATIO)}
      className="h-1 shrink-0 cursor-row-resize bg-border/60 transition-colors hover:bg-primary/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-0"
    />
  )
}
