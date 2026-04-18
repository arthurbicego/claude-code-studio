import { useCallback, useEffect, useState } from 'react'
import type { BrowseResult } from '@/types'

export function useBrowser(initialPath?: string) {
  const [path, setPath] = useState<string | undefined>(initialPath)
  const [showHidden, setShowHidden] = useState(false)
  const [data, setData] = useState<BrowseResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(
    async (target?: string, hidden?: boolean) => {
      setLoading(true)
      setError(null)
      const params = new URLSearchParams()
      if (target) params.set('path', target)
      if (hidden ?? showHidden) params.set('hidden', '1')
      try {
        const res = await fetch(`/api/browse?${params.toString()}`, { cache: 'no-store' })
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(body.error || `HTTP ${res.status}`)
        }
        const result = (await res.json()) as BrowseResult
        setData(result)
        setPath(result.path)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
    },
    [showHidden],
  )

  useEffect(() => {
    load(initialPath)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggleHidden = useCallback(() => {
    setShowHidden((h) => {
      const next = !h
      load(path, next)
      return next
    })
  }, [load, path])

  return { path, data, error, loading, showHidden, load, toggleHidden }
}
