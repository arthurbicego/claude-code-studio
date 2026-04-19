import { PanelMenu } from '@/components/panels/PanelMenu'
import type { PanelKind } from '@/types'

type Props = {
  disabled: boolean
  openPanelKinds: Set<PanelKind>
  onTogglePanel: (kind: PanelKind) => void
}

export function Toolbar({ disabled, openPanelKinds, onTogglePanel }: Props) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 border-b border-border bg-card/40 p-2">
      <PanelMenu openKinds={openPanelKinds} onToggle={onTogglePanel} disabled={disabled} />
    </div>
  )
}
