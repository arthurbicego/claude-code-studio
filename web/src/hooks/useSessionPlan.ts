import { useEffect, useState } from 'react'
import type { PlanResult } from '@/types'

const POLL_MS = 2500

export function useSessionPlan(sessionId: string | null) {
  const [data, setData] = useState<PlanResult | null>(null)

  useEffect(() => {
    if (!sessionId) {
      setData(null)
      return
    }
    let cancelled = false
    let timer: number | null = null

    const tick = async () => {
      try {
        const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/plan`, {
          cache: 'no-store',
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const payload = (await res.json()) as PlanResult
        if (!cancelled) setData(payload)
      } catch {
        /* noop */
      } finally {
        if (!cancelled) timer = window.setTimeout(tick, POLL_MS)
      }
    }

    tick()
    return () => {
      cancelled = true
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [sessionId])

  return data
}
