import { X } from 'lucide-react'
import type { ReactNode } from 'react'

type Props = {
  title: string
  onClose: () => void
  headerExtra?: ReactNode
  children: ReactNode
}

export function PanelContainer({ title, onClose, headerExtra, children }: Props) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col border-l border-border bg-background">
      <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-3 py-1.5">
        <span className="text-xs font-medium">{title}</span>
        <div className="flex-1" />
        {headerExtra}
        <button
          type="button"
          onClick={onClose}
          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          aria-label={`Fechar ${title}`}
        >
          <X size={14} />
        </button>
      </div>
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">{children}</div>
    </div>
  )
}
