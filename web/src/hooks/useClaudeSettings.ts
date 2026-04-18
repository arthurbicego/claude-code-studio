import { useCallback, useEffect, useState } from 'react'
import type { ClaudeSettings } from '@/types'

type State = {
  settings: ClaudeSettings | null
  loading: boolean
  error: string | null
}

const INITIAL: State = { settings: null, loading: true, error: null }

export function useClaudeSettings() {
  const [state, setState] = useState<State>(INITIAL)

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const res = await fetch('/api/claude-settings', { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as ClaudeSettings
      setState({ settings: data, loading: false, error: null })
    } catch (err) {
      setState((s) => ({
        ...s,
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      }))
    }
  }, [])

  const update = useCallback(async (patch: Partial<ClaudeSettings>) => {
    const res = await fetch('/api/claude-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string }
      throw new Error(err.error || `HTTP ${res.status}`)
    }
    const data = (await res.json()) as ClaudeSettings
    setState((s) => ({ ...s, settings: data }))
    return data
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return { ...state, reload: load, update }
}
