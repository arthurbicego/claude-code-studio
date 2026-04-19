import { useMemo } from 'react'
import { PanelContainer } from './PanelContainer'
import { useSessionDiff } from '@/hooks/useSessionDiff'
import { cn } from '@/lib/utils'

type Props = {
  sessionId: string | null
  onClose: () => void
}

type Hunk = {
  file: string
  kind: 'modified' | 'added' | 'deleted' | 'renamed'
  lines: { type: 'ctx' | 'add' | 'del' | 'meta'; text: string }[]
}

function parseDiff(raw: string): Hunk[] {
  if (!raw) return []
  const hunks: Hunk[] = []
  let current: Hunk | null = null
  for (const line of raw.split('\n')) {
    if (line.startsWith('diff --git ')) {
      const m = /^diff --git a\/(.+) b\/(.+)$/.exec(line)
      current = {
        file: m ? m[2] : line.slice('diff --git '.length),
        kind: 'modified',
        lines: [],
      }
      hunks.push(current)
      continue
    }
    if (!current) continue
    if (line.startsWith('new file')) current.kind = 'added'
    else if (line.startsWith('deleted file')) current.kind = 'deleted'
    else if (line.startsWith('rename ')) current.kind = 'renamed'
    if (line.startsWith('@@')) {
      current.lines.push({ type: 'meta', text: line })
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      current.lines.push({ type: 'add', text: line })
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      current.lines.push({ type: 'del', text: line })
    } else if (line.startsWith(' ')) {
      current.lines.push({ type: 'ctx', text: line })
    }
  }
  return hunks
}

const KIND_LABEL: Record<Hunk['kind'], string> = {
  modified: 'M',
  added: 'A',
  deleted: 'D',
  renamed: 'R',
}

const KIND_COLOR: Record<Hunk['kind'], string> = {
  modified: 'text-amber-400',
  added: 'text-emerald-400',
  deleted: 'text-rose-400',
  renamed: 'text-sky-400',
}

export function DiffPanel({ sessionId, onClose }: Props) {
  const data = useSessionDiff(sessionId)

  const { hunks, title } = useMemo(() => {
    const combined = [(data?.staged ?? ''), (data?.unstaged ?? '')].filter(Boolean).join('\n')
    const parsed = parseDiff(combined)
    for (const f of data?.untracked ?? []) {
      parsed.push({ file: f, kind: 'added', lines: [{ type: 'meta', text: '(untracked)' }] })
    }
    return {
      hunks: parsed,
      title: data?.branch ? `main → ${data.branch}` : 'Diff',
    }
  }, [data])

  const hasAny = hunks.length > 0

  return (
    <PanelContainer title={title} onClose={onClose}>
      {!hasAny ? (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          No changes to show.
        </div>
      ) : (
        <div className="h-full overflow-auto font-mono text-[11px]">
          {hunks.map((h, idx) => (
            <div key={`${h.file}-${idx}`} className="border-b border-border last:border-b-0">
              <div className="sticky top-0 z-10 flex items-center gap-2 bg-muted/60 px-3 py-1 backdrop-blur">
                <span className={cn('font-semibold', KIND_COLOR[h.kind])}>{KIND_LABEL[h.kind]}</span>
                <span className="truncate">{h.file}</span>
              </div>
              {h.lines.map((l, i) => (
                <div
                  key={i}
                  className={cn(
                    'whitespace-pre px-3',
                    l.type === 'add' && 'bg-emerald-500/10 text-emerald-300',
                    l.type === 'del' && 'bg-rose-500/10 text-rose-300',
                    l.type === 'meta' && 'bg-sky-500/5 text-sky-300',
                    l.type === 'ctx' && 'text-foreground/70',
                  )}
                >
                  {l.text || ' '}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </PanelContainer>
  )
}
