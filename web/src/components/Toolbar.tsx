import { FolderCode } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { PanelMenu } from '@/components/panels/PanelMenu'
import { CopyableField } from '@/components/ui/CopyableField'
import { InfoPopover } from '@/components/ui/InfoPopover'
import { Tooltip } from '@/components/ui/Tooltip'
import type { PanelKind } from '@/types'

type Props = {
  disabled: boolean
  status: string
  sessionId: string | null
  openPath: string | null
  openPanelKinds: Set<PanelKind>
  onTogglePanel: (kind: PanelKind) => void
  onOpenInVSCode: (path: string, label: string) => void
}

export function Toolbar({
  disabled,
  status,
  sessionId,
  openPath,
  openPanelKinds,
  onTogglePanel,
  onOpenInVSCode,
}: Props) {
  const { t } = useTranslation()
  const vscodeDisabled = disabled || !openPath
  return (
    <div className="flex items-center gap-2 border-b border-border bg-card/40 px-4 py-2">
      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{status}</span>
      {sessionId ? (
        <InfoPopover ariaLabel={t('toolbar.showSessionInfo')} tooltip={t('toolbar.sessionInfo')}>
          <CopyableField
            label={t('toolbar.sessionId')}
            value={sessionId}
            copyAriaLabel={t('toolbar.copySessionId')}
          />
        </InfoPopover>
      ) : null}
      <Tooltip content={t('common.openInVscode')}>
        <button
          type="button"
          disabled={vscodeDisabled}
          onClick={() => {
            if (!openPath) return
            const label = openPath.split('/').filter(Boolean).pop() || openPath
            onOpenInVSCode(openPath, label)
          }}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
          aria-label={t('common.openInVscode')}
        >
          <FolderCode size={14} />
        </button>
      </Tooltip>
      <PanelMenu openKinds={openPanelKinds} onToggle={onTogglePanel} disabled={disabled} />
    </div>
  )
}
