import { GitBranch } from 'lucide-react'
import { Tooltip } from '@/components/ui/Tooltip'
import type { SessionFooter as SessionFooterData } from '@/types'

type Props = {
  data: SessionFooterData | null
}

const DASH = '—'

function fmtIn(epochSeconds: number | null): string {
  if (!epochSeconds) return ''
  const diff = epochSeconds - Math.floor(Date.now() / 1000)
  if (diff <= 0) return 'now'
  if (diff >= 86400) return `in ${Math.floor(diff / 86400)}d${Math.floor((diff % 86400) / 3600)}h`
  if (diff >= 3600) return `in ${Math.floor(diff / 3600)}h${Math.floor((diff % 3600) / 60)}m`
  if (diff >= 60) return `in ${Math.floor(diff / 60)}m`
  return `in ${diff}s`
}

function pct(n: number | null): string {
  return n == null ? DASH : `${Math.round(n)}%`
}

function field(label: string, value: React.ReactNode) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="text-muted-foreground/70">{label}:</span>
      <span>{value}</span>
    </span>
  )
}

export function SessionFooter({ data }: Props) {
  if (!data) {
    return (
      <div className="flex items-center border-t border-border bg-muted/20 px-4 py-1.5 text-[11px] text-muted-foreground/60">
        Aguardando dados da sessão…
      </div>
    )
  }

  const ctx = data.contextPct != null ? `${Math.round(data.contextPct)}%` : data.exceeds200k ? '>200k' : DASH
  const cost = data.costUsd != null ? `$${data.costUsd.toFixed(2)}` : `$${DASH}`
  const fiveSuffix = data.fiveHourResetsAt ? ` (${fmtIn(data.fiveHourResetsAt)})` : ''
  const sevenSuffix = data.sevenDayResetsAt ? ` (${fmtIn(data.sevenDayResetsAt)})` : ''

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 border-t border-border bg-muted/20 px-4 py-1.5 font-mono text-[11px] text-foreground/80">
      {field('dir', <span className="text-sky-400">{data.dirLabel ?? DASH}</span>)}
      {data.worktree ? (
        <>
          <span className="text-muted-foreground/40">·</span>
          <Tooltip content={`Worktree em ${data.worktree.path}`}>
            <span className="inline-flex items-center gap-1 rounded bg-indigo-500/15 px-1.5 py-0.5 text-indigo-300">
              <GitBranch size={10} />
              <span className="font-mono text-[10px]">{data.worktree.name}</span>
            </span>
          </Tooltip>
        </>
      ) : null}
      {data.branch && (
        <>
          <span className="text-muted-foreground/40">·</span>
          {field(
            'git',
            <span className={data.dirty ? 'text-rose-400' : 'text-emerald-400'}>
              {data.branch}
              {data.dirty ? '*' : ''}
            </span>,
          )}
        </>
      )}
      {data.model && (
        <>
          <span className="text-muted-foreground/40">·</span>
          {field('model', <span className="text-violet-300">{data.model}</span>)}
        </>
      )}
      <span className="text-muted-foreground/40">·</span>
      {field('context', <span className="text-cyan-300">{ctx}</span>)}
      <span className="text-muted-foreground/40">·</span>
      {field(
        'diff',
        <span>
          <span className="text-emerald-400">+{data.linesAdded ?? 0}</span>
          <span className="text-muted-foreground/50">/</span>
          <span className="text-rose-400">-{data.linesRemoved ?? 0}</span>
        </span>,
      )}
      <span className="text-muted-foreground/40">·</span>
      {field('cost', <span className="text-amber-300">{cost}</span>)}
      <span className="text-muted-foreground/40">·</span>
      {field('5h', <span className="text-violet-300">{pct(data.fiveHourPct)}{fiveSuffix}</span>)}
      <span className="text-muted-foreground/40">·</span>
      {field('7d', <span className="text-pink-300">{pct(data.sevenDayPct)}{sevenSuffix}</span>)}
    </div>
  )
}
