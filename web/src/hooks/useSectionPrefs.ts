import { useCallback } from 'react'
import { type SectionPrefs, usePrefs } from '@/hooks/usePrefs'
import type { SessionSortBy } from '@/types'

const DEFAULTS: SectionPrefs = { groupByProject: true, sortBy: 'lastResponse' }

export type { SectionPrefs }

export function useSectionPrefs(name: string) {
  const { prefs, setSection } = usePrefs()
  const current = prefs.sections[name] ?? DEFAULTS

  const toggleGrouping = useCallback(() => {
    setSection(name, { ...current, groupByProject: !current.groupByProject })
  }, [name, current, setSection])

  const setSortBy = useCallback(
    (sortBy: SessionSortBy) => {
      setSection(name, { ...current, sortBy })
    },
    [name, current, setSection],
  )

  return { prefs: current, toggleGrouping, setSortBy }
}
