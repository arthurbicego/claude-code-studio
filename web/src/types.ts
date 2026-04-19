export type SessionMeta = {
  id: string
  mtime: number
  createdAt: number
  size: number
  preview: string | null
  archived: boolean
}

export type SessionSortBy = 'lastResponse' | 'createdAt'

export type Project = {
  slug: string
  cwd: string
  cwdResolved: boolean
  sessions: SessionMeta[]
}

export type SessionDefaults = {
  model: string | null
  effort: string | null
  permissionMode: string
}

export type BrowseEntry = { name: string }

export type BrowseResult = {
  path: string
  parent: string | null
  home: string
  entries: BrowseEntry[]
}

export type PermissionMode =
  | 'default'
  | 'acceptEdits'
  | 'plan'
  | 'auto'
  | 'dontAsk'
  | 'bypassPermissions'

export type Model = 'opus' | 'sonnet' | 'haiku'

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export type SessionLaunch = {
  sessionKey: string
  cwd: string
  resume?: string
  label?: string
  model?: Model
  effort?: Effort
  permissionMode?: PermissionMode
}

export type LiveSessionState = 'ativo' | 'aguardando' | 'standby' | 'finalizado'

export type LiveSession = {
  sessionKey: string
  state: LiveSessionState
  cwd: string
  lastOutputAt: number
  idleSince: number | null
}

export type LiveSessionsSnapshot = {
  at: number
  sessions: LiveSession[]
}

export type AppConfig = {
  standbyTimeoutMs: number
}

export type AppConfigBounds = {
  standbyTimeoutMs: { min: number; max: number }
}

export type AppConfigResponse = {
  config: AppConfig
  defaults: AppConfig
  bounds: AppConfigBounds
}

export type SandboxPlatform = 'macos' | 'linux'

export type SandboxSettings = {
  enabled: boolean
  failIfUnavailable: boolean
  autoAllowBashIfSandboxed: boolean
  ignoreViolations: boolean
  enableWeakerNestedSandbox: boolean
  enableWeakerNetworkIsolation: boolean
  allowUnsandboxedCommands: string[]
  excludedCommands: string[]
  enabledPlatforms: SandboxPlatform[]
  network: Record<string, unknown> | null
  filesystem: Record<string, unknown> | null
  ripgrep: Record<string, unknown> | null
  seccomp: Record<string, unknown> | null
}

export type ClaudeSettings = {
  sandbox: SandboxSettings
}

export type PanelKind = 'diff' | 'terminal' | 'tasks' | 'plan'

export type OpenPanel = {
  kind: PanelKind
  id: string
}

export type DiffResult = {
  cwd: string | null
  branch: string | null
  unstaged: string
  staged: string
  untracked: string[]
}

export type TodoItem = {
  content: string
  activeForm?: string
  status: 'pending' | 'in_progress' | 'completed'
}

export type TasksResult = {
  todos: TodoItem[]
  updatedAt: string | null
}

export type PlanResult = {
  plan: string | null
  updatedAt: string | null
}

export type SessionFooter = {
  hasCache: boolean
  cwd: string | null
  dirLabel: string | null
  branch: string | null
  dirty: boolean
  model: string | null
  contextPct: number | null
  exceeds200k: boolean
  linesAdded: number | null
  linesRemoved: number | null
  costUsd: number | null
  fiveHourPct: number | null
  fiveHourResetsAt: number | null
  sevenDayPct: number | null
  sevenDayResetsAt: number | null
  cacheUpdatedAt: number | null
  globalUpdatedAt: number | null
}
