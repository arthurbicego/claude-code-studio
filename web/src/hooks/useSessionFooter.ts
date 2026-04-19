import { useEffect, useState } from 'react'
import type { SessionFooter } from '@/types'

const POLL_MS = 2000

export function useSessionFooter(sessionId: string | null) {
  const [data, setData] = useState<SessionFooter | null>(null)

  useEffect(() => {
    if (!sessionId) return
    let cancelled = false
    let timer: number | null = null

    const tick = async () => {
      try {
        const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/footer`, {
          cache: 'no-store',
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const payload = (await res.json()) as SessionFooter
        if (!cancelled) setData(payload)
      } catch {
        /* noop — keep last value visible */
      } finally {
        if (!cancelled) {
          timer = window.setTimeout(tick, POLL_MS)
        }
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
