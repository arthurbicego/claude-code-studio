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

type Props = {
  onSendInput: (text: string) => void
  onInterrupt: () => void
  disabled: boolean
}

const SLASH_ACTIONS = [
  { cmd: '/compact', icon: Archive },
  { cmd: '/clear', icon: Eraser },
  { cmd: '/cost', icon: CircleDollarSign },
  { cmd: '/help', icon: HelpCircle },
] as const

export function SessionActions({ onSendInput, onInterrupt, disabled }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2 bg-card/40 px-2 py-2">
      {SLASH_ACTIONS.map(({ cmd, icon: Icon }) => (
        <Button
          key={cmd}
          size="sm"
          variant="subtle"
          className="font-mono"
          disabled={disabled}
          onClick={() => onSendInput(cmd + '\n')}
        >
          <Icon size={12} />
          {cmd}
        </Button>
      ))}
      <div className="flex-1" />
      <Button
        size="sm"
        variant="subtle"
        disabled={disabled}
        onClick={() => onSendInput('/model\n')}
        title="Abre o seletor de modelo no claude"
      >
        <Sparkles size={12} />
        Modelo
      </Button>
      <Button
        size="sm"
        variant="subtle"
        disabled={disabled}
        onClick={() => onSendInput('/effort\n')}
        title="Abre o seletor de effort no claude"
      >
        <Zap size={12} />
        Effort
      </Button>
      <Button
        size="sm"
        variant="subtle"
        disabled={disabled}
        onClick={() => onSendInput('/permissions\n')}
        title="Abre o seletor de permissão no claude"
      >
        <KeyRound size={12} />
        Permissão
      </Button>
      <Button size="sm" variant="warn" disabled={disabled} onClick={onInterrupt}>
        <Ban size={14} /> Ctrl+C
      </Button>
    </div>
  )
}
