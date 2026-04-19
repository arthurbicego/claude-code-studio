import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export type SaveState = {
  status: SaveStatus
  lastSavedAt: number | null
  error: string | null
}

type Ctx = {
  state: SaveState
  setSaving: () => void
  setSaved: () => void
  setError: (message: string) => void
  reset: () => void
}

const INITIAL: SaveState = { status: 'idle', lastSavedAt: null, error: null }

const SaveStatusContext = createContext<Ctx | null>(null)

export function SaveStatusProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SaveState>(INITIAL)

  const setSaving = useCallback(() => {
    setState((prev) => ({ ...prev, status: 'saving', error: null }))
  }, [])

  const setSaved = useCallback(() => {
    setState({ status: 'saved', lastSavedAt: Date.now(), error: null })
  }, [])

  const setError = useCallback((message: string) => {
    setState((prev) => ({ ...prev, status: 'error', error: message }))
  }, [])

  const reset = useCallback(() => setState(INITIAL), [])

  const value = useMemo(
    () => ({ state, setSaving, setSaved, setError, reset }),
    [state, setSaving, setSaved, setError, reset],
  )

  return <SaveStatusContext.Provider value={value}>{children}</SaveStatusContext.Provider>
}

export function useSaveStatus(): Ctx {
  const ctx = useContext(SaveStatusContext)
  if (!ctx) throw new Error('useSaveStatus must be used within a SaveStatusProvider')
  return ctx
}
