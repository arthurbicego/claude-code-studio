import {
  Check,
  FileDiff,
  GitBranch,
  ListChecks,
  ListTodo,
  PanelRight,
  TerminalSquare,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Tooltip } from '@/components/ui/Tooltip'
import { PANEL_LABELS } from '@/lib/panels'
import { cn } from '@/lib/utils'
import type { PanelKind } from '@/types'

type Props = {
  openKinds: Set<PanelKind>
  onToggle: (kind: PanelKind) => void
  disabled?: boolean
}

const ICONS: Record<PanelKind, typeof FileDiff> = {
  diff: FileDiff,
  terminal: TerminalSquare,
  tasks: ListTodo,
  plan: ListChecks,
  worktrees: GitBranch,
}

const ORDER: PanelKind[] = ['diff', 'terminal', 'tasks', 'plan', 'worktrees']

export function PanelMenu({ openKinds, onToggle, disabled }: Props) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDocClick = (ev: MouseEvent) => {
      if (!wrapRef.current?.contains(ev.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  const trigger = (
    <button
      type="button"
      disabled={disabled}
      onClick={() => setOpen((v) => !v)}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground',
        'hover:bg-accent hover:text-accent-foreground',
        'disabled:pointer-events-none disabled:opacity-50',
      )}
      aria-label="Abrir menu de painéis"
    >
      <PanelRight size={14} />
    </button>
  )

  return (
    <div ref={wrapRef} className="relative">
      {open ? trigger : <Tooltip content="Painéis">{trigger}</Tooltip>}
      {open ? (
        <div className="absolute right-0 top-9 z-30 min-w-[180px] rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg">
          {ORDER.map((kind) => {
            const Icon = ICONS[kind]
            const active = openKinds.has(kind)
            return (
              <button
                key={kind}
                type="button"
                onClick={() => {
                  onToggle(kind)
                  setOpen(false)
                }}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
              >
                <Icon size={14} className="text-muted-foreground" />
                <span className="flex-1">{PANEL_LABELS[kind]}</span>
                {active ? <Check size={14} className="text-emerald-400" /> : null}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
