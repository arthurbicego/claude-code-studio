import { useCallback } from 'react'
import { usePolling } from '@/hooks/usePolling'
import { fetchJson } from '@/lib/fetchJson'
import type { DiffResult } from '@/types'

const POLL_MS = 3000

export function useSessionDiff(sessionId: string | null) {
  const fetcher = useCallback(
    (signal: AbortSignal) =>
      fetchJson<DiffResult>(`/api/sessions/${encodeURIComponent(sessionId!)}/diff`, {
        cache: 'no-store',
        signal,
      }),
    [sessionId],
  )

  return usePolling(fetcher, {
    intervalMs: POLL_MS,
    enabled: !!sessionId,
  })
}
