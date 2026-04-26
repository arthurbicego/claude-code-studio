import { useCallback, useEffect, useRef, useState } from 'react'
import type { WorktreesResult } from '@/types'

const POLL_MS = 5000

export function useWorktrees(cwd: string | null, base?: string | null) {
  const [data, setData] = useState<WorktreesResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const reloadTokenRef = useRef(0)

  const fetchOnce = useCallback(
    async (signal?: AbortSignal) => {
      if (!cwd) {
        setData(null)
        return
      }
      const params = new URLSearchParams({ cwd })
      if (base) params.set('base', base)
      try {
        setLoading(true)
        const res = await fetch(`/api/worktrees?${params.toString()}`, {
          cache: 'no-store',
          signal,
        })
        if (signal?.aborted) return
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const payload = (await res.json()) as WorktreesResult
        if (signal?.aborted) return
        setData(payload)
        setError(null)
      } catch (err) {
        if (signal?.aborted || (err as Error).name === 'AbortError') return
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!signal?.aborted) setLoading(false)
      }
    },
    [cwd, base],
  )

  const refresh = useCallback(() => {
    reloadTokenRef.current += 1
    return fetchOnce()
  }, [fetchOnce])

  // biome-ignore lint/correctness/useExhaustiveDependencies: fetchOnce is the useCallback; cwd/base are its own deps, so Biome sees them as redundant — but listing them keeps the intent explicit and harmless
  useEffect(() => {
    if (!cwd) {
      setData(null)
      return
    }
    // Aborts any in-flight fetch when cwd/base changes — without this, a slow response from
    // the previous project could land after the new project's first tick and clobber it.
    const controller = new AbortController()
    let cancelled = false
    let timer: number | null = null

    const tick = async () => {
      if (cancelled) return
      await fetchOnce(controller.signal)
      if (!cancelled) timer = window.setTimeout(tick, POLL_MS)
    }
    tick()
    return () => {
      cancelled = true
      controller.abort()
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [cwd, base, fetchOnce])

  return { data, loading, error, refresh }
}
