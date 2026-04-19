import { useCallback, useEffect, useState } from 'react'

const KEY = 'claude-code-studio.expanded'

function load(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed)) return new Set(parsed.filter((x): x is string => typeof x === 'string'))
    return new Set()
  } catch {
    return new Set()
  }
}

export function useExpanded() {
  const [expanded, setExpanded] = useState<Set<string>>(() => load())

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify([...expanded]))
    } catch {
      /* quota/private mode */
    }
  }, [expanded])

  const toggle = useCallback((slug: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      return next
    })
  }, [])

  const isExpanded = useCallback((slug: string) => expanded.has(slug), [expanded])

  return { expanded, toggle, isExpanded }
}
