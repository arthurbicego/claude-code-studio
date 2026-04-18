import { useEffect, useState } from 'react'
import type { SessionDefaults } from '@/types'

const FALLBACK: SessionDefaults = {
  model: null,
  effort: null,
  permissionMode: 'default',
}

export function useSessionDefaults() {
  const [defaults, setDefaults] = useState<SessionDefaults>(FALLBACK)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/defaults', { cache: 'no-store' })
      .then((r) => r.json() as Promise<SessionDefaults>)
      .then((d) => {
        if (cancelled) return
        setDefaults({ ...FALLBACK, ...d })
        setLoaded(true)
      })
      .catch(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { defaults, loaded }
}
