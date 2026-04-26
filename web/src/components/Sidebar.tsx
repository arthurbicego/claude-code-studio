import {
  Bell,
  Circle,
  CircleDashed,
  CircleDot,
  HelpCircle,
  Plus,
  RefreshCw,
  Search,
  Settings,
  X,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { HelpModal } from '@/components/HelpModal'
import { SessionsSection } from '@/components/SessionsSection'
import { SettingsModal } from '@/components/SettingsModal'
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
  onUnarchiveProject: (project: Project) => void
  onDeleteProject: (project: Project) => void
  onEndWorktree: (project: Project) => void
  onSectionArchive: (
    ids: string[],
    sectionTitle: string,
    action: 'archive' | 'unarchive',
    filtered: boolean,
  ) => void
  onSectionDelete: (ids: string[], sectionTitle: string, filtered: boolean) => void
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
  onUnarchiveProject,
  onDeleteProject,
  onEndWorktree,
  onSectionArchive,
  onSectionDelete,
}: Props) {
  const { t } = useTranslation()
  const formatTime = useFormatTime()
  const [searchQuery, setSearchQuery] = useState('')
  const [helpOpen, setHelpOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const trimmedQuery = searchQuery.trim()
  const openSessionKeys = useMemo(() => new Set(openSessions.keys()), [openSessions])
  const hasOpen = openSessions.size > 0
  const hasArchived = projects.some((p) => p.sessions.some((s) => s.archived))
  const { applyOrder, moveSlug } = useProjectOrder()

  const searchHasResults = useMemo(() => {
    if (!trimmedQuery) return true
    const q = trimmedQuery.toLowerCase()
    for (const p of projects) {
      for (const s of p.sessions) {
        if (s.id.toLowerCase().includes(q)) return true
        if (s.preview?.toLowerCase().includes(q)) return true
      }
    }
    for (const launch of openSessions.values()) {
      if (launch.sessionKey.toLowerCase().includes(q)) return true
      if (launch.label?.toLowerCase().includes(q)) return true
    }
    return false
  }, [trimmedQuery, projects, openSessions])

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
          <Tooltip content={t('help.open')}>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => setHelpOpen(true)}
              aria-label={t('help.open')}
            >
              <HelpCircle size={14} />
            </Button>
          </Tooltip>
          <Tooltip content={t('sidebar.settings')}>
            <Button size="xs" variant="ghost" onClick={() => setSettingsOpen(true)}>
              <Settings size={14} />
            </Button>
          </Tooltip>
        </div>
        <Button size="sm" variant="primary" onClick={onOpenNewSession}>
          <Plus size={14} /> {t('sidebar.newSession')}
        </Button>
        <div className="relative">
          <Search
            size={12}
            className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('sidebar.search')}
            aria-label={t('sidebar.searchAria')}
            className="w-full rounded border border-border bg-background py-1 pl-7 pr-7 text-xs text-foreground placeholder:text-muted-foreground focus:border-sky-500 focus:outline-none"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label={t('sidebar.searchClear')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer"
            >
              <X size={12} />
            </button>
          ) : null}
        </div>
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
              onUnarchiveProject={onUnarchiveProject}
              onDeleteProject={onDeleteProject}
              onEndWorktree={onEndWorktree}
              onSectionArchive={onSectionArchive}
              onSectionDelete={onSectionDelete}
              renderState={renderState}
              applyProjectOrder={applyOrder}
              onReorderProject={moveSlug}
              searchQuery={trimmedQuery}
            />
            <hr className="my-2 border-t border-border/60" />
          </>
        ) : null}

        {projects.length === 0 && !loading ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">{t('sidebar.noSessions')}</p>
        ) : null}

        {trimmedQuery && !searchHasResults ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">
            {t('sidebar.searchEmpty', { query: trimmedQuery })}
          </p>
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
          onUnarchiveProject={onUnarchiveProject}
          onDeleteProject={onDeleteProject}
          onEndWorktree={onEndWorktree}
          onSectionArchive={onSectionArchive}
          onSectionDelete={onSectionDelete}
          renderState={renderState}
          applyProjectOrder={applyOrder}
          onReorderProject={moveSlug}
          searchQuery={trimmedQuery}
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
              onUnarchiveProject={onUnarchiveProject}
              onDeleteProject={onDeleteProject}
              onEndWorktree={onEndWorktree}
              onSectionArchive={onSectionArchive}
              onSectionDelete={onSectionDelete}
              renderState={renderState}
              applyProjectOrder={applyOrder}
              onReorderProject={moveSlug}
              searchQuery={trimmedQuery}
            />
          </>
        ) : null}
      </div>
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </aside>
  )
}
