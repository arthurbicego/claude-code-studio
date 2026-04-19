const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const pty = require('node-pty');

const { CLAUDE_BIN } = require('./claude-bin');
const { getConfig } = require('./config');
const { STATUSLINE_CACHE_DIR, STATUSLINE_TAP } = require('./paths');
const {
  UUID_RE,
  VALID_EFFORT,
  VALID_MODEL_RE,
  VALID_PERMISSION_MODE,
  WORKTREE_NAME_RE,
} = require('./validators');

const ACTIVE_OUTPUT_WINDOW_MS = 600;
const TAIL_BUFFER_SIZE = 4096;
const IDLE_SWEEP_INTERVAL_MS = 30 * 1000;

const ANSI_RE = /\x1b\[[0-9;?]*[A-Za-z]|\x1b\][^\x07]*\x07|\x1b[=>]|\r/g;

function stripAnsi(s) {
  return s.replace(ANSI_RE, '');
}

const APPROVAL_PATTERNS = [
  /❯\s*\d+\.\s+(Yes|No|Approve|Allow|Accept|Always|Skip|Don't)/i,
  /Do you want to (proceed|allow|approve|continue)/i,
  /Would you like to (proceed|allow|continue)/i,
];

function needsApproval(tail) {
  const s = stripAnsi(tail);
  return APPROVAL_PATTERNS.some((re) => re.test(s));
}

function buildStatusLineSettingsArg() {
  try {
    if (!fs.existsSync(STATUSLINE_TAP)) return null;
  } catch {
    return null;
  }
  return JSON.stringify({
    statusLine: { type: 'command', command: STATUSLINE_TAP },
  });
}

function buildPtyArgs({ resume, sessionId, model, effort, permissionMode, worktree }) {
  const args = [];
  const tapSettings = buildStatusLineSettingsArg();
  if (tapSettings) args.push('--settings', tapSettings);
  if (resume) {
    args.push('--resume', resume);
  } else {
    if (sessionId && UUID_RE.test(sessionId)) args.push('--session-id', sessionId);
    if (model && VALID_MODEL_RE.test(model)) args.push('--model', model);
    if (effort && VALID_EFFORT.has(effort)) args.push('--effort', effort);
    if (permissionMode && VALID_PERMISSION_MODE.has(permissionMode)) {
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

function buildChildEnv() {
  const env = { ...process.env };
  const claudeDir = path.dirname(CLAUDE_BIN);
  if (!env.PATH?.split(':').includes(claudeDir)) {
    env.PATH = `${claudeDir}:${env.PATH || ''}`;
  }
  return env;
}

function spawnClaudePty({ cwd, args }) {
  const targetCwd = cwd && fs.existsSync(cwd) ? cwd : os.homedir();
  console.log(`[pty] spawn: claude ${args.join(' ')}  (cwd=${targetCwd})`);
  return pty.spawn(CLAUDE_BIN, args, {
    name: 'xterm-256color',
    cols: 80,
    rows: 30,
    cwd: targetCwd,
    env: buildChildEnv(),
  });
}

function safeSend(ws, obj) {
  if (ws.readyState === ws.OPEN) {
    try {
      ws.send(JSON.stringify(obj));
    } catch {}
  }
}

const liveSessions = new Map();

function computeState(entry) {
  if (!entry) return 'finalizado';
  if (entry.focusedWs && entry.focusedWs.size > 0) return 'ativo';
  if (needsApproval(entry.tail)) return 'aguardando';
  if (Date.now() - entry.lastOutputAt < ACTIVE_OUTPUT_WINDOW_MS) return 'ativo';
  return 'standby';
}

function maybeBroadcastStateChange(entry) {
  const current = computeState(entry);
  if (current !== entry.cachedState) {
    entry.cachedState = current;
    // lazy require to break cycle with sse.js
    require('./sse').broadcastActivity();
  }
}

function scheduleStandbyRecheck(entry) {
  if (entry.standbyRecheckTimer) clearTimeout(entry.standbyRecheckTimer);
  entry.standbyRecheckTimer = setTimeout(() => {
    entry.standbyRecheckTimer = null;
    if (liveSessions.get(entry.sessionKey) === entry) maybeBroadcastStateChange(entry);
  }, ACTIVE_OUTPUT_WINDOW_MS + 100);
}

function getOrCreateLiveSession(sessionKey, { cwd, args }) {
  const existing = liveSessions.get(sessionKey);
  if (existing) return existing;

  const term = spawnClaudePty({ cwd, args });
  let resolveExit;
  const exited = new Promise((resolve) => {
    resolveExit = resolve;
  });
  const entry = {
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

  term.onData((data) => {
    entry.lastOutputAt = Date.now();
    entry.tail += data;
    if (entry.tail.length > TAIL_BUFFER_SIZE) {
      entry.tail = entry.tail.slice(-TAIL_BUFFER_SIZE);
    }
    for (const ws of entry.subscribers) safeSend(ws, { type: 'data', data });
    maybeBroadcastStateChange(entry);
    scheduleStandbyRecheck(entry);
  });

  term.onExit(({ exitCode }) => {
    if (entry.standbyRecheckTimer) clearTimeout(entry.standbyRecheckTimer);
    for (const ws of entry.subscribers) {
      safeSend(ws, { type: 'exit', exitCode });
      try {
        ws.close();
      } catch {}
    }
    entry.subscribers.clear();
    liveSessions.delete(sessionKey);
    require('./sse').broadcastActivity();
    resolveExit();
  });

  liveSessions.set(sessionKey, entry);
  require('./sse').broadcastActivity();
  scheduleStandbyRecheck(entry);
  return entry;
}

function liveSessionWorkspaces() {
  const counts = new Map();
  for (const [key, entry] of liveSessions) {
    let target = entry.cwd || null;
    try {
      const cachePath = path.join(STATUSLINE_CACHE_DIR, `${key}.json`);
      const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      const wd = cache?.workspace?.current_dir || cache?.cwd;
      if (wd) target = wd;
    } catch {}
    if (!target) continue;
    let resolved = target;
    try {
      resolved = fs.realpathSync(target);
    } catch {}
    counts.set(resolved, (counts.get(resolved) || 0) + 1);
  }
  return counts;
}

function startIdleSweep() {
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
        } catch {}
      }
    }
  }, IDLE_SWEEP_INTERVAL_MS).unref();
}

module.exports = {
  ACTIVE_OUTPUT_WINDOW_MS,
  TAIL_BUFFER_SIZE,
  IDLE_SWEEP_INTERVAL_MS,
  ANSI_RE,
  stripAnsi,
  APPROVAL_PATTERNS,
  needsApproval,
  buildStatusLineSettingsArg,
  buildPtyArgs,
  buildChildEnv,
  spawnClaudePty,
  safeSend,
  liveSessions,
  computeState,
  maybeBroadcastStateChange,
  scheduleStandbyRecheck,
  getOrCreateLiveSession,
  liveSessionWorkspaces,
  startIdleSweep,
};
