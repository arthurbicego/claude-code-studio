import { useCallback } from 'react'
import { usePolling } from '@/hooks/usePolling'
import { fetchJson } from '@/lib/fetchJson'
import type { TasksResult } from '@/types'

const POLL_MS = 2500

export function useSessionTasks(sessionId: string | null) {
  const fetcher = useCallback(
    (signal: AbortSignal) =>
      fetchJson<TasksResult>(`/api/sessions/${encodeURIComponent(sessionId!)}/tasks`, {
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
