import { useCallback, useEffect, useRef, useState } from 'react'
import type { WorktreesResult } from '@/types'

const POLL_MS = 5000

export function useWorktrees(cwd: string | null, base?: string | null) {
  const [data, setData] = useState<WorktreesResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const reloadTokenRef = useRef(0)

  const fetchOnce = useCallback(async () => {
    if (!cwd) {
      setData(null)
      return
    }
    const params = new URLSearchParams({ cwd })
    if (base) params.set('base', base)
    try {
      setLoading(true)
      const res = await fetch(`/api/worktrees?${params.toString()}`, { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const payload = (await res.json()) as WorktreesResult
      setData(payload)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [cwd, base])

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
    let cancelled = false
    let timer: number | null = null

    const tick = async () => {
      if (cancelled) return
      await fetchOnce()
      if (!cancelled) timer = window.setTimeout(tick, POLL_MS)
    }
    tick()
    return () => {
      cancelled = true
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [cwd, base, fetchOnce])

  return { data, loading, error, refresh }
}
