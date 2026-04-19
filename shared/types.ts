// API contract types shared between the server and the web client.
// UI-only types (panel kinds, etc.) stay in web/src/types.ts.

export type SessionMeta = {
  id: string;
  mtime: number;
  createdAt: number;
  size: number;
  preview: string | null;
  archived: boolean;
};

export type SessionSortBy = 'lastResponse' | 'createdAt';

export type Project = {
  slug: string;
  cwd: string;
  cwdResolved: boolean;
  sessions: SessionMeta[];
};

export type SessionsListResponse = {
  projects: Project[];
};

export type SessionDefaults = {
  model: string | null;
  effort: string | null;
  permissionMode: string;
};

export type BrowseEntry = { name: string };

export type BrowseResult = {
  path: string;
  parent: string | null;
  home: string;
  entries: BrowseEntry[];
};

export type PermissionMode =
  | 'default'
  | 'acceptEdits'
  | 'plan'
  | 'auto'
  | 'dontAsk'
  | 'bypassPermissions';

export type Model = 'opus' | 'sonnet' | 'haiku';

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export type SessionLaunch = {
  sessionKey: string;
  cwd: string;
  resume?: string;
  label?: string;
  model?: Model;
  effort?: Effort;
  permissionMode?: PermissionMode;
  worktree?: string;
};

export type LiveSessionState = 'ativo' | 'aguardando' | 'standby' | 'finalizado';

export type LiveSession = {
  sessionKey: string;
  state: LiveSessionState;
  cwd: string;
  lastOutputAt: number;
  idleSince: number | null;
};

export type LiveSessionsSnapshot = {
  at: number;
  sessions: LiveSession[];
};

export type AppConfig = {
  standbyTimeoutMs: number;
};

export type AppConfigBounds = {
  standbyTimeoutMs: { min: number; max: number };
};

export type AppConfigResponse = {
  config: AppConfig;
  defaults: AppConfig;
  bounds: AppConfigBounds;
};

export type SandboxScope = 'user' | 'user-local' | 'project' | 'project-local';

export type SandboxPlatform = 'macos' | 'linux';

export type SandboxSettings = {
  enabled: boolean;
  failIfUnavailable: boolean;
  autoAllowBashIfSandboxed: boolean;
  ignoreViolations: boolean;
  enableWeakerNestedSandbox: boolean;
  enableWeakerNetworkIsolation: boolean;
  allowUnsandboxedCommands: string[];
  excludedCommands: string[];
  enabledPlatforms: SandboxPlatform[];
  network: Record<string, unknown> | null;
  filesystem: Record<string, unknown> | null;
  ripgrep: Record<string, unknown> | null;
  seccomp: Record<string, unknown> | null;
};

export type ClaudeSettings = {
  scope: SandboxScope;
  path: string;
  sandbox: SandboxSettings;
};

export type DiffResult = {
  cwd: string | null;
  branch: string | null;
  unstaged: string;
  staged: string;
  untracked: string[];
};

export type TodoItem = {
  content: string;
  activeForm?: string;
  status: 'pending' | 'in_progress' | 'completed';
};

export type TasksResult = {
  todos: TodoItem[];
  updatedAt: string | null;
};

export type PlanResult = {
  plan: string | null;
  updatedAt: string | null;
};

export type WorktreeRef = {
  path: string;
  name: string;
};

export type SessionFooter = {
  hasCache: boolean;
  cwd: string | null;
  dirLabel: string | null;
  branch: string | null;
  dirty: boolean;
  model: string | null;
  contextPct: number | null;
  exceeds200k: boolean;
  linesAdded: number | null;
  linesRemoved: number | null;
  costUsd: number | null;
  fiveHourPct: number | null;
  fiveHourResetsAt: number | null;
  sevenDayPct: number | null;
  sevenDayResetsAt: number | null;
  cacheUpdatedAt: number | null;
  globalUpdatedAt: number | null;
  worktree: WorktreeRef | null;
};

export type Worktree = {
  path: string;
  branch: string | null;
  head: string | null;
  detached: boolean;
  prunable: boolean;
  isMain: boolean;
  clean: boolean;
  modifiedCount: number;
  ahead: number;
  behind: number;
  linesAdded: number;
  linesRemoved: number;
  liveSessionCount: number;
  mtime: number | null;
};

export type WorktreesResult = {
  cwd: string;
  base: string | null;
  mainPath: string | null;
  worktrees: Worktree[];
};

export type WorktreeDiffResult = {
  cwd: string;
  branch: string | null;
  base: string | null;
  committed: string;
  unstaged: string;
  staged: string;
  untracked: string[];
};

export type SectionPrefs = {
  groupByProject: boolean;
  sortBy: SessionSortBy;
};

export type Locale = 'pt-BR' | 'en-US' | 'es-ES';

export const SUPPORTED_LOCALES: Locale[] = ['pt-BR', 'en-US', 'es-ES'];

/**
 * Standard JSON shape for API errors. Inspired by Stripe / Google Cloud.
 * `code` is stable and machine-readable; `message` is an English fallback.
 * `params` carries values for client-side i18n interpolation.
 */
export type ApiError = {
  code: string;
  message: string;
  params?: Record<string, unknown>;
};

