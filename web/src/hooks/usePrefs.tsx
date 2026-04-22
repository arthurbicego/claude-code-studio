import {
  ARCHIVE_RETENTION_MAX_DAYS,
  ARCHIVE_RETENTION_MIN_DAYS,
  type Locale,
  SESSION_SORT_OPTIONS,
  SUPPORTED_LOCALES,
} from '@shared/types'
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { ProjectSortBy, SessionSortBy } from '@/types'

export type SectionPrefs = {
  groupByProject: boolean
  projectSortBy: ProjectSortBy | null
  flatSessionSort: SessionSortBy
}

export type Prefs = {
  sections: Record<string, SectionPrefs>
  expanded: string[]
  projectOrder: string[]
  locale: Locale | null
  sessionSortByProject: Record<string, SessionSortBy>
  autoDeleteArchivedDays: number | null
}

type Ctx = {
  prefs: Prefs
  loaded: boolean
  setSection: (name: string, next: SectionPrefs) => void
  removeSection: (name: string) => void
  setExpanded: (updater: (prev: string[]) => string[]) => void
  setProjectOrder: (updater: (prev: string[]) => string[]) => void
  setLocale: (locale: Locale) => void
  setSessionSortForProject: (slug: string, next: SessionSortBy | null) => void
  setAutoDeleteArchivedDays: (next: number | null) => void
}

const EMPTY_PREFS: Prefs = {
  sections: {},
  expanded: [],
  projectOrder: [],
  locale: null,
  sessionSortByProject: {},
  autoDeleteArchivedDays: null,
}

function sanitizeAutoDeleteDays(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const n = Math.trunc(value)
  if (n < ARCHIVE_RETENTION_MIN_DAYS || n > ARCHIVE_RETENTION_MAX_DAYS) return null
  return n
}
const PrefsContext = createContext<Ctx | null>(null)

function sanitizeSessionSortByProject(raw: unknown): Record<string, SessionSortBy> {
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, SessionSortBy> = {}
  for (const [slug, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string' && (SESSION_SORT_OPTIONS as string[]).includes(value)) {
      out[slug] = value as SessionSortBy
    }
  }
  return out
}

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
          locale:
            typeof data.locale === 'string' && (SUPPORTED_LOCALES as string[]).includes(data.locale)
              ? (data.locale as Locale)
              : null,
          sessionSortByProject: sanitizeSessionSortByProject(data.sessionSortByProject),
          autoDeleteArchivedDays: sanitizeAutoDeleteDays(data.autoDeleteArchivedDays),
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

  const removeSection = useCallback((name: string) => {
    setPrefs((p) => {
      if (!(name in p.sections)) return p
      const nextSections = { ...p.sections }
      delete nextSections[name]
      return { ...p, sections: nextSections }
    })
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

  const setLocale = useCallback((locale: Locale) => {
    setPrefs((p) => (p.locale === locale ? p : { ...p, locale }))
  }, [])

  const setSessionSortForProject = useCallback((slug: string, next: SessionSortBy | null) => {
    setPrefs((p) => {
      const current = p.sessionSortByProject[slug] ?? null
      if (current === next) return p
      const map = { ...p.sessionSortByProject }
      if (next === null) delete map[slug]
      else map[slug] = next
      return { ...p, sessionSortByProject: map }
    })
  }, [])

  const setAutoDeleteArchivedDays = useCallback((next: number | null) => {
    const sanitized = sanitizeAutoDeleteDays(next)
    setPrefs((p) =>
      p.autoDeleteArchivedDays === sanitized ? p : { ...p, autoDeleteArchivedDays: sanitized },
    )
  }, [])

  const value = useMemo<Ctx>(
    () => ({
      prefs,
      loaded,
      setSection,
      removeSection,
      setExpanded,
      setProjectOrder,
      setLocale,
      setSessionSortForProject,
      setAutoDeleteArchivedDays,
    }),
    [
      prefs,
      loaded,
      setSection,
      removeSection,
      setExpanded,
      setProjectOrder,
      setLocale,
      setSessionSortForProject,
      setAutoDeleteArchivedDays,
    ],
  )

  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>
}

export function usePrefs(): Ctx {
  const ctx = useContext(PrefsContext)
  if (!ctx) throw new Error('usePrefs must be used within a PrefsProvider')
  return ctx
}
