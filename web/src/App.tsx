import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AppDialogs, type PendingCloseWorktree } from '@/components/AppDialogs'
import type { EndWorktreeOptions } from '@/components/EndWorktreeDialog'
import { NewSessionModal } from '@/components/NewSessionModal'
import { PanelColumns } from '@/components/PanelColumns'
import { SessionActions } from '@/components/SessionActions'
import { SessionFooter } from '@/components/SessionFooter'
import { Sidebar } from '@/components/Sidebar'
import { TerminalView } from '@/components/Terminal'
import { Toolbar } from '@/components/Toolbar'
import type { WorktreeCloseChoice } from '@/components/WorktreeCloseDialog'
import { useLiveSessions } from '@/hooks/useLiveSessions'
import { usePanelLayout } from '@/hooks/usePanelLayout'
import { useSessionDefaults } from '@/hooks/useSessionDefaults'
import { useSessionFooter } from '@/hooks/useSessionFooter'
import { useSessionLifecycle } from '@/hooks/useSessionLifecycle'
import { useSessionList } from '@/hooks/useSessionList'
import { readApiError, translateApiError } from '@/lib/apiError'
import { layoutColumns } from '@/lib/panels'
import { openInVSCode } from '@/lib/vscode'
import type {
  Project,
  SessionFooter as SessionFooterData,
  SessionLaunch,
  SessionMeta,
  Worktree,
  WorktreesResult,
} from '@/types'

