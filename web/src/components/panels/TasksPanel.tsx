import { useMemo } from 'react'
import { CheckCircle2, Circle, Loader2 } from 'lucide-react'
import { PanelContainer } from './PanelContainer'
import { useSessionTasks } from '@/hooks/useSessionTasks'
import { cn } from '@/lib/utils'
import type { TodoItem } from '@/types'

type Props = {
  sessionId: string | null
  onClose: () => void
}

const GROUP_ORDER: TodoItem['status'][] = ['in_progress', 'pending', 'completed']

const GROUP_LABEL: Record<TodoItem['status'], string> = {
  in_progress: 'In progress',
  pending: 'Pending',
  completed: 'Completed',
}

function StatusIcon({ status }: { status: TodoItem['status'] }) {
  if (status === 'completed') return <CheckCircle2 size={13} className="text-emerald-400" />
  if (status === 'in_progress') return <Loader2 size={13} className="animate-spin text-sky-400" />
  return <Circle size={13} className="text-muted-foreground" />
}

export function TasksPanel({ sessionId, onClose }: Props) {
  const data = useSessionTasks(sessionId)

  const grouped = useMemo(() => {
    const out: Record<TodoItem['status'], TodoItem[]> = {
      in_progress: [],
      pending: [],
      completed: [],
    }
    for (const t of data?.todos ?? []) {
      const s = (t.status in out ? t.status : 'pending') as TodoItem['status']
      out[s].push(t)
    }
    return out
  }, [data])

  const total = data?.todos.length ?? 0

  return (
    <PanelContainer title="Tasks" onClose={onClose}>
      {total === 0 ? (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          No tasks yet.
        </div>
      ) : (
        <div className="h-full overflow-auto px-3 py-2 text-xs">
          {GROUP_ORDER.map((group) => {
            const items = grouped[group]
            if (items.length === 0) return null
            return (
              <div key={group} className="mb-3 last:mb-0">
                <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                  {GROUP_LABEL[group]}
                </div>
                <ul className="space-y-1">
                  {items.map((t, i) => (
                    <li
                      key={`${group}-${i}`}
                      className="flex items-start gap-2 rounded px-2 py-1 hover:bg-accent/40"
                    >
                      <div className="pt-0.5">
                        <StatusIcon status={group} />
                      </div>
                      <span
                        className={cn(
                          group === 'completed' && 'text-muted-foreground line-through',
                        )}
                      >
                        {group === 'in_progress' && t.activeForm ? t.activeForm : t.content}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      )}
    </PanelContainer>
  )
}
