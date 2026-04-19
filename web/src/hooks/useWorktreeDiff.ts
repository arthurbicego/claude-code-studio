import { useCallback } from 'react'
import { usePolling } from '@/hooks/usePolling'
import { fetchJson } from '@/lib/fetchJson'
import type { WorktreeDiffResult } from '@/types'

const POLL_MS = 3000

export function useWorktreeDiff(
  cwd: string | null,
  worktreePath: string | null,
  base?: string | null,
) {
  const fetcher = useCallback(
    (signal: AbortSignal) => {
      const params = new URLSearchParams({ cwd: cwd!, path: worktreePath! })
      if (base) params.set('base', base)
      return fetchJson<WorktreeDiffResult>(`/api/worktrees/diff?${params.toString()}`, {
        cache: 'no-store',
        signal,
      })
    },
    [cwd, worktreePath, base],
  )

  return usePolling(fetcher, {
    intervalMs: POLL_MS,
    enabled: !!cwd && !!worktreePath,
  })
}
