import { useCallback, useMemo } from 'react'
import { type SectionPrefs, usePrefs } from '@/hooks/usePrefs'
import type { ProjectSortBy, SessionSortBy } from '@/types'

const DEFAULTS: SectionPrefs = {
  groupByProject: true,
  projectSortBy: null,
  flatSessionSort: 'lastResponse',
}

export type { SectionPrefs }

export function useSectionPrefs(name: string) {
  const { prefs, setSection } = usePrefs()
  const stored = prefs.sections[name]
  const current = useMemo<SectionPrefs>(() => ({ ...DEFAULTS, ...stored }), [stored])

  const toggleGrouping = useCallback(() => {
    setSection(name, { ...current, groupByProject: !current.groupByProject })
  }, [name, current, setSection])

  const setProjectSortBy = useCallback(
    (projectSortBy: ProjectSortBy | null) => {
      setSection(name, { ...current, projectSortBy })
    },
    [name, current, setSection],
  )

  const setFlatSessionSort = useCallback(
    (flatSessionSort: SessionSortBy) => {
      setSection(name, { ...current, flatSessionSort })
    },
    [name, current, setSection],
  )

  return { prefs: current, toggleGrouping, setProjectSortBy, setFlatSessionSort }
}
