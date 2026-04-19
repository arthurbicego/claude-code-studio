import { useCallback } from 'react'
import { usePrefs } from '@/hooks/usePrefs'

export function useProjectOrder() {
  const { prefs, setProjectOrder } = usePrefs()
  const order = prefs.projectOrder

  const applyOrder = useCallback(
    <T extends { slug: string }>(items: T[]): T[] => {
      const map = new Map(items.map((it) => [it.slug, it]))
      const out: T[] = []
      const seen = new Set<string>()
      for (const slug of order) {
        const it = map.get(slug)
        if (it && !seen.has(slug)) {
          out.push(it)
          seen.add(slug)
        }
      }
      for (const it of items) {
        if (!seen.has(it.slug)) {
          out.push(it)
          seen.add(it.slug)
        }
      }
      return out
    },
    [order],
  )

  const moveSlug = useCallback(
    (from: string, to: string, position: 'before' | 'after' = 'before') => {
      if (!from || !to || from === to) return
      setProjectOrder((prev) => {
        const list = [...prev]
        if (!list.includes(from)) list.push(from)
        if (!list.includes(to)) list.push(to)
        const fi = list.indexOf(from)
        if (fi === -1) return prev
        list.splice(fi, 1)
        const ti = list.indexOf(to)
        if (ti === -1) return prev
        const insertAt = position === 'before' ? ti : ti + 1
        list.splice(insertAt, 0, from)
        return list
      })
    },
    [setProjectOrder],
  )

  return { applyOrder, moveSlug }
}
