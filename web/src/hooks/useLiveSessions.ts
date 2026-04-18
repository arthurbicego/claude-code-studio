import { useCallback, useState } from 'react'
import { useSessionStream } from '@/hooks/useSessionStream'
import type { LiveSession, LiveSessionsSnapshot } from '@/types'

type LiveSessionsMap = Map<string, LiveSession>

const EMPTY: LiveSessionsMap = new Map()

export function useLiveSessions(onInvalidate?: () => void) {
  const [sessions, setSessions] = useState<LiveSessionsMap>(EMPTY)

  const handleActivity = useCallback((snap: LiveSessionsSnapshot) => {
    const next: LiveSessionsMap = new Map()
    for (const s of snap.sessions) next.set(s.sessionKey, s)
    setSessions(next)
  }, [])

  useSessionStream({ onInvalidate, onActivity: handleActivity })

  return sessions
}
