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
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Tooltip } from '@/components/ui/Tooltip'

type Props = {
  onSendInput: (text: string) => void
  onInterrupt: () => void
  disabled: boolean
}

const SLASH_ACTIONS = [
  { cmd: '/compact', icon: Archive, tooltipKey: 'sessionActions.compact' as const },
  { cmd: '/clear', icon: Eraser, tooltipKey: 'sessionActions.clear' as const },
  { cmd: '/cost', icon: CircleDollarSign, tooltipKey: 'sessionActions.cost' as const },
  { cmd: '/help', icon: HelpCircle, tooltipKey: 'sessionActions.help' as const },
] as const

export function SessionActions({ onSendInput, onInterrupt, disabled }: Props) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-wrap items-center gap-2 bg-card/40 px-2 py-2">
      {SLASH_ACTIONS.map(({ cmd, icon: Icon, tooltipKey }) => (
        <Tooltip key={cmd} content={t(tooltipKey)}>
          <Button
            size="sm"
            variant="subtle"
            className="font-mono"
            disabled={disabled}
            onClick={() => onSendInput(`${cmd}\n`)}
          >
            <Icon size={12} />
            {cmd}
          </Button>
        </Tooltip>
      ))}
      <div className="flex-1" />
      <Tooltip content={t('sessionActions.openModelPicker')}>
        <Button
          size="sm"
          variant="subtle"
          disabled={disabled}
          onClick={() => onSendInput('/model\n')}
        >
          <Sparkles size={12} />
          {t('sessionActions.model')}
        </Button>
      </Tooltip>
      <Tooltip content={t('sessionActions.openEffortPicker')}>
        <Button
          size="sm"
          variant="subtle"
          disabled={disabled}
          onClick={() => onSendInput('/effort\n')}
        >
          <Zap size={12} />
          {t('sessionActions.effort')}
        </Button>
      </Tooltip>
      <Tooltip content={t('sessionActions.openPermissionPicker')}>
        <Button
          size="sm"
          variant="subtle"
          disabled={disabled}
          onClick={() => onSendInput('/permissions\n')}
        >
          <KeyRound size={12} />
          {t('sessionActions.permission')}
        </Button>
      </Tooltip>
      <Tooltip content={t('sessionActions.interrupt')}>
        <Button size="sm" variant="warn" disabled={disabled} onClick={onInterrupt}>
          <Ban size={14} /> Ctrl+C
        </Button>
      </Tooltip>
    </div>
  )
}
