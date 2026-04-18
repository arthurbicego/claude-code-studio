import { useCallback, useEffect, useRef, useState } from 'react'

export type MemoryFile = {
  path: string
  exists: boolean
  content: string
  mtime: number | null
  variant?: 'shared' | 'local'
}

export type MemoryVariant = 'shared' | 'local'

export type MemoryHierarchyEntry = {
  scope: 'global' | 'ancestor' | 'project'
  variant: MemoryVariant
  dir: string
  path: string
  exists: boolean
  mtime: number | null
  size: number
}

export type ExpandedImport = {
  raw: string
  resolved: string | null
  basePath: string
  depth: number
  exists: boolean
  error: string | null
}

export type ExpandResult = {
  basePath: string
  expanded: string
  imports: ExpandedImport[]
  truncated: boolean
}

type State = {
  data: MemoryFile | null
  loading: boolean
  error: string | null
}

const INITIAL: State = { data: null, loading: false, error: null }

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return (await res.json()) as T
}

export function useGlobalMemory() {
  const [state, setState] = useState<State>(INITIAL)

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const data = await fetchJson<MemoryFile>('/api/memory/global', { cache: 'no-store' })
      setState({ data, loading: false, error: null })
    } catch (err) {
      setState({ data: null, loading: false, error: err instanceof Error ? err.message : String(err) })
    }
  }, [])

  const save = useCallback(async (content: string) => {
    const data = await fetchJson<MemoryFile>('/api/memory/global', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    })
    setState((s) => ({ ...s, data }))
    return data
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch on mount
    load()
  }, [load])

  return { ...state, reload: load, save }
}

export function useProjectMemory(cwd: string | null, variant: MemoryVariant = 'shared') {
  const [state, setState] = useState<State>(INITIAL)
  const reqId = useRef(0)

  const load = useCallback(async (target: string, v: MemoryVariant) => {
    const id = ++reqId.current
    setState({ data: null, loading: true, error: null })
    try {
      const data = await fetchJson<MemoryFile>(
        `/api/memory/project?cwd=${encodeURIComponent(target)}&variant=${v}`,
        { cache: 'no-store' },
      )
      if (reqId.current !== id) return
      setState({ data, loading: false, error: null })
    } catch (err) {
      if (reqId.current !== id) return
      setState({ data: null, loading: false, error: err instanceof Error ? err.message : String(err) })
    }
  }, [])

  useEffect(() => {
    if (!cwd) {
      reqId.current++
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear when no project selected
      setState(INITIAL)
      return
    }
    load(cwd, variant)
  }, [cwd, variant, load])

  const save = useCallback(async (content: string) => {
    if (!cwd) throw new Error('Nenhum projeto selecionado.')
    const data = await fetchJson<MemoryFile>('/api/memory/project', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cwd, content, variant }),
    })
    setState((s) => ({ ...s, data }))
    return data
  }, [cwd, variant])

  return {
    ...state,
    reload: () => (cwd ? load(cwd, variant) : Promise.resolve()),
    save,
  }
}

export function useMemoryHierarchy(cwd: string | null) {
  const [entries, setEntries] = useState<MemoryHierarchyEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const reqId = useRef(0)

  const load = useCallback(async (target: string) => {
    const id = ++reqId.current
    setLoading(true)
    setError(null)
    try {
      const data = await fetchJson<{ entries: MemoryHierarchyEntry[] }>(
        `/api/memory/hierarchy?cwd=${encodeURIComponent(target)}`,
        { cache: 'no-store' },
      )
      if (reqId.current !== id) return
      setEntries(data.entries)
      setLoading(false)
    } catch (err) {
      if (reqId.current !== id) return
      setEntries([])
      setError(err instanceof Error ? err.message : String(err))
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!cwd) {
      reqId.current++
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear when no project selected
      setEntries([])
      setError(null)
      setLoading(false)
      return
    }
    load(cwd)
  }, [cwd, load])

  return { entries, loading, error, reload: () => (cwd ? load(cwd) : Promise.resolve()) }
}

export async function expandMemoryImports(content: string, basePath: string): Promise<ExpandResult> {
  return fetchJson<ExpandResult>('/api/memory/expand', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, basePath }),
  })
}
