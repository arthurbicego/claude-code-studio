import { Bell, Circle, CircleDashed, CircleDot, Plus, RefreshCw, Settings } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { SessionsSection } from '@/components/SessionsSection'
import { Button } from '@/components/ui/Button'
import { Tooltip } from '@/components/ui/Tooltip'
import { useFormatTime } from '@/hooks/useFormatDate'
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
  onResumeSession: (project: Project, session: SessionMeta) => void
  onCloseSession: (sessionKey: string) => void
  onArchiveSession: (id: string) => void
  onUnarchiveSession: (id: string) => void
  onDeleteSession: (session: SessionMeta) => void
  onOpenProjectInVSCode: (project: Project) => void
  onArchiveProject: (project: Project) => void
  onDeleteProject: (project: Project) => void
}

function StateIndicator({ state }: { state: LiveSessionState }) {
  const { t } = useTranslation()
  if (state === 'aguardando') {
    return (
      <Tooltip content={t('sidebar.state.waiting')}>
        <Bell size={12} className="shrink-0 animate-pulse text-sky-400" />
      </Tooltip>
    )
  }
  if (state === 'ativo') {
    return (
      <Tooltip content={t('sidebar.state.active')}>
        <CircleDot size={12} className="shrink-0 text-emerald-400" />
      </Tooltip>
    )
  }
  if (state === 'standby') {
    return (
      <Tooltip content={t('sidebar.state.standby')}>
        <CircleDashed size={12} className="shrink-0 text-amber-500" />
      </Tooltip>
    )
  }
  return (
    <Tooltip content={t('sidebar.state.closed')}>
      <Circle size={12} className="shrink-0 text-muted-foreground/50" />
    </Tooltip>
  )
}

function renderState(live: LiveSession | undefined) {
  if (!live) return <span className="inline-block w-3" />
  return <StateIndicator state={live.state} />
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
  onResumeSession,
  onCloseSession,
  onArchiveSession,
  onUnarchiveSession,
  onDeleteSession,
  onOpenProjectInVSCode,
  onArchiveProject,
  onDeleteProject,
}: Props) {
  const { t } = useTranslation()
  const formatTime = useFormatTime()
  const navigate = useNavigate()
  const openSessionKeys = useMemo(() => new Set(openSessions.keys()), [openSessions])
  const hasOpen = openSessions.size > 0
  const hasArchived = projects.some((p) => p.sessions.some((s) => s.archived))
  const { applyOrder, moveSlug } = useProjectOrder()

  const reloadTooltip = refreshedAt
    ? t('sidebar.reloadListAt', { time: formatTime(refreshedAt) })
    : t('sidebar.reloadList')

  return (
    <aside className="flex w-80 flex-col border-r border-border bg-card/40">
      <header className="flex flex-col gap-2 border-b border-border p-4">
        <div className="flex items-center gap-2">
          <h1 className="flex-1 text-sm font-semibold text-foreground">{t('sidebar.appName')}</h1>
          <Tooltip content={reloadTooltip}>
            <Button size="xs" variant="ghost" onClick={onRefresh} disabled={loading}>
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </Button>
          </Tooltip>
          <Tooltip content={t('sidebar.settings')}>
            <Button size="xs" variant="ghost" onClick={() => navigate('/settings')}>
              <Settings size={14} />
            </Button>
          </Tooltip>
        </div>
        <Button size="sm" variant="primary" onClick={onOpenNewSession}>
          <Plus size={14} /> {t('sidebar.newSession')}
        </Button>
        {error ? (
          <p className="text-xs text-red-400">{t('common.errorPrefix', { message: error })}</p>
        ) : null}
      </header>

      <div className="flex-1 overflow-y-auto p-2">
        {hasOpen ? (
          <>
            <SessionsSection
              variant="open"
              title={t('sidebar.section.open')}
              prefsKey="open"
              projects={projects}
              liveSessions={liveSessions}
              activeSessionKey={activeSessionKey}
              openSessionKeys={openSessionKeys}
              openLaunches={openSessions}
              onResumeSession={onResumeSession}
              onArchive={onArchiveSession}
              onUnarchive={onUnarchiveSession}
              onDelete={onDeleteSession}
              onCloseSession={onCloseSession}
              onOpenProjectInVSCode={onOpenProjectInVSCode}
              onArchiveProject={onArchiveProject}
              onDeleteProject={onDeleteProject}
              renderState={renderState}
              applyProjectOrder={applyOrder}
              onReorderProject={moveSlug}
            />
            <hr className="my-2 border-t border-border/60" />
          </>
        ) : null}

        {projects.length === 0 && !loading ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">{t('sidebar.noSessions')}</p>
        ) : null}

        <SessionsSection
          variant="history"
          title={t('sidebar.section.history')}
          prefsKey="history"
          projects={projects}
          liveSessions={liveSessions}
          activeSessionKey={activeSessionKey}
          openSessionKeys={openSessionKeys}
          onResumeSession={onResumeSession}
          onArchive={onArchiveSession}
          onUnarchive={onUnarchiveSession}
          onDelete={onDeleteSession}
          onOpenProjectInVSCode={onOpenProjectInVSCode}
          onArchiveProject={onArchiveProject}
          onDeleteProject={onDeleteProject}
          renderState={renderState}
          applyProjectOrder={applyOrder}
          onReorderProject={moveSlug}
        />

        {hasArchived ? (
          <>
            <hr className="my-2 border-t border-border/60" />
            <SessionsSection
              variant="archived"
              title={t('sidebar.section.archived')}
              prefsKey="archived"
              defaultCollapsed
              projects={projects}
              liveSessions={liveSessions}
              activeSessionKey={activeSessionKey}
              onResumeSession={onResumeSession}
              onArchive={onArchiveSession}
              onUnarchive={onUnarchiveSession}
              onDelete={onDeleteSession}
              onOpenProjectInVSCode={onOpenProjectInVSCode}
              onArchiveProject={onArchiveProject}
              onDeleteProject={onDeleteProject}
              renderState={renderState}
              applyProjectOrder={applyOrder}
              onReorderProject={moveSlug}
            />
          </>
        ) : null}
      </div>
    </aside>
  )
}