/** Stable error codes emitted by the backend. UPPER_SNAKE_CASE, never renamed once published. */
export const API_ERROR_CODES = {
  // Generic
  INTERNAL: 'INTERNAL',
  INVALID_REQUEST: 'INVALID_REQUEST',
  // Sessions
  SESSION_ID_REQUIRED: 'SESSION_ID_REQUIRED',
  SESSION_ID_INVALID: 'SESSION_ID_INVALID',
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  SESSION_NOT_LIVE: 'SESSION_NOT_LIVE',
  // Filesystem / browse
  PATH_INVALID: 'PATH_INVALID',
  PATH_NOT_DIRECTORY: 'PATH_NOT_DIRECTORY',
  PATH_NOT_FOUND: 'PATH_NOT_FOUND',
  // Agents / skills
  SCOPE_INVALID: 'SCOPE_INVALID',
  NAME_INVALID: 'NAME_INVALID',
  DESCRIPTION_REQUIRED: 'DESCRIPTION_REQUIRED',
  AGENT_NOT_FOUND: 'AGENT_NOT_FOUND',
  AGENT_ALREADY_EXISTS: 'AGENT_ALREADY_EXISTS',
  SKILL_NOT_FOUND: 'SKILL_NOT_FOUND',
  SKILL_ALREADY_EXISTS: 'SKILL_ALREADY_EXISTS',
  // Memory
  CONTENT_REQUIRED: 'CONTENT_REQUIRED',
  CWD_INVALID: 'CWD_INVALID',
  CWD_NOT_FOUND: 'CWD_NOT_FOUND',
  BASE_PATH_OUTSIDE_HOME: 'BASE_PATH_OUTSIDE_HOME',
  // Sandbox / config
  CONFIG_INVALID: 'CONFIG_INVALID',
  SANDBOX_FIELD_NOT_OBJECT: 'SANDBOX_FIELD_NOT_OBJECT',
  SANDBOX_PLATFORMS_NOT_ARRAY: 'SANDBOX_PLATFORMS_NOT_ARRAY',
  SANDBOX_PLATFORM_INVALID: 'SANDBOX_PLATFORM_INVALID',
  // Worktrees
  WORKTREE_PATH_INVALID: 'WORKTREE_PATH_INVALID',
  WORKTREE_PATH_OUTSIDE_CWD: 'WORKTREE_PATH_OUTSIDE_CWD',
  WORKTREE_MAIN_REMOVE_FORBIDDEN: 'WORKTREE_MAIN_REMOVE_FORBIDDEN',
  WORKTREE_MAIN_DISCARD_FORBIDDEN: 'WORKTREE_MAIN_DISCARD_FORBIDDEN',
  WORKTREE_HAS_ACTIVE_SESSIONS: 'WORKTREE_HAS_ACTIVE_SESSIONS',
  WORKTREE_COMMIT_MESSAGE_REQUIRED: 'WORKTREE_COMMIT_MESSAGE_REQUIRED',
  WORKTREE_BASE_NOT_DETECTED: 'WORKTREE_BASE_NOT_DETECTED',
  WORKTREE_MAIN_NOT_FOUND: 'WORKTREE_MAIN_NOT_FOUND',
  WORKTREE_BRANCH_NOT_DETECTED: 'WORKTREE_BRANCH_NOT_DETECTED',
  WORKTREE_NOT_CLEAN: 'WORKTREE_NOT_CLEAN',
  WORKTREE_NOTHING_TO_MERGE: 'WORKTREE_NOTHING_TO_MERGE',
  GIT_COMMAND_FAILED: 'GIT_COMMAND_FAILED',
} as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];

export type Prefs = {
  sections: Record<string, SectionPrefs>;
  expanded: string[];
  projectOrder: string[];
  locale: Locale | null;
};

export type MemoryFile = {
  path: string;
  exists: boolean;
  content: string;
  mtime: number | null;
  variant?: 'shared' | 'local';
};

export type MemoryVariant = 'shared' | 'local';

export type MemoryHierarchyEntry = {
  scope: 'global' | 'ancestor' | 'project';
  variant: MemoryVariant;
  dir: string;
  path: string;
  exists: boolean;
  mtime: number | null;
  size: number;
};

export type MemoryHierarchyResponse = {
  cwd: string;
  entries: MemoryHierarchyEntry[];
};

export type MemoryImportEntry = {
  raw: string;
  resolved: string | null;
  basePath: string;
  depth: number;
  exists: boolean;
  error: string | null;
};

export type MemoryExpandResponse = {
  basePath: string;
  expanded: string;
  imports: MemoryImportEntry[];
  truncated: boolean;
};

export type AgentSummary = {
  name: string;
  description: string;
  path: string;
  mtime: number;
};

export type AgentDetail = {
  name: string;
  path: string;
  description: string;
  model: string;
  tools: string[];
  body: string;
  raw: string;
};

export type AgentScope = 'user' | 'project';

export type AgentListResponse = {
  user: AgentSummary[];
  project: AgentSummary[];
};

export type SkillSummary = {
  name: string;
  description: string;
  path: string;
  dir: string;
  mtime: number;
};

export type SkillExtra = {
  relativePath: string;
  size: number;
};

export type SkillDetail = {
  name: string;
  path: string;
  dir: string;
  description: string;
  body: string;
  raw: string;
  extras: SkillExtra[];
};

export type SkillScope = 'user' | 'project';

export type SkillListResponse = {
  user: SkillSummary[];
  project: SkillSummary[];
};
