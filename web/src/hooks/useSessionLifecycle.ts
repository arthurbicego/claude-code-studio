import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { LiveSession, OpenPanel, PanelKind, SessionLaunch } from '@/types'

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

type LiveSessionsMap = ReadonlyMap<string, LiveSession>

export function useSessionLifecycle(liveSessions: LiveSessionsMap) {
  const [openSessions, setOpenSessions] = useState<Map<string, SessionLaunch>>(new Map())
  const [activeSessionKey, setActiveSessionKey] = useState<string | null>(null)
  const [openPanelsBySession, setOpenPanelsBySession] = useState<Map<string, OpenPanel[]>>(
    new Map(),
  )
  // Sessões que já foram conciliadas com o snapshot do servidor. Garante que,
  // se o usuário fechar uma sessão rehidratada, ela não reapareça quando a
  // próxima atualização do SSE ainda a contiver.
  const reconciledKeysRef = useRef<Set<string>>(new Set())

  // Rehidrata `openSessions` a partir do snapshot de sessões vivas do servidor.
  // Sem isso, um refresh da página zera o mapa local (estado React em memória)
  // enquanto o PTY continua rodando no backend — as sessões reaparecem no
  // histórico em "standby" mas somem da seção "Abertas".
  useEffect(() => {
    const fresh: [string, SessionLaunch][] = []
    for (const [key, live] of liveSessions) {
      if (reconciledKeysRef.current.has(key)) continue
      reconciledKeysRef.current.add(key)
      fresh.push([key, { sessionKey: key, cwd: live.cwd, resume: key }])
    }
    if (fresh.length === 0) return
    setOpenSessions((prev) => {
      let changed = false
      const next = new Map(prev)
      for (const [key, launch] of fresh) {
        if (next.has(key)) continue
        next.set(key, launch)
        changed = true
      }
      return changed ? next : prev
    })
  }, [liveSessions])

  const activeLaunch = activeSessionKey ? (openSessions.get(activeSessionKey) ?? null) : null

  const openPanels = useMemo(
    () => (activeSessionKey ? (openPanelsBySession.get(activeSessionKey) ?? []) : []),
    [openPanelsBySession, activeSessionKey],
  )

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

  const closeSession = useCallback(
    async (sessionKey: string) => {
      try {
        await fetch(`/api/sessions/${encodeURIComponent(sessionKey)}/close`, { method: 'POST' })
      } catch {
        /* noop */
      }
      reconciledKeysRef.current.delete(sessionKey)
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

  const removeSessions = useCallback(
    (ids: Iterable<string>) => {
      const idSet = new Set(ids)
      setOpenSessions((prev) => {
        let changed = false
        const next = new Map(prev)
        for (const id of idSet) {
          if (next.delete(id)) changed = true
          reconciledKeysRef.current.delete(id)
        }
        return changed ? next : prev
      })
      setOpenPanelsBySession((prev) => {
        let changed = false
        const next = new Map(prev)
        for (const id of idSet) {
          if (next.delete(id)) changed = true
        }
        return changed ? next : prev
      })
      setActiveSessionKey((prev) => {
        if (prev === null || !idSet.has(prev)) return prev
        // Pick the next remaining session in insertion order so a bulk delete that included
        // the active key doesn't leave the UI on a phantom selection.
        for (const key of openSessions.keys()) {
          if (!idSet.has(key)) return key
        }
        return null
      })
    },
    [openSessions],
  )

  return {
    openSessions,
    activeSessionKey,
    setActiveSessionKey,
    activeLaunch,
    openPanels,
    activateLaunch,
    closeSession,
    togglePanel,
    closePanel,
    removeSessions,
    newSessionKey,
  }
}
