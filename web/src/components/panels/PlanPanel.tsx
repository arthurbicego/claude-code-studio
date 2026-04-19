import { ListChecks } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useSessionPlan } from '@/hooks/useSessionPlan'
import { PanelContainer } from './PanelContainer'

type Props = {
  sessionId: string | null
  onClose: () => void
}

export function PlanPanel({ sessionId, onClose }: Props) {
  const { t } = useTranslation()
  const data = useSessionPlan(sessionId)
  const plan = data?.plan

  return (
    <PanelContainer title={t('panels.plan.title')} onClose={onClose}>
      {!plan ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-sm text-muted-foreground">
          <ListChecks size={28} className="text-muted-foreground/60" />
          <div>
            <div className="font-medium text-foreground/80">{t('panels.plan.empty')}</div>
            <div className="mt-1 text-xs">{t('panels.plan.help')}</div>
          </div>
        </div>
      ) : (
        <div className="h-full overflow-auto whitespace-pre-wrap px-4 py-3 text-sm leading-relaxed">
          {plan}
        </div>
      )}
    </PanelContainer>
  )
}
