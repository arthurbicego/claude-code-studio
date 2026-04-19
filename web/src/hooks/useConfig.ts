import { useCallback, useEffect, useState } from 'react'
import { ApiErrorException, readApiError } from '@/lib/apiError'
import type { AppConfig, AppConfigBounds, AppConfigResponse } from '@/types'

type State = {
  config: AppConfig | null
  defaults: AppConfig | null
  bounds: AppConfigBounds | null
  loading: boolean
  error: string | null
}

const INITIAL: State = {
  config: null,
  defaults: null,
  bounds: null,
  loading: true,
  error: null,
}

export function useConfig() {
  const [state, setState] = useState<State>(INITIAL)

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const res = await fetch('/api/config', { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as AppConfigResponse
      setState({
        config: data.config,
        defaults: data.defaults,
        bounds: data.bounds,
        loading: false,
        error: null,
      })
    } catch (err) {
      setState((s) => ({
        ...s,
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      }))
    }
  }, [])

  const update = useCallback(async (patch: Partial<AppConfig>) => {
    const res = await fetch('/api/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (!res.ok) {
      const apiErr = await readApiError(res)
      throw new ApiErrorException(apiErr)
    }
    const data = (await res.json()) as { config: AppConfig }
    setState((s) => ({ ...s, config: data.config }))
    return data.config
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return { ...state, reload: load, update }
}
