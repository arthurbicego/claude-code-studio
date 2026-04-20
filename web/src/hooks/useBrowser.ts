import { useCallback, useEffect, useState } from 'react'
import { ApiErrorException, readApiError } from '@/lib/apiError'
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
          const apiErr = await readApiError(res)
          throw new ApiErrorException(apiErr)
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: run once on mount with the initial path; `load` identity would cause a reload loop
  useEffect(() => {
    load(initialPath)
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
