import { useCallback } from 'react'
import { type SectionPrefs, usePrefs } from '@/hooks/usePrefs'
import type { ProjectSortBy } from '@/types'

const DEFAULTS: SectionPrefs = { groupByProject: true, projectSortBy: null }

export type { SectionPrefs }

export function useSectionPrefs(name: string) {
  const { prefs, setSection } = usePrefs()
  const current = prefs.sections[name] ?? DEFAULTS

  const toggleGrouping = useCallback(() => {
    setSection(name, { ...current, groupByProject: !current.groupByProject })
  }, [name, current, setSection])

  const setProjectSortBy = useCallback(
    (projectSortBy: ProjectSortBy | null) => {
      setSection(name, { ...current, projectSortBy })
    },
    [name, current, setSection],
  )

  return { prefs: current, toggleGrouping, setProjectSortBy }
}
