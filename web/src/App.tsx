import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Sidebar } from '@/components/Sidebar'
import { Toolbar } from '@/components/Toolbar'
import { TerminalView } from '@/components/Terminal'
import { SessionActions } from '@/components/SessionActions'
import { SessionFooter } from '@/components/SessionFooter'
import { NewSessionModal } from '@/components/NewSessionModal'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import {
  WorktreeCloseDialog,
  type WorktreeCloseChoice,
} from '@/components/WorktreeCloseDialog'
import { ColumnResizer } from '@/components/panels/ColumnResizer'
import { RowResizer } from '@/components/panels/RowResizer'
import { DiffPanel } from '@/components/panels/DiffPanel'
import { ShellPanel } from '@/components/panels/ShellPanel'
import { TasksPanel } from '@/components/panels/TasksPanel'
import { PlanPanel } from '@/components/panels/PlanPanel'
import { WorktreesPanel } from '@/components/panels/WorktreesPanel'
import { useSessionList } from '@/hooks/useSessionList'
import { useSessionDefaults } from '@/hooks/useSessionDefaults'
import { useLiveSessions } from '@/hooks/useLiveSessions'
import { useSessionFooter } from '@/hooks/useSessionFooter'
import { layoutColumns } from '@/lib/panels'
import type {
  OpenPanel,
  PanelKind,
  Project,
  SessionFooter as SessionFooterData,
  SessionLaunch,
  SessionMeta,
  Worktree,
  WorktreesResult,
} from '@/types'

function newSessionKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export default function App() {
  const { projects, loading, error, refreshedAt, refresh } = useSessionList()
  const { defaults } = useSessionDefaults()
  const liveSessions = useLiveSessions(refresh)

  const [openSessions, setOpenSessions] = useState<Map<string, SessionLaunch>>(new Map())
  const [activeSessionKey, setActiveSessionKey] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalInitial, setModalInitial] = useState<
    { cwd?: string; isolate?: boolean } | null
  >(null)
  const [pendingCloseWorktree, setPendingCloseWorktree] = useState<{
    sessionKey: string
    worktree: Worktree
    base: string | null
    projectCwd: string
  } | null>(null)
  const [closingBusy, setClosingBusy] = useState(false)
  const [closingError, setClosingError] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<SessionMeta | null>(null)
  const [pendingArchive, setPendingArchive] = useState<
    { id: string; action: 'archive' | 'unarchive' } | null
  >(null)
  const [status, setStatus] = useState('Selecione uma sessão na barra lateral ou crie uma nova.')
  const [interruptSignal, setInterruptSignal] = useState(0)
  const [inputSignal, setInputSignal] = useState<{ seq: number; text: string } | null>(null)
  const [openPanelsBySession, setOpenPanelsBySession] = useState<Map<string, OpenPanel[]>>(
    new Map(),
  )

  const activeLaunch = activeSessionKey ? openSessions.get(activeSessionKey) ?? null : null
  const footer = useSessionFooter(activeLaunch ? activeSessionKey : null)
  const liveCwds = useMemo(() => {
    const set = new Set<string>()
    liveSessions.forEach((s) => {
      if (s.cwd) set.add(s.cwd)
    })
    return set
  }, [liveSessions])
  const openPanels = useMemo(
    () => (activeSessionKey ? openPanelsBySession.get(activeSessionKey) ?? [] : []),
    [openPanelsBySession, activeSessionKey],
  )
  const openPanelKinds = useMemo(() => new Set(openPanels.map((p) => p.kind)), [openPanels])
  const panelColumns = useMemo(() => layoutColumns(openPanels), [openPanels])
  const [columnWidths, setColumnWidths] = useState<number[]>([])
  const [rowRatios, setRowRatios] = useState<number[]>([])

  useEffect(() => {
    setColumnWidths((prev) => {
      const target = panelColumns.length
      if (prev.length === target) return prev
      if (target < prev.length) return prev.slice(0, target)
      const next = prev.slice()
      while (next.length < target) next.push(352)
      return next
    })
    setRowRatios((prev) => {
      const target = panelColumns.length
      if (prev.length === target) return prev
      if (target < prev.length) return prev.slice(0, target)
      const next = prev.slice()
      while (next.length < target) next.push(0.5)
      return next
    })
  }, [panelColumns.length])

  const setColumnWidth = useCallback((index: number, width: number) => {
    setColumnWidths((prev) => {
      if (prev[index] === width) return prev
      const next = prev.slice()
      next[index] = width
      return next
    })
  }, [])

  const setRowRatio = useCallback((index: number, ratio: number) => {
    setRowRatios((prev) => {
      if (prev[index] === ratio) return prev
      const next = prev.slice()
      next[index] = ratio
      return next
    })
  }, [])

  const togglePanel = useCallback(
    (kind: PanelKind) => {
      if (!activeSessionKey) return
      setOpenPanelsBySession((prev) => {
        const next = new Map(prev)
        const current = next.get(activeSessionKey) ?? []
        const filtered = current.filter((p) => p.kind !== kind)
        if (filtered.length === current.length) {
          filtered.push({ kind, id: `${kind}-${Date.now()}` })
        }
        if (filtered.length === 0) next.delete(activeSessionKey)
        else next.set(activeSessionKey, filtered)
        return next
      })
    },
    [activeSessionKey],
  )

  const closePanel = useCallback(
    (kind: PanelKind, id: string) => {
      if (!activeSessionKey) return
      setOpenPanelsBySession((prev) => {
        const next = new Map(prev)
        const current = next.get(activeSessionKey) ?? []
        const filtered = current.filter((p) => !(p.kind === kind && p.id === id))
        if (filtered.length === 0) next.delete(activeSessionKey)
        else next.set(activeSessionKey, filtered)
        return next
      })
    },
    [activeSessionKey],
  )

  const sendInput = (text: string) => {
    setInputSignal((prev) => ({ seq: (prev?.seq ?? 0) + 1, text }))
  }

  const activateLaunch = useCallback(
    async (launch: SessionLaunch) => {
      const key = launch.sessionKey
      const live = liveSessions.get(key)
      const alreadyOpen = openSessions.has(key)
      if (alreadyOpen && live) {
        setActiveSessionKey(key)
        return
      }
      if (live && live.state === 'standby') {
        try {
          await fetch(`/api/sessions/${encodeURIComponent(key)}/close`, { method: 'POST' })
        } catch {
          /* noop */
        }
      }
      setOpenSessions((prev) => {
        const next = new Map(prev)
        next.set(key, { ...launch })
        return next
      })
      setActiveSessionKey(key)
    },
    [openSessions, liveSessions],
  )

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
    [activateLaunch],
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
    [activateLaunch, defaults],
  )

  const openCreateWorktreeModal = useCallback((cwd: string) => {
    setModalInitial({ cwd, isolate: true })
    setModalOpen(true)
  }, [])

  const openNewSessionModal = useCallback(() => {
    setModalInitial(null)
    setModalOpen(true)
  }, [])

  const closeSession = useCallback(
    async (sessionKey: string) => {
      try {
        await fetch(`/api/sessions/${encodeURIComponent(sessionKey)}/close`, { method: 'POST' })
      } catch {
        /* noop */
      }
      setOpenSessions((prev) => {
        const next = new Map(prev)
        next.delete(sessionKey)
        return next
      })
      setOpenPanelsBySession((prev) => {
        if (!prev.has(sessionKey)) return prev
        const next = new Map(prev)
        next.delete(sessionKey)
        return next
      })
      setActiveSessionKey((prev) => {
        if (prev !== sessionKey) return prev
        const remaining = Array.from(openSessions.keys()).filter((k) => k !== sessionKey)
        return remaining[0] ?? null
      })
    },
    [openSessions],
  )

  const closeSessionWithGuard = useCallback(
    async (sessionKey: string) => {
      const launch = openSessions.get(sessionKey)
      if (!launch) {
        await closeSession(sessionKey)
        return
      }
      try {
        const footerRes = await fetch(
          `/api/sessions/${encodeURIComponent(sessionKey)}/footer`,
          { cache: 'no-store' },
        )
        if (!footerRes.ok) throw new Error('footer unavailable')
        const footer = (await footerRes.json()) as SessionFooterData
        if (!footer?.worktree) {
          await closeSession(sessionKey)
          return
        }
        const params = new URLSearchParams({ cwd: launch.cwd })
        const wtRes = await fetch(`/api/worktrees?${params.toString()}`, { cache: 'no-store' })
        if (!wtRes.ok) throw new Error('worktrees unavailable')
        const data = (await wtRes.json()) as WorktreesResult
        const match = data.worktrees.find((w) => w.path === footer.worktree?.path) ?? null
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
            setClosingError('mensagem de commit obrigatória')
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
            const body = await res.json().catch(() => ({}))
            throw new Error(body.error || `HTTP ${res.status}`)
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
            const body = await res.json().catch(() => ({}))
            throw new Error(body.error || `HTTP ${res.status}`)
          }
        } else if (choice === 'discard') {
          await closeSession(sessionKey)
          const res = await fetch('/api/worktrees/discard', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cwd: projectCwd, path: worktree.path }),
          })
          if (!res.ok) {
            const body = await res.json().catch(() => ({}))
            throw new Error(body.error || `HTTP ${res.status}`)
          }
        }
        setPendingCloseWorktree(null)
      } catch (err) {
        setClosingError(err instanceof Error ? err.message : String(err))
      } finally {
        setClosingBusy(false)
      }
    },
    [pendingCloseWorktree, closeSession],
  )

  useEffect(() => {
    if (!activeSessionKey) return
    const live = liveSessions.get(activeSessionKey)
    if (!live && openSessions.has(activeSessionKey)) {
      // Sessão finalizada no servidor (auto-kill ou exit) — podemos manter aberta; usuário decide fechar.
    }
  }, [liveSessions, activeSessionKey, openSessions])

  const archiveSession = useCallback(
    async (id: string) => {
      try {
        await fetch(`/api/sessions/${encodeURIComponent(id)}/archive`, { method: 'POST' })
      } catch {
        /* noop */
      }
      refresh()
    },
    [refresh],
  )

  const unarchiveSession = useCallback(
    async (id: string) => {
      try {
        await fetch(`/api/sessions/${encodeURIComponent(id)}/unarchive`, { method: 'POST' })
      } catch {
        /* noop */
      }
      refresh()
    },
    [refresh],
  )

  const confirmArchive = useCallback(async () => {
    const target = pendingArchive
    if (!target) return
    if (target.action === 'archive') {
      await archiveSession(target.id)
    } else {
      await unarchiveSession(target.id)
    }
  }, [pendingArchive, archiveSession, unarchiveSession])

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
    setOpenSessions((prev) => {
      if (!prev.has(target.id)) return prev
      const next = new Map(prev)
      next.delete(target.id)
      return next
    })
    setOpenPanelsBySession((prev) => {
      if (!prev.has(target.id)) return prev
      const next = new Map(prev)
      next.delete(target.id)
      return next
    })
    setActiveSessionKey((prev) => (prev === target.id ? null : prev))
    refresh()
  }, [pendingDelete, openSessions, refresh])

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
      />
      <main className="flex min-w-0 flex-1 flex-col">
        <Toolbar
          disabled={!activeLaunch}
          status={status}
          sessionId={activeLaunch ? activeSessionKey : null}
          openPanelKinds={openPanelKinds}
          onTogglePanel={togglePanel}
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
                Nenhuma sessão ativa.
              </div>
            ) : null}
          </div>
          {activeLaunch
            ? panelColumns.map((col, colIdx) => (
                <Fragment key={`col-${colIdx}`}>
                  <ColumnResizer
                    width={columnWidths[colIdx] ?? 352}
                    onChange={(w) => setColumnWidth(colIdx, w)}
                  />
                  <div
                    className="flex min-h-0 shrink-0 flex-col"
                    style={{ width: `${columnWidths[colIdx] ?? 352}px` }}
                  >
                      {col.map((panel, panelIdx) => {
                      const ratio = rowRatios[colIdx] ?? 0.5
                      const grow = col.length > 1 ? (panelIdx === 0 ? ratio : 1 - ratio) : 1
                      return (
                        <Fragment key={panel.id}>
                          {panelIdx > 0 ? (
                            <RowResizer
                              ratio={ratio}
                              onChange={(r) => setRowRatio(colIdx, r)}
                            />
                          ) : null}
                          <div
                            className="flex min-h-0 min-w-0 flex-col"
                            style={{ flex: `${grow} 1 0%` }}
                          >
                            {panel.kind === 'diff' ? (
                              <DiffPanel
                                sessionId={activeSessionKey}
                                onClose={() => closePanel(panel.kind, panel.id)}
                              />
                            ) : panel.kind === 'terminal' ? (
                              <ShellPanel
                                cwd={activeLaunch.cwd}
                                onClose={() => closePanel(panel.kind, panel.id)}
                              />
                            ) : panel.kind === 'tasks' ? (
                              <TasksPanel
                                sessionId={activeSessionKey}
                                onClose={() => closePanel(panel.kind, panel.id)}
                              />
                            ) : panel.kind === 'plan' ? (
                              <PlanPanel
                                sessionId={activeSessionKey}
                                onClose={() => closePanel(panel.kind, panel.id)}
                              />
                            ) : (
                              <WorktreesPanel
                                cwd={activeLaunch.cwd}
                                onClose={() => closePanel(panel.kind, panel.id)}
                                onLaunchInWorktree={launchInWorktree}
                                onOpenCreate={openCreateWorktreeModal}
                              />
                            )}
                          </div>
                        </Fragment>
                      )
                    })}
                  </div>
                </Fragment>
              ))
            : null}
        </div>
        {activeLaunch ? (
          <>
            <SessionActions
              disabled={!activeLaunch}
              onSendInput={sendInput}
              onInterrupt={() => setInterruptSignal((x) => x + 1)}
            />
            <SessionFooter key={activeLaunch.sessionKey} data={footer} />
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

      <ConfirmDialog
        open={!!pendingArchive}
        title={pendingArchive?.action === 'unarchive' ? 'Desarquivar sessão' : 'Arquivar sessão'}
        description={
          pendingArchive
            ? pendingArchive.action === 'unarchive'
              ? `A sessão (${pendingArchive.id.slice(0, 8)}…) voltará para o histórico.`
              : `A sessão (${pendingArchive.id.slice(0, 8)}…) será movida para Arquivadas.`
            : ''
        }
        confirmLabel={pendingArchive?.action === 'unarchive' ? 'Desarquivar' : 'Arquivar'}
        onConfirm={confirmArchive}
        onClose={() => setPendingArchive(null)}
      />

      <WorktreeCloseDialog
        open={!!pendingCloseWorktree}
        worktree={pendingCloseWorktree?.worktree ?? null}
        projectCwd={pendingCloseWorktree?.projectCwd ?? null}
        base={pendingCloseWorktree?.base ?? null}
        pending={closingBusy}
        error={closingError}
        onChoose={handleWorktreeCloseChoice}
        onCancel={() => {
          setPendingCloseWorktree(null)
          setClosingError(null)
        }}
      />

      <ConfirmDialog
        open={!!pendingDelete}
        title="Apagar sessão definitivamente"
        description={
          pendingDelete
            ? `Esta ação remove o arquivo da sessão (${pendingDelete.id.slice(0, 8)}…) do disco. Não pode ser desfeita.`
            : ''
        }
        confirmLabel="Apagar"
        destructive
        onConfirm={confirmDelete}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  )
}
