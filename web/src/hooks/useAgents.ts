import { useCallback, useEffect, useState } from 'react'

export type AgentSummary = {
  name: string
  description: string
  path: string
  mtime: number
}

export type AgentDetail = {
  name: string
  path: string
  description: string
  model: string
  tools: string[]
  body: string
  raw: string
}

export type AgentScope = 'user' | 'project'

type ListState = {
  user: AgentSummary[]
  project: AgentSummary[]
  loading: boolean
  error: string | null
}

const INITIAL_LIST: ListState = { user: [], project: [], loading: false, error: null }

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return (await res.json()) as T
}

export function useAgentList(projectCwd: string | null) {
  const [state, setState] = useState<ListState>(INITIAL_LIST)

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const url = projectCwd
        ? `/api/agents?cwd=${encodeURIComponent(projectCwd)}`
        : '/api/agents'
      const data = await fetchJson<{ user: AgentSummary[]; project: AgentSummary[] }>(url, { cache: 'no-store' })
      setState({ user: data.user, project: data.project, loading: false, error: null })
    } catch (err) {
      setState({
        user: [],
        project: [],
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }, [projectCwd])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    load()
  }, [load])

  return { ...state, reload: load }
}

export async function fetchAgent(scope: AgentScope, name: string, projectCwd: string | null): Promise<AgentDetail> {
  const params = new URLSearchParams({ scope, name })
  if (scope === 'project' && projectCwd) params.set('cwd', projectCwd)
  return fetchJson<AgentDetail>(`/api/agents/file?${params.toString()}`, { cache: 'no-store' })
}

export type AgentSavePayload = {
  scope: AgentScope
  cwd: string | null
  name: string
  description: string
  model: string
  tools: string[]
  body: string
  previousName?: string | null
}

export async function saveAgent(payload: AgentSavePayload): Promise<AgentDetail> {
  return fetchJson<AgentDetail>('/api/agents/file', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      scope: payload.scope,
      cwd: payload.cwd ?? undefined,
      name: payload.name,
      description: payload.description,
      model: payload.model,
      tools: payload.tools,
      body: payload.body,
      previousName: payload.previousName ?? undefined,
    }),
  })
}

export async function deleteAgent(scope: AgentScope, name: string, projectCwd: string | null): Promise<void> {
  const params = new URLSearchParams({ scope, name })
  if (scope === 'project' && projectCwd) params.set('cwd', projectCwd)
  await fetchJson(`/api/agents/file?${params.toString()}`, { method: 'DELETE' })
}

export function useKnownTools() {
  const [tools, setTools] = useState<string[]>([])
  useEffect(() => {
    let cancelled = false
    fetchJson<{ tools: string[] }>('/api/known-tools', { cache: 'force-cache' })
      .then((data) => { if (!cancelled) setTools(data.tools) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])
  return tools
}
