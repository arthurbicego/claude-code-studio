import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { LiveSessionState } from '@shared/types';
import type { IPty } from 'node-pty';
import * as pty from 'node-pty';
import type { WebSocket } from 'ws';
import { CLAUDE_BIN } from './claude-bin';
import { getConfig } from './config';
import { STATUSLINE_CACHE_DIR, STATUSLINE_TAP } from './paths';
import {
  UUID_RE,
  VALID_EFFORT,
  VALID_MODEL_RE,
  VALID_PERMISSION_MODE,
  WORKTREE_NAME_RE,
} from './validators';

export const ACTIVE_OUTPUT_WINDOW_MS = 600;
export const TAIL_BUFFER_SIZE = 4096;
export const IDLE_SWEEP_INTERVAL_MS = 30 * 1000;

export const ANSI_RE = /\x1b\[[0-9;?]*[A-Za-z]|\x1b\][^\x07]*\x07|\x1b[=>]|\r/g;

export function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, '');
}

export const APPROVAL_PATTERNS = [
  /❯\s*\d+\.\s+(Yes|No|Approve|Allow|Accept|Always|Skip|Don't)/i,
  /Do you want to (proceed|allow|approve|continue)/i,
  /Would you like to (proceed|allow|continue)/i,
];

export function needsApproval(tail: string): boolean {
  const s = stripAnsi(tail);
  return APPROVAL_PATTERNS.some((re) => re.test(s));
}

export function buildStatusLineSettingsArg(): string | null {
  try {
    if (!fs.existsSync(STATUSLINE_TAP)) return null;
  } catch {
    return null;
  }
  return JSON.stringify({
    statusLine: { type: 'command', command: STATUSLINE_TAP },
  });
}

export type PtyArgs = {
  resume?: unknown;
  sessionId?: unknown;
  model?: unknown;
  effort?: unknown;
  permissionMode?: unknown;
  worktree?: unknown;
};

export function buildPtyArgs({
  resume,
  sessionId,
  model,
  effort,
  permissionMode,
  worktree,
}: PtyArgs): string[] {
  const args: string[] = [];
  const tapSettings = buildStatusLineSettingsArg();
  if (tapSettings) args.push('--settings', tapSettings);
  if (resume && typeof resume === 'string') {
    args.push('--resume', resume);
  } else {
    if (typeof sessionId === 'string' && UUID_RE.test(sessionId))
      args.push('--session-id', sessionId);
    if (typeof model === 'string' && VALID_MODEL_RE.test(model)) args.push('--model', model);
    if (typeof effort === 'string' && VALID_EFFORT.has(effort)) args.push('--effort', effort);
    if (typeof permissionMode === 'string' && VALID_PERMISSION_MODE.has(permissionMode)) {
      args.push('--permission-mode', permissionMode);
    }
    if (typeof worktree === 'string' && worktree.length > 0) {
      if (worktree === '1' || worktree === 'true') {
        args.push('--worktree');
      } else if (WORKTREE_NAME_RE.test(worktree)) {
        args.push('--worktree', worktree);
      }
    }
  }
  return args;
}

export function buildChildEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  if (!CLAUDE_BIN) return env;
  const claudeDir = path.dirname(CLAUDE_BIN);
  if (!env.PATH?.split(':').includes(claudeDir)) {
    env.PATH = `${claudeDir}:${env.PATH || ''}`;
  }
  return env;
}

function extractFlag(args: string[], name: string): string | null {
  const i = args.indexOf(name);
  if (i === -1 || i + 1 >= args.length) return null;
  return args[i + 1];
}

export function spawnClaudePty({ cwd, args }: { cwd?: string; args: string[] }): IPty {
  if (!CLAUDE_BIN) throw new Error('claude binary not found');
  const targetCwd = cwd && fs.existsSync(cwd) ? cwd : os.homedir();
  const sessionId = extractFlag(args, '--session-id') || extractFlag(args, '--resume') || '(new)';
  console.log(`[pty] spawn: claude session=${sessionId} cwd=${targetCwd}`);
  return pty.spawn(CLAUDE_BIN, args, {
    name: 'xterm-256color',
    cols: 80,
    rows: 30,
    cwd: targetCwd,
    env: buildChildEnv(),
  });
}

export function safeSend(ws: WebSocket, obj: unknown): void {
  // biome-ignore lint/suspicious/noExplicitAny: ws type definitions require OPEN constant check
  if (ws.readyState === (ws as any).OPEN) {
    try {
      ws.send(JSON.stringify(obj));
    } catch {
      // Socket transitioned to closing/closed between the readyState check and send.
    }
  }
}

export type LiveSessionEntry = {
  sessionKey: string;
  pty: IPty;
  cwd?: string;
  args: string[];
  subscribers: Set<WebSocket>;
  focusedWs: Set<WebSocket>;
  lastOutputAt: number;
  idleSince: number | null;
  tail: string;
  cachedState: LiveSessionState;
  exited: Promise<void>;
  standbyRecheckTimer?: NodeJS.Timeout | null;
};

export const liveSessions = new Map<string, LiveSessionEntry>();

