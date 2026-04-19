import { useCallback, useEffect, useState } from 'react'

export type SkillSummary = {
  name: string
  description: string
  path: string
  dir: string
  mtime: number
}

export type SkillExtra = {
  relativePath: string
  size: number
}

export type SkillDetail = {
  name: string
  path: string
  dir: string
  description: string
  body: string
  raw: string
  extras: SkillExtra[]
}

export type SkillScope = 'user' | 'project'

type ListState = {
  user: SkillSummary[]
  project: SkillSummary[]
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

export function useSkillList(projectCwd: string | null) {
  const [state, setState] = useState<ListState>(INITIAL_LIST)

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const url = projectCwd ? `/api/skills?cwd=${encodeURIComponent(projectCwd)}` : '/api/skills'
      const data = await fetchJson<{ user: SkillSummary[]; project: SkillSummary[] }>(url, {
        cache: 'no-store',
      })
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

export async function fetchSkill(
  scope: SkillScope,
  name: string,
  projectCwd: string | null,
): Promise<SkillDetail> {
  const params = new URLSearchParams({ scope, name })
  if (scope === 'project' && projectCwd) params.set('cwd', projectCwd)
  return fetchJson<SkillDetail>(`/api/skills/file?${params.toString()}`, { cache: 'no-store' })
}

export type SkillSavePayload = {
  scope: SkillScope
  cwd: string | null
  name: string
  description: string
  body: string
  previousName?: string | null
}

export async function saveSkill(payload: SkillSavePayload): Promise<SkillDetail> {
  return fetchJson<SkillDetail>('/api/skills/file', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      scope: payload.scope,
      cwd: payload.cwd ?? undefined,
      name: payload.name,
      description: payload.description,
      body: payload.body,
      previousName: payload.previousName ?? undefined,
    }),
  })
}

export async function deleteSkill(
  scope: SkillScope,
  name: string,
  projectCwd: string | null,
): Promise<void> {
  const params = new URLSearchParams({ scope, name })
  if (scope === 'project' && projectCwd) params.set('cwd', projectCwd)
  await fetchJson(`/api/skills/file?${params.toString()}`, { method: 'DELETE' })
}
