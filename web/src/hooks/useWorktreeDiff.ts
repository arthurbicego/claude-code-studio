import { useEffect, useState } from 'react'
import type { WorktreeDiffResult } from '@/types'

const POLL_MS = 3000

export function useWorktreeDiff(cwd: string | null, worktreePath: string | null, base?: string | null) {
  const [data, setData] = useState<WorktreeDiffResult | null>(null)

  useEffect(() => {
    if (!cwd || !worktreePath) {
      setData(null)
      return
    }
    let cancelled = false
    let timer: number | null = null

    const tick = async () => {
      try {
        const params = new URLSearchParams({ cwd, path: worktreePath })
        if (base) params.set('base', base)
        const res = await fetch(`/api/worktrees/diff?${params.toString()}`, { cache: 'no-store' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const payload = (await res.json()) as WorktreeDiffResult
        if (!cancelled) setData(payload)
      } catch {
        /* noop — keep previous data */
      } finally {
        if (!cancelled) timer = window.setTimeout(tick, POLL_MS)
      }
    }

    tick()
    return () => {
      cancelled = true
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [cwd, worktreePath, base])

  return data
}
