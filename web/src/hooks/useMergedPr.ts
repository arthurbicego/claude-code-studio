import { useEffect, useState } from 'react'
import type { GhPrResult } from '@/types'

const POLL_MS = 60_000

/**
 * Polls `gh pr view <branch>` for the worktree at `cwd`. Returns null until the
 * first response. The hook self-disables when the server reports `gh` is not
 * available, to avoid spamming requests on machines without the CLI.
 */
export function useMergedPr(cwd: string | null, branch: string | null): GhPrResult | null {
  const [data, setData] = useState<GhPrResult | null>(null)

  useEffect(() => {
    setData(null)
    if (!cwd || !branch) return
    let cancelled = false
    let stopped = false
    let timer: number | null = null
    const controller = new AbortController()

    const tick = async () => {
      try {
        const params = new URLSearchParams({ cwd, branch })
        const res = await fetch(`/api/github/pr?${params.toString()}`, {
          cache: 'no-store',
          signal: controller.signal,
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const payload = (await res.json()) as GhPrResult
        if (cancelled) return
        setData(payload)
        // The previous version put this `return` inside the try block, so the finally below
        // still scheduled the next tick. Set a flag instead and gate the reschedule on it,
        // so machines without `gh` actually stop hitting the endpoint.
        if (!payload.supported) {
          stopped = true
          return
        }
      } catch {
        // swallow — keep showing previous value, retry on next tick
      } finally {
        if (!cancelled && !stopped) timer = window.setTimeout(tick, POLL_MS)
      }
    }
    tick()

    return () => {
      cancelled = true
      controller.abort()
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [cwd, branch])

  return data
}
