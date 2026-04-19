import { ListChecks } from 'lucide-react'
import { PanelContainer } from './PanelContainer'
import { useSessionPlan } from '@/hooks/useSessionPlan'

type Props = {
  sessionId: string | null
  onClose: () => void
}

export function PlanPanel({ sessionId, onClose }: Props) {
  const data = useSessionPlan(sessionId)
  const plan = data?.plan

  return (
    <PanelContainer title="Plan" onClose={onClose}>
      {!plan ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-sm text-muted-foreground">
          <ListChecks size={28} className="text-muted-foreground/60" />
          <div>
            <div className="font-medium text-foreground/80">No plan yet.</div>
            <div className="mt-1 text-xs">
              Claude writes the plan here as it explores. Keep chatting.
            </div>
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
