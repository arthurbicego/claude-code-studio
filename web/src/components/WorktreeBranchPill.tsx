import { GitBranch } from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Tooltip } from '@/components/ui/Tooltip'

export function WorktreeBranchPill({ branch }: { branch: string | null }) {
  const { t } = useTranslation()
  const label = branch ?? t('panels.worktrees.detached')
  const labelRef = useRef<HTMLSpanElement>(null)
  const [overflowing, setOverflowing] = useState(false)

  useLayoutEffect(() => {
    const el = labelRef.current
    if (!el) return
    const check = () => setOverflowing(el.scrollWidth > el.clientWidth + 0.5)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <Tooltip content={label} className="min-w-0 max-w-full" disabled={!overflowing}>
      <span className="inline-flex min-w-0 max-w-[14rem] shrink items-center gap-1 rounded bg-indigo-500/15 px-1.5 py-0.5 text-indigo-300">
        <GitBranch size={10} className="shrink-0" />
        <span ref={labelRef} className="truncate font-mono text-[10px]">
          {label}
        </span>
      </span>
    </Tooltip>
  )
}
