import { PanelMenu } from '@/components/panels/PanelMenu'
import type { PanelKind } from '@/types'

type Props = {
  disabled: boolean
  status: string
  openPanelKinds: Set<PanelKind>
  onTogglePanel: (kind: PanelKind) => void
}

export function Toolbar({ disabled, status, openPanelKinds, onTogglePanel }: Props) {
  return (
    <div className="flex items-center gap-2 border-b border-border bg-card/40 px-4 py-2">
      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{status}</span>
      <PanelMenu openKinds={openPanelKinds} onToggle={onTogglePanel} disabled={disabled} />
    </div>
  )
}
