import { useCallback } from 'react'
import { usePolling } from '@/hooks/usePolling'
import { fetchJson } from '@/lib/fetchJson'
import type { PlanResult } from '@/types'

const POLL_MS = 2500

export function useSessionPlan(sessionId: string | null) {
  const fetcher = useCallback(
    (signal: AbortSignal) =>
      fetchJson<PlanResult>(`/api/sessions/${encodeURIComponent(sessionId!)}/plan`, {
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
