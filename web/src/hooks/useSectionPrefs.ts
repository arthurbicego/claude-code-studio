import { useCallback, useEffect, useState } from 'react'
import type { SessionSortBy } from '@/types'

export type SectionPrefs = {
  groupByProject: boolean
  sortBy: SessionSortBy
}

const DEFAULTS: SectionPrefs = { groupByProject: true, sortBy: 'lastResponse' }

function storageKey(name: string) {
  return `claude-cli-ui.section.${name}`
}

function load(name: string): SectionPrefs {
  try {
    const raw = localStorage.getItem(storageKey(name))
    if (!raw) return { ...DEFAULTS }
    const parsed = JSON.parse(raw) as Partial<SectionPrefs>
    return {
      groupByProject:
        typeof parsed.groupByProject === 'boolean' ? parsed.groupByProject : DEFAULTS.groupByProject,
      sortBy:
        parsed.sortBy === 'createdAt' || parsed.sortBy === 'lastResponse'
          ? parsed.sortBy
          : DEFAULTS.sortBy,
    }
  } catch {
    return { ...DEFAULTS }
  }
}

export function useSectionPrefs(name: string) {
  const [prefs, setPrefs] = useState<SectionPrefs>(() => load(name))

  useEffect(() => {
    try {
      localStorage.setItem(storageKey(name), JSON.stringify(prefs))
    } catch {
      /* noop */
    }
  }, [name, prefs])

  const toggleGrouping = useCallback(() => {
    setPrefs((p) => ({ ...p, groupByProject: !p.groupByProject }))
  }, [])

  const setSortBy = useCallback((sortBy: SessionSortBy) => {
    setPrefs((p) => ({ ...p, sortBy }))
  }, [])

  return { prefs, toggleGrouping, setSortBy }
}
