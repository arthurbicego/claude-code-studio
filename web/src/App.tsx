import { useCallback, useEffect, useState } from 'react'
import { Sidebar } from '@/components/Sidebar'
import { Toolbar } from '@/components/Toolbar'
import { TerminalView } from '@/components/Terminal'
import { SessionFooter } from '@/components/SessionFooter'
import { NewSessionModal } from '@/components/NewSessionModal'
import { SettingsModal } from '@/components/SettingsModal'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { useSessionList } from '@/hooks/useSessionList'
import { useSessionDefaults } from '@/hooks/useSessionDefaults'
import { useLiveSessions } from '@/hooks/useLiveSessions'
import { useSessionFooter } from '@/hooks/useSessionFooter'
import type { Project, SessionLaunch, SessionMeta } from '@/types'

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
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<SessionMeta | null>(null)
  const [status, setStatus] = useState('Selecione uma sessão na barra lateral ou crie uma nova.')
  const [interruptSignal, setInterruptSignal] = useState(0)
  const [inputSignal, setInputSignal] = useState<{ seq: number; text: string } | null>(null)

  const activeLaunch = activeSessionKey ? openSessions.get(activeSessionKey) ?? null : null
  const footer = useSessionFooter(activeLaunch ? activeSessionKey : null)

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
    },
    [activateLaunch],
  )

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
      setActiveSessionKey((prev) => {
        if (prev !== sessionKey) return prev
        const remaining = Array.from(openSessions.keys()).filter((k) => k !== sessionKey)
        return remaining[0] ?? null
      })
    },
    [openSessions],
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
        onOpenNewSession={() => setModalOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onResumeSession={onResumeSession}
        onCloseSession={closeSession}
        onArchiveSession={archiveSession}
        onUnarchiveSession={unarchiveSession}
        onDeleteSession={(s) => setPendingDelete(s)}
      />
      <main className="flex min-w-0 flex-1 flex-col">
        <Toolbar
          disabled={!activeLaunch}
          onSendInput={sendInput}
          onInterrupt={() => setInterruptSignal((x) => x + 1)}
        />
        <div className="border-b border-border bg-muted/20 px-4 py-2 text-xs text-muted-foreground">
          {status}
        </div>
        <div className="relative flex min-h-0 flex-1">
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
        {activeLaunch ? <SessionFooter key={activeLaunch.sessionKey} data={footer} /> : null}
      </main>

      <NewSessionModal
        open={modalOpen}
        defaults={defaults}
        projects={projects}
        onClose={() => setModalOpen(false)}
        onLaunch={onLaunchNew}
      />

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />

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
