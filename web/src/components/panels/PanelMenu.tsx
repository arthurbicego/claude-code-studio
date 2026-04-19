import { FileDiff, GitBranch, ListChecks, ListTodo, PanelRight, TerminalSquare } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { DropdownMenu } from '@/components/ui/DropdownMenu'
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

const TRIGGER_CLASS =
  'flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground'

export function PanelMenu({ openKinds, onToggle, disabled }: Props) {
  const { t } = useTranslation()
  return (
    <DropdownMenu
      ariaLabel={t('panels.menu.open')}
      tooltip={t('panels.menu.tooltip')}
      triggerIcon={PanelRight}
      triggerIconSize={14}
      triggerClassName={TRIGGER_CLASS}
      disabled={disabled}
      items={ORDER.map((kind) => ({
        label: t(`panels.labels.${kind}`),
        icon: ICONS[kind],
        checked: openKinds.has(kind),
        onSelect: () => onToggle(kind),
      }))}
    />
  )
}