export default function App() {
  const { t } = useTranslation()
  const { projects, loading, error, refreshedAt, refresh } = useSessionList()
  const { defaults } = useSessionDefaults()
  const liveSessions = useLiveSessions(refresh)

  const {
    openSessions,
    activeSessionKey,
    activeLaunch,
    openPanels,
    activateLaunch,
    closeSession,
    togglePanel,
    closePanel,
    removeSessions,
    newSessionKey,
  } = useSessionLifecycle(liveSessions)

  const [modalOpen, setModalOpen] = useState(false)
  const [modalInitial, setModalInitial] = useState<{ cwd?: string; isolate?: boolean } | null>(null)
  const [pendingCloseWorktree, setPendingCloseWorktree] = useState<PendingCloseWorktree | null>(
    null,
  )
  const [closingBusy, setClosingBusy] = useState(false)
  const [closingError, setClosingError] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<SessionMeta | null>(null)
  const [pendingArchive, setPendingArchive] = useState<{
    id: string
    action: 'archive' | 'unarchive'
  } | null>(null)
  const [pendingProjectArchive, setPendingProjectArchive] = useState<Project | null>(null)
  const [pendingProjectDelete, setPendingProjectDelete] = useState<{
    project: Project
    worktrees: Project[]
  } | null>(null)
  const [pendingEndWorktree, setPendingEndWorktree] = useState<{
    project: Project
    worktree: Worktree
    projectCwd: string
    base: string | null
    sessionCount: number
  } | null>(null)
  const [endingBusy, setEndingBusy] = useState(false)
  const [endingError, setEndingError] = useState<string | null>(null)
  const [pendingVSCodeOpen, setPendingVSCodeOpen] = useState<{
    path: string
    label: string
  } | null>(null)
  const [status, setStatus] = useState<string>(() => t('terminal.noSessions'))
  const [interruptSignal, setInterruptSignal] = useState(0)
  const [inputSignal, setInputSignal] = useState<{ seq: number; text: string } | null>(null)

  const footer = useSessionFooter(activeLaunch ? activeSessionKey : null)
  const liveCwds = useMemo(() => {
    const set = new Set<string>()
    liveSessions.forEach((s) => {
      if (s.cwd) set.add(s.cwd)
    })
    return set
  }, [liveSessions])
  // Resolve the cwd for panels from the JSONL-backed project metadata. Falling back to
  // `activeLaunch.cwd` alone is wrong for worktree launches: the PTY is spawned in the
  // parent repo and the Claude CLI enters the worktree internally, so `entry.cwd` on the
  // server stays pinned to the parent. The project list reflects the cwd Claude actually
  // writes to its JSONL — the truth for where the session is operating now.
  const activeCwd = useMemo(() => {
    if (!activeSessionKey) return activeLaunch?.cwd ?? ''
    for (const p of projects) {
      if (p.sessions.some((s) => s.id === activeSessionKey)) return p.cwd
    }
    return activeLaunch?.cwd ?? ''
  }, [projects, activeSessionKey, activeLaunch])
  const openPanelKinds = useMemo(() => new Set(openPanels.map((p) => p.kind)), [openPanels])
  const panelColumns = useMemo(() => layoutColumns(openPanels), [openPanels])
  const { columnWidths, rowRatios, setColumnWidth, setRowRatio } = usePanelLayout(
    panelColumns.length,
  )

  const sendInput = (text: string) => {
    setInputSignal((prev) => ({ seq: (prev?.seq ?? 0) + 1, text }))
  }

  const onResumeSession = useCallback(
    (project: Project, session: SessionMeta) => {
      activateLaunch({
        sessionKey: session.id,
        cwd: project.cwd,
        resume: session.id,
        label: session.preview ?? session.id,
      })
    },
    [activateLaunch],
  )

  const onLaunchNew = useCallback(
    (launch: SessionLaunch) => {
      activateLaunch({ ...launch, sessionKey: launch.sessionKey || newSessionKey() })
      setModalOpen(false)
      setModalInitial(null)
    },
    [activateLaunch, newSessionKey],
  )

  const launchInWorktree = useCallback(
    (worktreePath: string) => {
      activateLaunch({
        sessionKey: newSessionKey(),
        cwd: worktreePath,
        model: (defaults.model as SessionLaunch['model']) ?? undefined,
        effort: (defaults.effort as SessionLaunch['effort']) ?? undefined,
        permissionMode: (defaults.permissionMode as SessionLaunch['permissionMode']) ?? undefined,
      })
    },
    [activateLaunch, defaults, newSessionKey],
  )

  const openCreateWorktreeModal = useCallback((cwd: string) => {
    setModalInitial({ cwd, isolate: true })
    setModalOpen(true)
  }, [])

  const openNewSessionModal = useCallback(() => {
    setModalInitial(null)
    setModalOpen(true)
  }, [])

  const closeSessionWithGuard = useCallback(
    async (sessionKey: string) => {
      const launch = openSessions.get(sessionKey)
      if (!launch) {
        await closeSession(sessionKey)
        return
      }
      try {
        const footerRes = await fetch(`/api/sessions/${encodeURIComponent(sessionKey)}/footer`, {
          cache: 'no-store',
        })
        if (!footerRes.ok) throw new Error('footer unavailable')
        const footerData = (await footerRes.json()) as SessionFooterData
        if (!footerData?.worktree) {
          await closeSession(sessionKey)
          return
        }
        const params = new URLSearchParams({ cwd: launch.cwd })
        const wtRes = await fetch(`/api/worktrees?${params.toString()}`, { cache: 'no-store' })
        if (!wtRes.ok) throw new Error('worktrees unavailable')
        const data = (await wtRes.json()) as WorktreesResult
        const match = data.worktrees.find((w) => w.path === footerData.worktree?.path) ?? null
        if (!match || match.isMain) {
          await closeSession(sessionKey)
          return
        }
        const needsDecision = (!match.clean || match.ahead > 0) && match.liveSessionCount <= 1
        if (!needsDecision) {
          await closeSession(sessionKey)
          return
        }
        setClosingError(null)
        setPendingCloseWorktree({
          sessionKey,
          worktree: match,
          base: data.base,
          projectCwd: launch.cwd,
        })
      } catch {
        await closeSession(sessionKey)
      }
    },
    [openSessions, closeSession],
  )

  const handleWorktreeCloseChoice = useCallback(
    async (choice: WorktreeCloseChoice, payload: { commitMessage?: string }) => {
      if (!pendingCloseWorktree) return
      const { sessionKey, worktree, projectCwd, base } = pendingCloseWorktree
      setClosingBusy(true)
      setClosingError(null)
      try {
        if (choice === 'commit') {
          if (!payload.commitMessage) {
            setClosingError(t('worktreeClose.commitMissing'))
            return
          }
          const res = await fetch('/api/worktrees/commit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              cwd: projectCwd,
              path: worktree.path,
              message: payload.commitMessage,
            }),
          })
          if (!res.ok) {
            const apiErr = await readApiError(res)
            throw new Error(translateApiError(t, apiErr))
          }
          await closeSession(sessionKey)
        } else if (choice === 'keep') {
          await closeSession(sessionKey)
        } else if (choice === 'merge') {
          await closeSession(sessionKey)
          const res = await fetch('/api/worktrees/merge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              cwd: projectCwd,
              path: worktree.path,
              base: base ?? undefined,
            }),
          })
          if (!res.ok) {
            const apiErr = await readApiError(res)
            throw new Error(translateApiError(t, apiErr))
          }
        } else if (choice === 'discard') {
          await closeSession(sessionKey)
          const res = await fetch('/api/worktrees/discard', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cwd: projectCwd, path: worktree.path }),
          })
          if (!res.ok) {
            const apiErr = await readApiError(res)
            throw new Error(translateApiError(t, apiErr))
          }
        }
        setPendingCloseWorktree(null)
      } catch (err) {
        setClosingError(err instanceof Error ? err.message : String(err))
      } finally {
        setClosingBusy(false)
      }
    },
    [pendingCloseWorktree, closeSession, t],
  )

  useEffect(() => {
    if (!activeSessionKey) return
    const live = liveSessions.get(activeSessionKey)
    if (!live && openSessions.has(activeSessionKey)) {
      // Sessão finalizada no servidor (auto-kill ou exit) — podemos manter aberta; usuário decide fechar.
    }
  }, [liveSessions, activeSessionKey, openSessions])

  const archiveSession = useCallback(async (id: string) => {
    try {
      await fetch(`/api/sessions/${encodeURIComponent(id)}/archive`, { method: 'POST' })
    } catch {
      /* noop */
    }
  }, [])

  const unarchiveSession = useCallback(async (id: string) => {
    try {
      await fetch(`/api/sessions/${encodeURIComponent(id)}/unarchive`, { method: 'POST' })
    } catch {
      /* noop */
    }
  }, [])

  const confirmArchive = useCallback(async () => {
    const target = pendingArchive
    if (!target) return
    if (target.action === 'archive') {
      await archiveSession(target.id)
    } else {
      await unarchiveSession(target.id)
    }
    refresh()
  }, [pendingArchive, archiveSession, unarchiveSession, refresh])

  const requestOpenInVSCode = useCallback((path: string, label: string) => {
    setPendingVSCodeOpen({ path, label })
  }, [])

  const confirmProjectArchive = useCallback(async () => {
    const target = pendingProjectArchive
    if (!target) return
    const ids = target.sessions.filter((s) => !s.archived).map((s) => s.id)
    await Promise.all(
      ids.map((id) =>
        fetch(`/api/sessions/${encodeURIComponent(id)}/archive`, { method: 'POST' }).catch(
          () => null,
        ),
      ),
    )
    refresh()
  }, [pendingProjectArchive, refresh])

  const confirmProjectDelete = useCallback(
    async (cascade: boolean) => {
      const target = pendingProjectDelete
      if (!target) return
      const ids = target.project.sessions.map((s) => s.id)
      if (cascade) {
        for (const wt of target.worktrees) {
          for (const s of wt.sessions) ids.push(s.id)
        }
      }
      for (const id of ids) {
        try {
          if (openSessions.has(id)) {
            await fetch(`/api/sessions/${encodeURIComponent(id)}/close`, { method: 'POST' })
          }
          await fetch(`/api/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' })
        } catch {
          /* noop */
        }
      }
      removeSessions(ids)
      refresh()
    },
    [pendingProjectDelete, openSessions, removeSessions, refresh],
  )

  const confirmDelete = useCallback(async () => {
    const target = pendingDelete
    if (!target) return
    try {
      if (openSessions.has(target.id)) {
        await fetch(`/api/sessions/${encodeURIComponent(target.id)}/close`, { method: 'POST' })
      }
      await fetch(`/api/sessions/${encodeURIComponent(target.id)}`, { method: 'DELETE' })
    } catch {
      /* noop */
    }
    removeSessions([target.id])
    refresh()
  }, [pendingDelete, openSessions, removeSessions, refresh])

  const requestEndWorktree = useCallback(
    async (project: Project) => {
      const parentCwd = project.worktreeOf?.parentCwd
      if (!parentCwd) return
      setEndingError(null)
      try {
        const params = new URLSearchParams({ cwd: parentCwd })
        const res = await fetch(`/api/worktrees?${params.toString()}`, { cache: 'no-store' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = (await res.json()) as WorktreesResult
        const worktree = data.worktrees.find((w) => w.path === project.cwd) ?? null
        if (!worktree) {
          setEndingError(t('errors.WORKTREE_PATH_INVALID'))
          return
        }
        setPendingEndWorktree({
          project,
          worktree,
          projectCwd: parentCwd,
          base: data.base,
          sessionCount: project.sessions.length,
        })
      } catch (err) {
        setEndingError(err instanceof Error ? err.message : String(err))
        setPendingEndWorktree(
          (prev) =>
            prev ?? {
              project,
              // Synthesize a minimal Worktree so the dialog can still render with an error.
              worktree: {
                path: project.cwd,
                branch: project.worktreeOf?.branch ?? null,
                head: null,
                detached: false,
                prunable: false,
                isMain: false,
                clean: true,
                modifiedCount: 0,
                ahead: 0,
                behind: 0,
                linesAdded: 0,
                linesRemoved: 0,
                liveSessionCount: 0,
                mtime: null,
                upstream: null,
              },
              projectCwd: parentCwd,
              base: null,
              sessionCount: project.sessions.length,
            },
        )
      }
    },
    [t],
  )

  const confirmEndWorktree = useCallback(
    async (opts: EndWorktreeOptions) => {
      const target = pendingEndWorktree
      if (!target) return
      setEndingBusy(true)
      setEndingError(null)
      try {
        const res = await fetch('/api/worktrees/end', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cwd: target.projectCwd,
            path: target.worktree.path,
            commitMessage: opts.commitMessage,
            push: opts.push,
            deleteRemote: opts.deleteRemote,
            deleteLocalBranch: opts.deleteLocalBranch,
            force: true,
          }),
        })
        if (!res.ok) {
          const apiErr = await readApiError(res)
          throw new Error(translateApiError(t, apiErr))
        }
        if (opts.deleteSessions) {
          const ids = target.project.sessions.map((s) => s.id)
          for (const id of ids) {
            try {
              if (openSessions.has(id)) {
                await fetch(`/api/sessions/${encodeURIComponent(id)}/close`, { method: 'POST' })
              }
              await fetch(`/api/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' })
            } catch {
              /* noop — best-effort per session */
            }
          }
          removeSessions(ids)
        }
        setPendingEndWorktree(null)
        refresh()
      } catch (err) {
        setEndingError(err instanceof Error ? err.message : String(err))
      } finally {
        setEndingBusy(false)
      }
    },
    [pendingEndWorktree, openSessions, removeSessions, refresh, t],
  )

  const requestEndWorktreeFromPanel = useCallback(
    (parentCwd: string, worktreePath: string) => {
      const project = projects.find((p) => p.cwd === worktreePath)
      if (project) {
        requestEndWorktree(project)
        return
      }
      // Worktree exists on disk but has no session yet — synthesize a Project so
      // the dialog can still drive the unified end-worktree flow.
      requestEndWorktree({
        slug: worktreePath,
        cwd: worktreePath,
        cwdResolved: true,
        sessions: [],
        worktreeOf: { parentCwd, branch: null },
      })
    },
    [projects, requestEndWorktree],
  )

  return (
    <div className="flex h-full">
      <Sidebar
        projects={projects}
        loading={loading}
        error={error}
        refreshedAt={refreshedAt}
        openSessions={openSessions}
        liveSessions={liveSessions}
        activeSessionKey={activeSessionKey}
        onRefresh={refresh}
        onOpenNewSession={openNewSessionModal}
        onResumeSession={onResumeSession}
        onCloseSession={closeSessionWithGuard}
        onArchiveSession={(id) => setPendingArchive({ id, action: 'archive' })}
        onUnarchiveSession={(id) => setPendingArchive({ id, action: 'unarchive' })}
        onDeleteSession={(s) => setPendingDelete(s)}
        onOpenProjectInVSCode={(project) =>
          requestOpenInVSCode(
            project.cwd,
            project.cwd.split('/').filter(Boolean).pop() || project.cwd,
          )
        }
        onArchiveProject={(project) => setPendingProjectArchive(project)}
        onEndWorktree={requestEndWorktree}
        onDeleteProject={(project) => {
          const worktrees = projects.filter(
            (p) => p.worktreeOf?.parentCwd === project.cwd && p.sessions.length > 0,
          )
          setPendingProjectDelete({ project, worktrees })
        }}
      />
      <main className="flex min-w-0 flex-1 flex-col">
        <Toolbar
          disabled={!activeLaunch}
          status={status}
          sessionId={activeLaunch ? activeSessionKey : null}
          openPath={activeLaunch?.cwd ?? null}
          openPanelKinds={openPanelKinds}
          onTogglePanel={togglePanel}
          onOpenInVSCode={requestOpenInVSCode}
        />
        <div className="flex min-h-0 flex-1">
          <div className="relative flex min-w-0 flex-1">
            {Array.from(openSessions.values()).map((l) => {
              const active = l.sessionKey === activeSessionKey
              return (
                <TerminalView
                  key={l.sessionKey}
                  launch={l}
                  skipDefaults={defaults}
                  onStatus={active ? setStatus : undefined}
                  interruptSignal={active ? interruptSignal : 0}
                  inputSignal={active ? inputSignal : null}
                  isActive={active}
                />
              )
            })}
            {!activeLaunch ? (
              <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                {t('terminal.noActiveSession')}
              </div>
            ) : null}
          </div>
          {activeLaunch ? (
            <PanelColumns
              columns={panelColumns}
              widths={columnWidths}
              ratios={rowRatios}
              sessionId={activeSessionKey}
              cwd={activeCwd}
              onSetWidth={setColumnWidth}
              onSetRatio={setRowRatio}
              onClose={closePanel}
              onLaunchInWorktree={launchInWorktree}
              onOpenCreateWorktree={openCreateWorktreeModal}
              onEndWorktreeFromPanel={requestEndWorktreeFromPanel}
            />
          ) : null}
        </div>
        {activeLaunch ? (
          <>
            <SessionActions
              disabled={!activeLaunch}
              onSendInput={sendInput}
              onInterrupt={() => setInterruptSignal((x) => x + 1)}
            />
            <SessionFooter
              key={activeLaunch.sessionKey}
              data={footer}
              onEndWorktree={
                footer?.worktree
                  ? () => {
                      const wtPath = footer.worktree?.path
                      if (!wtPath) return
                      const project = projects.find((p) => p.cwd === wtPath)
                      if (project) requestEndWorktree(project)
                    }
                  : undefined
              }
            />
          </>
        ) : null}
      </main>

      <NewSessionModal
        open={modalOpen}
        defaults={defaults}
        projects={projects}
        liveCwds={liveCwds}
        initial={modalInitial}
        onClose={() => {
          setModalOpen(false)
          setModalInitial(null)
        }}
        onLaunch={onLaunchNew}
      />

      <AppDialogs
        pendingArchive={pendingArchive}
        onConfirmArchive={confirmArchive}
        onCloseArchive={() => setPendingArchive(null)}
        pendingCloseWorktree={pendingCloseWorktree}
        closingBusy={closingBusy}
        closingError={closingError}
        onChooseWorktreeClose={handleWorktreeCloseChoice}
        onCancelWorktreeClose={() => {
          setPendingCloseWorktree(null)
          setClosingError(null)
        }}
        pendingVSCodeOpen={pendingVSCodeOpen}
        onConfirmVSCode={() => {
          if (pendingVSCodeOpen) openInVSCode(pendingVSCodeOpen.path)
        }}
        onCloseVSCode={() => setPendingVSCodeOpen(null)}
        pendingProjectArchive={pendingProjectArchive}
        onConfirmProjectArchive={confirmProjectArchive}
        onCloseProjectArchive={() => setPendingProjectArchive(null)}
        pendingProjectDelete={pendingProjectDelete}
        onConfirmProjectDelete={confirmProjectDelete}
        onCloseProjectDelete={() => setPendingProjectDelete(null)}
        pendingDelete={pendingDelete}
        onConfirmDelete={confirmDelete}
        onCloseDelete={() => setPendingDelete(null)}
        pendingEndWorktree={pendingEndWorktree}
        endingBusy={endingBusy}
        endingError={endingError}
        onConfirmEndWorktree={confirmEndWorktree}
        onCancelEndWorktree={() => {
          setPendingEndWorktree(null)
          setEndingError(null)
        }}
      />
    </div>
  )
}
