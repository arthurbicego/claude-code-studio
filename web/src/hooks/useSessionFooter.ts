import { useCallback } from 'react'
import { usePolling } from '@/hooks/usePolling'
import { fetchJson } from '@/lib/fetchJson'
import type { SessionFooter } from '@/types'

const POLL_MS = 2000

export function useSessionFooter(sessionId: string | null) {
  const fetcher = useCallback(
    (signal: AbortSignal) =>
      fetchJson<SessionFooter>(`/api/sessions/${encodeURIComponent(sessionId!)}/footer`, {
        cache: 'no-store',
        signal,
      }),
    [sessionId],
  )

  return usePolling(fetcher, {
    intervalMs: POLL_MS,
    enabled: !!sessionId,
    keepDataOnDisabled: true,
  })
}
