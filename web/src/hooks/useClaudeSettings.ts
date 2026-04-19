import { useCallback, useEffect, useState } from 'react'
import { ApiErrorException, readApiError } from '@/lib/apiError'
import type { ClaudeSettings, SandboxScope } from '@/types'

type State = {
  settings: ClaudeSettings | null
  loading: boolean
  error: string | null
}

const INITIAL: State = { settings: null, loading: true, error: null }

function buildQuery(scope: SandboxScope, cwd: string | null): string {
  const params = new URLSearchParams({ scope })
  if ((scope === 'project' || scope === 'project-local') && cwd) {
    params.set('cwd', cwd)
  }
  return params.toString()
}

function needsCwd(scope: SandboxScope, cwd: string | null): boolean {
  return (scope === 'project' || scope === 'project-local') && !cwd
}

export function useClaudeSettings(scope: SandboxScope, cwd: string | null) {
  const [state, setState] = useState<State>(INITIAL)

  const load = useCallback(async () => {
    if (needsCwd(scope, cwd)) {
      setState({ settings: null, loading: false, error: null })
      return
    }
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const res = await fetch(`/api/claude-settings?${buildQuery(scope, cwd)}`, {
        cache: 'no-store',
      })
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
  }, [scope, cwd])

  const update = useCallback(
    async (patch: Partial<Pick<ClaudeSettings, 'sandbox'>>) => {
      if (needsCwd(scope, cwd)) {
        throw new Error('Selecione um projeto antes de salvar.')
      }
      const res = await fetch(`/api/claude-settings?${buildQuery(scope, cwd)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) {
        const apiErr = await readApiError(res)
        throw new ApiErrorException(apiErr)
      }
      const data = (await res.json()) as ClaudeSettings
      setState((s) => ({ ...s, settings: data }))
      return data
    },
    [scope, cwd],
  )

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refetch when scope/cwd changes
    load()
  }, [load])

  return { ...state, reload: load, update }
}
