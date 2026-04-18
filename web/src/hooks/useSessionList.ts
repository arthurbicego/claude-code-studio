import { useCallback, useEffect, useState } from 'react'
import type { Project } from '@/types'

type State = {
  projects: Project[]
  loading: boolean
  error: string | null
  refreshedAt: number | null
}

export function useSessionList() {
  const [state, setState] = useState<State>({
    projects: [],
    loading: true,
    error: null,
    refreshedAt: null,
  })

  const refresh = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const res = await fetch('/api/sessions', { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as { projects: Project[] }
      setState({
        projects: data.projects,
        loading: false,
        error: null,
        refreshedAt: Date.now(),
      })
    } catch (err) {
      setState((s) => ({
        ...s,
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      }))
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { ...state, refresh }
}
