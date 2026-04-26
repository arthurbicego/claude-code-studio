import { useCallback, useEffect, useState } from 'react'
import type { WorktreesResult } from '@/types'

const POLL_MS = 5000

export function useWorktrees(cwd: string | null, base?: string | null) {
  const [data, setData] = useState<WorktreesResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Bumping this triggers the polling effect to re-run, which aborts any in-flight fetch
  // and starts a new tick. Doing the abort+restart inside refresh-as-a-side-effect would
  // race with the effect's own controller; a state-driven re-mount of the loop is cleaner.
  const [reloadToken, setReloadToken] = useState(0)

  const refresh = useCallback(() => {
    setReloadToken((n) => n + 1)
  }, [])

  useEffect(() => {
    if (!cwd) {
      setData(null)
      return
    }
    const controller = new AbortController()
    let cancelled = false
    let timer: number | null = null

    const fetchOnce = async () => {
      const params = new URLSearchParams({ cwd })
      if (base) params.set('base', base)
      try {
        setLoading(true)
        const res = await fetch(`/api/worktrees?${params.toString()}`, {
          cache: 'no-store',
          signal: controller.signal,
        })
        if (controller.signal.aborted) return
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const payload = (await res.json()) as WorktreesResult
        if (controller.signal.aborted) return
        setData(payload)
        setError(null)
      } catch (err) {
        if (controller.signal.aborted || (err as Error).name === 'AbortError') return
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    const tick = async () => {
      if (cancelled) return
      await fetchOnce()
      if (!cancelled) timer = window.setTimeout(tick, POLL_MS)
    }
    tick()
    return () => {
      cancelled = true
      controller.abort()
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [cwd, base, reloadToken])

  return { data, loading, error, refresh }
}
