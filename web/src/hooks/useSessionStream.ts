import { useEffect, useRef } from 'react'
import type { LiveSessionsSnapshot } from '@/types'

type Handlers = {
  onInvalidate?: () => void
  onActivity?: (snapshot: LiveSessionsSnapshot) => void
}

export function useSessionStream({ onInvalidate, onActivity }: Handlers) {
  const invalidateRef = useRef(onInvalidate)
  const activityRef = useRef(onActivity)
  invalidateRef.current = onInvalidate
  activityRef.current = onActivity

  useEffect(() => {
    const es = new EventSource('/api/sessions/stream')
    es.addEventListener('invalidate', () => invalidateRef.current?.())
    es.addEventListener('activity', (ev) => {
      try {
        const snap = JSON.parse((ev as MessageEvent).data) as LiveSessionsSnapshot
        activityRef.current?.(snap)
      } catch {
        /* noop */
      }
    })
    es.addEventListener('hello', () => {})
    es.onerror = () => {
      /* EventSource reconecta automaticamente */
    }
    return () => {
      es.close()
    }
  }, [])
}
