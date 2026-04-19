import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { InfoPopover } from '@/components/ui/InfoPopover'
import { PanelMenu } from '@/components/panels/PanelMenu'
import type { PanelKind } from '@/types'

type Props = {
  disabled: boolean
  status: string
  sessionId: string | null
  openPanelKinds: Set<PanelKind>
  onTogglePanel: (kind: PanelKind) => void
}

export function Toolbar({
  disabled,
  status,
  sessionId,
  openPanelKinds,
  onTogglePanel,
}: Props) {
  return (
    <div className="flex items-center gap-2 border-b border-border bg-card/40 px-4 py-2">
      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{status}</span>
      {sessionId ? (
        <InfoPopover ariaLabel="Mostrar informações da sessão">
          <SessionInfoContent id={sessionId} />
        </InfoPopover>
      ) : null}
      <PanelMenu openKinds={openPanelKinds} onToggle={onTogglePanel} disabled={disabled} />
    </div>
  )
}

function SessionInfoContent({ id }: { id: string }) {
  const [copied, setCopied] = useState(false)

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(id)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      /* noop */
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[9px] uppercase tracking-wide text-muted-foreground">
        ID da sessão
      </span>
      <div className="flex items-center gap-2">
        <span className="break-all font-mono">{id}</span>
        <button
          type="button"
          onClick={onCopy}
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground cursor-pointer"
          aria-label="Copiar ID da sessão"
          title={copied ? 'Copiado!' : 'Copiar ID'}
        >
          {copied ? (
            <Check size={12} className="text-emerald-400" />
          ) : (
            <Copy size={12} />
          )}
        </button>
      </div>
    </div>
  )
}
