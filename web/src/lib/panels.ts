import type { OpenPanel, PanelKind } from '@/types'

export const PANEL_LABELS: Record<PanelKind, string> = {
  diff: 'Diff',
  terminal: 'Terminal',
  tasks: 'Tasks',
  plan: 'Plan',
  worktrees: 'Worktrees',
}

export const MAX_PER_COLUMN = 2

export function layoutColumns(panels: OpenPanel[]): OpenPanel[][] {
  const columns: OpenPanel[][] = []
  for (const panel of panels) {
    const last = columns[columns.length - 1]
    if (!last || last.length >= MAX_PER_COLUMN) {
      columns.push([panel])
    } else {
      last.push(panel)
    }
  }
  return columns
}
