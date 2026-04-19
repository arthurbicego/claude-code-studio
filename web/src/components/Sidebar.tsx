import {
  Bell,
  Circle,
  CircleDashed,
  CircleDot,
  Plus,
  RefreshCw,
  Settings,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Tooltip } from '@/components/ui/Tooltip'
import { SessionsSection } from '@/components/SessionsSection'
import { cn } from '@/lib/utils'
import { useProjectOrder } from '@/hooks/useProjectOrder'
import type { LiveSession, LiveSessionState, Project, SessionLaunch, SessionMeta } from '@/types'

type Props = {
  projects: Project[]
  loading: boolean
  error: string | null
  refreshedAt: number | null
  openSessions: Map<string, SessionLaunch>
  liveSessions: Map<string, LiveSession>
  activeSessionKey: string | null
  onRefresh: () => void
  onOpenNewSession: () => void
  onOpenSettings: () => void
  onResumeSession: (project: Project, session: SessionMeta) => void
  onActivateOpen: (sessionKey: string) => void
  onCloseSession: (sessionKey: string) => void
  onArchiveSession: (id: string) => void
  onUnarchiveSession: (id: string) => void
  onDeleteSession: (session: SessionMeta) => void
}

function basename(cwd: string): string {
  const parts = cwd.split('/').filter(Boolean)
  return parts[parts.length - 1] || cwd
}

function formatTime(ts: number | null): string {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function StateIndicator({ state }: { state: LiveSessionState }) {
  if (state === 'aguardando') {
    return (
      <Tooltip content="Aguardando ação do usuário">
        <Bell size={12} className="shrink-0 animate-pulse text-sky-400" />
      </Tooltip>
    )
  }
  if (state === 'ativo') {
    return (
      <Tooltip content="Ativa — modelo processando">
        <CircleDot size={12} className="shrink-0 text-emerald-400" />
      </Tooltip>
    )
  }
  if (state === 'standby') {
    return (
      <Tooltip content="Standby — aberta e ociosa">
        <CircleDashed size={12} className="shrink-0 text-amber-500" />
      </Tooltip>
    )
  }
  return (
    <Tooltip content="Fechada">
      <Circle size={12} className="shrink-0 text-muted-foreground/50" />
    </Tooltip>
  )
}

function renderState(live: LiveSession | undefined) {
  if (!live) return <span className="inline-block w-3" />
  return <StateIndicator state={live.state} />
}

function launchLabel(l: SessionLaunch): string {
  if (l.label) return l.label
  if (l.resume) return l.resume.slice(0, 8)
  return `Nova em ${basename(l.cwd)}`
}

export function Sidebar({
  projects,
  loading,
  error,
  refreshedAt,
  openSessions,
  liveSessions,
  activeSessionKey,
  onRefresh,
  onOpenNewSession,
  onOpenSettings,
  onResumeSession,
  onActivateOpen,
  onCloseSession,
  onArchiveSession,
  onUnarchiveSession,
  onDeleteSession,
}: Props) {
  const openList = Array.from(openSessions.values())
  const hasArchived = projects.some((p) => p.sessions.some((s) => s.archived))
  const { applyOrder, moveSlug } = useProjectOrder()

  return (
    <aside className="flex w-80 flex-col border-r border-border bg-card/40">
      <header className="flex flex-col gap-2 border-b border-border p-4">
        <div className="flex items-center gap-2">
          <h1 className="flex-1 text-sm font-semibold text-foreground">Claude Code Studio</h1>
          <Tooltip
            content={`Recarregar lista${refreshedAt ? ` · ${formatTime(refreshedAt)}` : ''}`}
          >
            <Button size="xs" variant="ghost" onClick={onRefresh} disabled={loading}>
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </Button>
          </Tooltip>
          <Tooltip content="Configurações">
            <Button size="xs" variant="ghost" onClick={onOpenSettings}>
              <Settings size={14} />
            </Button>
          </Tooltip>
        </div>
        <Button size="sm" variant="primary" onClick={onOpenNewSession}>
          <Plus size={14} /> Nova sessão
        </Button>
        {error ? <p className="text-xs text-red-400">Erro: {error}</p> : null}
      </header>

      <div className="flex-1 overflow-y-auto p-2">
        {openList.length > 0 ? (
          <section className="mb-3">
            <h2 className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Abertas
            </h2>
            <div className="flex flex-col gap-px">
              {openList.map((l) => {
                const live = liveSessions.get(l.sessionKey)
                const state: LiveSessionState = live ? live.state : 'finalizado'
                const active = l.sessionKey === activeSessionKey
                return (
                  <div
                    key={l.sessionKey}
                    className={cn(
                      'group/row flex items-center gap-2 rounded border-l-2 border-transparent px-2 py-1.5 text-xs',
                      active
                        ? 'border-sky-500 bg-sky-900/30 text-foreground'
                        : 'text-muted-foreground hover:bg-accent/60',
                    )}
                  >
                    <StateIndicator state={state} />
                    <button
                      onClick={() => onActivateOpen(l.sessionKey)}
                      className="flex min-w-0 flex-1 flex-col text-left cursor-pointer"
                    >
                      <span className="truncate">{launchLabel(l)}</span>
                      <span className="truncate font-mono text-[10px] text-muted-foreground/70">
                        {l.cwd}
                      </span>
                    </button>
                    <Tooltip content="Fechar sessão">
                      <button
                        onClick={() => onCloseSession(l.sessionKey)}
                        className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover/row:opacity-100 cursor-pointer"
                        aria-label="Fechar sessão"
                      >
                        <X size={12} />
                      </button>
                    </Tooltip>
                  </div>
                )
              })}
            </div>
          </section>
        ) : null}

        {projects.length === 0 && !loading ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">
            Nenhuma sessão encontrada. Crie uma nova.
          </p>
        ) : null}

        <SessionsSection
          variant="history"
          title="Histórico"
          prefsKey="history"
          projects={projects}
          liveSessions={liveSessions}
          activeSessionKey={activeSessionKey}
          onResumeSession={onResumeSession}
          onArchive={onArchiveSession}
          onUnarchive={onUnarchiveSession}
          onDelete={onDeleteSession}
          renderState={renderState}
          applyProjectOrder={applyOrder}
          onReorderProject={moveSlug}
        />

        {hasArchived ? (
          <SessionsSection
            variant="archived"
            title="Arquivadas"
            prefsKey="archived"
            defaultCollapsed
            projects={projects}
            liveSessions={liveSessions}
            activeSessionKey={activeSessionKey}
            onResumeSession={onResumeSession}
            onArchive={onArchiveSession}
            onUnarchive={onUnarchiveSession}
            onDelete={onDeleteSession}
            renderState={renderState}
            applyProjectOrder={applyOrder}
            onReorderProject={moveSlug}
          />
        ) : null}
      </div>
    </aside>
  )
}
