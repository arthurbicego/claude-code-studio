import { type ReactNode, useLayoutEffect, useRef, useState } from 'react'
import { Tooltip } from '@/components/ui/Tooltip'
import { cn } from '@/lib/utils'

type Props = {
  text: string
  className?: string
  tooltipClassName?: string
  tooltipContent?: ReactNode
}

/**
 * Renders `text` with `truncate`, and shows a tooltip only when the text is
 * actually overflowing its container (measured via ResizeObserver). The
 * tooltip content defaults to `text` but can be overridden.
 */
export function TruncatingLabel({ text, className, tooltipClassName, tooltipContent }: Props) {
  const ref = useRef<HTMLSpanElement>(null)
  const [overflowing, setOverflowing] = useState(false)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const check = () => setOverflowing(el.scrollWidth > el.clientWidth + 0.5)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <Tooltip content={tooltipContent ?? text} className={tooltipClassName} disabled={!overflowing}>
      <span ref={ref} className={cn('block min-w-0 truncate', className)}>
        {text}
      </span>
    </Tooltip>
  )
}
