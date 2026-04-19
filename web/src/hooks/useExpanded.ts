import { useCallback, useMemo } from 'react'
import { usePrefs } from '@/hooks/usePrefs'

export function useExpanded() {
  const { prefs, setExpanded } = usePrefs()
  const expanded = useMemo(() => new Set(prefs.expanded), [prefs.expanded])

  const toggle = useCallback(
    (slug: string) => {
      setExpanded((prev) =>
        prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
      )
    },
    [setExpanded],
  )

  const isExpanded = useCallback((slug: string) => expanded.has(slug), [expanded])

  return { expanded, toggle, isExpanded }
}
