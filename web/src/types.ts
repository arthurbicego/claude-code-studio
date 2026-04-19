export * from '@shared/types'

// UI-only types (not part of the server/client contract)

export type PanelKind = 'diff' | 'terminal' | 'tasks' | 'plan' | 'worktrees'

export type OpenPanel = {
  kind: PanelKind
  id: string
}
