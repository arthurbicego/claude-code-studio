import { describe, expect, it } from 'vitest'
import type { OpenPanel } from '@/types'
import { layoutColumns, MAX_PER_COLUMN } from './panels'

const panel = (kind: OpenPanel['kind'], id: string): OpenPanel => ({ kind, id })

describe('layoutColumns', () => {
  it('returns an empty array for no panels', () => {
    expect(layoutColumns([])).toEqual([])
  })

  it('puts a single panel in one column', () => {
    const p = panel('diff', 'd1')
    expect(layoutColumns([p])).toEqual([[p]])
  })

  it('fills a column up to MAX_PER_COLUMN before starting a new one', () => {
    const items = Array.from({ length: MAX_PER_COLUMN }, (_, i) => panel('tasks', `t${i}`))
    const result = layoutColumns(items)
    expect(result).toHaveLength(1)
    expect(result[0]).toHaveLength(MAX_PER_COLUMN)
  })

  it('opens a new column once the previous one is full', () => {
    const items = Array.from({ length: MAX_PER_COLUMN + 1 }, (_, i) => panel('tasks', `t${i}`))
    const result = layoutColumns(items)
    expect(result).toHaveLength(2)
    expect(result[0]).toHaveLength(MAX_PER_COLUMN)
    expect(result[1]).toHaveLength(1)
  })

  it('preserves input order across columns', () => {
    const items = [
      panel('diff', 'a'),
      panel('tasks', 'b'),
      panel('plan', 'c'),
      panel('worktrees', 'd'),
    ]
    const result = layoutColumns(items)
    expect(result.flat()).toEqual(items)
  })
})