/**
 * Kills the PTY for `sessionKey` (if live) and waits up to `timeoutMs` for its `onExit` handler
 * to run — which clears the timers, removes the entry from `liveSessions`, and purges the
 * session's attachment directory. No-ops when the session is not live.
 */
export async function terminateLiveSession(sessionKey: string, timeoutMs = 3000): Promise<void> {
  const entry = liveSessions.get(sessionKey);
  if (!entry) return;
  try {
    entry.pty.kill();
  } catch {
    // PTY may have exited between the lookup and kill.
  }
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, timeoutMs));
  await Promise.race([entry.exited, timeout]);
}

export function computeState(entry: LiveSessionEntry | undefined | null): LiveSessionState {
  if (!entry) return 'finalizado';
  if (entry.focusedWs && entry.focusedWs.size > 0) return 'ativo';
  if (needsApproval(entry.tail)) return 'aguardando';
  if (Date.now() - entry.lastOutputAt < ACTIVE_OUTPUT_WINDOW_MS) return 'ativo';
  return 'standby';
}

export function maybeBroadcastStateChange(entry: LiveSessionEntry): void {
  const current = computeState(entry);
  if (current !== entry.cachedState) {
    entry.cachedState = current;
    // lazy require to break cycle with sse.ts
    require('./sse').broadcastActivity();
  }
}

export function scheduleStandbyRecheck(entry: LiveSessionEntry): void {
  if (entry.standbyRecheckTimer) clearTimeout(entry.standbyRecheckTimer);
  entry.standbyRecheckTimer = setTimeout(() => {
    entry.standbyRecheckTimer = null;
    if (liveSessions.get(entry.sessionKey) === entry) maybeBroadcastStateChange(entry);
  }, ACTIVE_OUTPUT_WINDOW_MS + 100);
}

export function getOrCreateLiveSession(
  sessionKey: string,
  { cwd, args }: { cwd?: string; args: string[] },
): LiveSessionEntry {
  const existing = liveSessions.get(sessionKey);
  if (existing) return existing;

  const term = spawnClaudePty({ cwd, args });
  let resolveExit!: () => void;
  const exited = new Promise<void>((resolve) => {
    resolveExit = resolve;
  });
  const entry: LiveSessionEntry = {
    sessionKey,
    pty: term,
    cwd,
    args,
    subscribers: new Set(),
    focusedWs: new Set(),
    lastOutputAt: Date.now(),
    idleSince: Date.now(),
    tail: '',
    cachedState: 'ativo',
    exited,
  };

  term.onData((data: string) => {
    entry.lastOutputAt = Date.now();
    entry.tail += data;
    if (entry.tail.length > TAIL_BUFFER_SIZE) {
      entry.tail = entry.tail.slice(-TAIL_BUFFER_SIZE);
    }
    for (const ws of entry.subscribers) safeSend(ws, { type: 'data', data });
    maybeBroadcastStateChange(entry);
    scheduleStandbyRecheck(entry);
  });

  term.onExit(({ exitCode }: { exitCode: number }) => {
    if (entry.standbyRecheckTimer) clearTimeout(entry.standbyRecheckTimer);
    for (const ws of entry.subscribers) {
      safeSend(ws, { type: 'exit', exitCode });
      try {
        ws.close();
      } catch {
        // Socket may already be closed.
      }
    }
    entry.subscribers.clear();
    liveSessions.delete(sessionKey);
    require('./routes/attachments').cleanupAttachmentsForSession(sessionKey);
    require('./sse').broadcastActivity();
    resolveExit();
  });

  liveSessions.set(sessionKey, entry);
  require('./sse').broadcastActivity();
  scheduleStandbyRecheck(entry);
  return entry;
}

export function liveSessionWorkspaces(): Map<string, number> {
  const counts = new Map<string, number>();
  for (const [key, entry] of liveSessions) {
    let target: string | null = entry.cwd || null;
    try {
      const cachePath = path.join(STATUSLINE_CACHE_DIR, `${key}.json`);
      const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8')) as {
        workspace?: { current_dir?: string };
        cwd?: string;
      };
      const wd = cache?.workspace?.current_dir || cache?.cwd;
      if (wd) target = wd;
    } catch {
      // Statusline cache may be missing or mid-write — fall back to entry.cwd.
    }
    if (!target) continue;
    let resolved = target;
    try {
      resolved = fs.realpathSync(target);
    } catch {
      // Path no longer exists — use the raw target as the key.
    }
    counts.set(resolved, (counts.get(resolved) || 0) + 1);
  }
  return counts;
}

export function startIdleSweep(): NodeJS.Timeout {
  return setInterval(() => {
    const now = Date.now();
    const timeout = getConfig().standbyTimeoutMs;
    for (const [key, entry] of liveSessions) {
      if (computeState(entry) !== 'standby') continue;
      if (entry.idleSince !== null && now - entry.idleSince >= timeout) {
        console.log(
          `[pty] auto-kill ${key} after ${Math.round((now - entry.idleSince) / 1000)}s standby`,
        );
        try {
          entry.pty.kill();
        } catch {
          // PTY may have exited between the state check and kill.
        }
      }
    }
  }, IDLE_SWEEP_INTERVAL_MS).unref();
}
