import {
  Archive,
  Ban,
  CircleDollarSign,
  Eraser,
  HelpCircle,
  KeyRound,
  Sparkles,
  Zap,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Tooltip } from '@/components/ui/Tooltip'

type Props = {
  onSendInput: (text: string) => void
  onInterrupt: () => void
  disabled: boolean
}

const SLASH_ACTIONS = [
  { cmd: '/compact', icon: Archive, tooltip: 'Compactar o histórico da conversa' },
  { cmd: '/clear', icon: Eraser, tooltip: 'Limpar a conversa' },
  { cmd: '/cost', icon: CircleDollarSign, tooltip: 'Mostrar custo da sessão' },
  { cmd: '/help', icon: HelpCircle, tooltip: 'Mostrar ajuda' },
] as const

export function SessionActions({ onSendInput, onInterrupt, disabled }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2 bg-card/40 px-2 py-2">
      {SLASH_ACTIONS.map(({ cmd, icon: Icon, tooltip }) => (
        <Tooltip key={cmd} content={tooltip}>
          <Button
            size="sm"
            variant="subtle"
            className="font-mono"
            disabled={disabled}
            onClick={() => onSendInput(cmd + '\n')}
          >
            <Icon size={12} />
            {cmd}
          </Button>
        </Tooltip>
      ))}
      <div className="flex-1" />
      <Tooltip content="Abrir seletor de modelo">
        <Button
          size="sm"
          variant="subtle"
          disabled={disabled}
          onClick={() => onSendInput('/model\n')}
        >
          <Sparkles size={12} />
          Modelo
        </Button>
      </Tooltip>
      <Tooltip content="Abrir seletor de effort">
        <Button
          size="sm"
          variant="subtle"
          disabled={disabled}
          onClick={() => onSendInput('/effort\n')}
        >
          <Zap size={12} />
          Effort
        </Button>
      </Tooltip>
      <Tooltip content="Abrir seletor de permissões">
        <Button
          size="sm"
          variant="subtle"
          disabled={disabled}
          onClick={() => onSendInput('/permissions\n')}
        >
          <KeyRound size={12} />
          Permissão
        </Button>
      </Tooltip>
      <Tooltip content="Interromper (envia Ctrl+C)">
        <Button size="sm" variant="warn" disabled={disabled} onClick={onInterrupt}>
          <Ban size={14} /> Ctrl+C
        </Button>
      </Tooltip>
    </div>
  )
}
