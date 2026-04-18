import { useCallback, useEffect, useState } from 'react'

const KEY = 'claude-cli-ui.collapsed'

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

export function useCollapsed() {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => load())

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify([...collapsed]))
    } catch {
      /* quota/private mode */
    }
  }, [collapsed])

  const toggle = useCallback((slug: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      return next
    })
  }, [])

  const isCollapsed = useCallback((slug: string) => collapsed.has(slug), [collapsed])

  return { collapsed, toggle, isCollapsed }
}
