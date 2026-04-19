import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { SessionSortBy } from '@/types'

export type SectionPrefs = {
  groupByProject: boolean
  sortBy: SessionSortBy
}

export type Prefs = {
  sections: Record<string, SectionPrefs>
  expanded: string[]
  projectOrder: string[]
}

type Ctx = {
  prefs: Prefs
  loaded: boolean
  setSection: (name: string, next: SectionPrefs) => void
  setExpanded: (updater: (prev: string[]) => string[]) => void
  setProjectOrder: (updater: (prev: string[]) => string[]) => void
}

const EMPTY_PREFS: Prefs = { sections: {}, expanded: [], projectOrder: [] }
const PrefsContext = createContext<Ctx | null>(null)

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(EMPTY_PREFS)
  const [loaded, setLoaded] = useState(false)
  const lastSavedRef = useRef<string>(JSON.stringify(EMPTY_PREFS))
  const saveTimerRef = useRef<number | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch('/api/prefs')
        if (!r.ok) throw new Error(`status ${r.status}`)
        const data = (await r.json()) as Partial<Prefs>
        const initial: Prefs = {
          sections:
            data.sections && typeof data.sections === 'object'
              ? (data.sections as Record<string, SectionPrefs>)
              : {},
          expanded: Array.isArray(data.expanded) ? data.expanded : [],
          projectOrder: Array.isArray(data.projectOrder) ? data.projectOrder : [],
        }
        if (cancelled) return
        lastSavedRef.current = JSON.stringify(initial)
        setPrefs(initial)
      } catch {
        /* keep defaults */
      } finally {
        if (!cancelled) setLoaded(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!loaded) return
    const serialized = JSON.stringify(prefs)
    if (serialized === lastSavedRef.current) return
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null
      lastSavedRef.current = serialized
      fetch('/api/prefs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: serialized,
      }).catch(() => {
        /* noop — next change will retry */
      })
    }, 400)
    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
    }
  }, [prefs, loaded])

  const setSection = useCallback((name: string, next: SectionPrefs) => {
    setPrefs((p) => ({ ...p, sections: { ...p.sections, [name]: next } }))
  }, [])

  const setExpanded = useCallback((updater: (prev: string[]) => string[]) => {
    setPrefs((p) => {
      const next = updater(p.expanded)
      return next === p.expanded ? p : { ...p, expanded: next }
    })
  }, [])

  const setProjectOrder = useCallback((updater: (prev: string[]) => string[]) => {
    setPrefs((p) => {
      const next = updater(p.projectOrder)
      return next === p.projectOrder ? p : { ...p, projectOrder: next }
    })
  }, [])

  const value = useMemo<Ctx>(
    () => ({ prefs, loaded, setSection, setExpanded, setProjectOrder }),
    [prefs, loaded, setSection, setExpanded, setProjectOrder],
  )

  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>
}

export function usePrefs(): Ctx {
  const ctx = useContext(PrefsContext)
  if (!ctx) throw new Error('usePrefs must be used within a PrefsProvider')
  return ctx
}
