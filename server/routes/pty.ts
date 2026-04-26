import os from 'node:os';
import type { Express, Request } from 'express';
import * as pty from 'node-pty';
import type { WebSocket } from 'ws';
import { verifyBootToken } from '../auth';
import { USER_SHELL } from '../claude-bin';
import {
  buildPtyArgs,
  getOrCreateLiveSession,
  maybeBroadcastStateChange,
  safeSend,
} from '../live-sessions';
import { isAllowedProjectCwd } from '../paths';
import { isWsUpgradeAllowed } from '../security';

// Names that are very likely to carry secrets or auth material. The shell PTY is meant for
// running shell commands inside a project, not for inheriting the credentials the parent
// process happens to have on its env. Strip these before spawn so an `env` in the WebSocket
// shell does not dump tokens, even though a determined caller can still read files via the
// shell — defense in depth, not a containment boundary.
const SENSITIVE_ENV_NAME_RE =
  /TOKEN|SECRET|API_?KEY|CREDENTIAL|PASSWORD|PASSWD|BEARER|PRIVATE_KEY|SIGNING_KEY|SESSION_KEY|AUTH_HEADER|ACCESS_KEY/i;

const EXPLICIT_SENSITIVE_ENV = new Set(['AWS_SESSION_TOKEN', 'AWS_SECURITY_TOKEN']);

function sanitizedShellEnv(): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (EXPLICIT_SENSITIVE_ENV.has(k)) continue;
    if (SENSITIVE_ENV_NAME_RE.test(k)) continue;
    out[k] = v;
  }
  out.TERM = 'xterm-256color';
  return out;
}

type WsHandler = (ws: WebSocket, req: Request) => void;
type AppWithWs = Express & { ws: (path: string, handler: WsHandler) => void };

function closeSilently(ws: WebSocket): void {
  try {
    ws.close();
  } catch {
    // Socket may already be closed.
  }
}

export function register(app: Express): void {
  const wsApp = app as AppWithWs;

  wsApp.ws('/pty', (ws, req) => {
    if (!isWsUpgradeAllowed(req)) {
      console.warn(
        `[pty] ws upgrade rejected · host=${String(req.headers.host ?? '')} origin=${String(req.headers.origin ?? '')}`,
      );
      closeSilently(ws);
      return;
    }
    // Boot-token check: sessionKey leaks via the SSE stream, so without this any localhost
    // caller that passed the host/origin guards could subscribe to (and inject input into)
    // an active PTY by guessing the key. The token sits in a 0600 file under ~/.cockpit-* and
    // is fetched same-origin by the frontend, so cross-origin pages cannot read it under SOP.
    const tokenParam = typeof req.query.token === 'string' ? req.query.token : '';
    if (!verifyBootToken(tokenParam)) {
      safeSend(ws, { type: 'error', message: 'invalid or missing boot token' });
      closeSilently(ws);
      return;
    }
    const sessionKey = req.query.sessionKey ? String(req.query.sessionKey).trim() : '';
    if (!sessionKey) {
      safeSend(ws, { type: 'error', message: 'sessionKey obrigatório' });
      closeSilently(ws);
      return;
    }

    // Containment: reject any cwd that is not inside $HOME so a stray caller cannot spawn
    // `claude` rooted at `/etc`, `/var/log`, or another mount. /pty/shell already does this;
    // /pty was the missing half. An undefined cwd is fine — spawnClaudePty falls back to $HOME.
    const rawCwd = typeof req.query.cwd === 'string' ? req.query.cwd : undefined;
    const validatedCwd = rawCwd ? (isAllowedProjectCwd(rawCwd) ?? null) : null;
    if (rawCwd && !validatedCwd) {
      safeSend(ws, { type: 'error', message: 'cwd must be a path inside $HOME' });
      closeSilently(ws);
      return;
    }

    const args = buildPtyArgs({ ...req.query, sessionId: sessionKey });
    let entry: ReturnType<typeof getOrCreateLiveSession>;
    try {
      entry = getOrCreateLiveSession(sessionKey, {
        cwd: validatedCwd ?? undefined,
        args,
      });
    } catch (err) {
      safeSend(ws, { type: 'error', message: `Failed to spawn claude: ${(err as Error).message}` });
      closeSilently(ws);
      return;
    }

    entry.subscribers.add(ws);
    entry.idleSince = null;
    maybeBroadcastStateChange(entry);

    ws.on('message', (raw: Buffer) => {
      let msg: { type?: string; data?: string; cols?: number; rows?: number; active?: boolean };
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        // Non-JSON frame; ignore.
        return;
      }
      if (msg.type === 'input') {
        try {
          if (typeof msg.data === 'string') entry.pty.write(msg.data);
        } catch {
          // PTY exited between receiving the frame and writing.
        }
      } else if (msg.type === 'resize') {
        try {
          if (typeof msg.cols === 'number' && typeof msg.rows === 'number')
            entry.pty.resize(msg.cols, msg.rows);
        } catch {
          // PTY exited between receiving the frame and resizing.
        }
      } else if (msg.type === 'focus') {
        if (msg.active) entry.focusedWs.add(ws);
        else entry.focusedWs.delete(ws);
        maybeBroadcastStateChange(entry);
      }
    });

    ws.on('close', () => {
      entry.subscribers.delete(ws);
      entry.focusedWs.delete(ws);
      if (entry.subscribers.size === 0) {
        entry.idleSince = Date.now();
      }
      maybeBroadcastStateChange(entry);
    });
  });

  wsApp.ws('/pty/shell', (ws, req) => {
    if (!isWsUpgradeAllowed(req)) {
      closeSilently(ws);
      return;
    }
    const tokenParam = typeof req.query.token === 'string' ? req.query.token : '';
    if (!verifyBootToken(tokenParam)) {
      safeSend(ws, { type: 'error', message: 'invalid or missing boot token' });
      closeSilently(ws);
      return;
    }
    const rawCwd = req.query.cwd ? String(req.query.cwd) : '';
    // Contain the shell cwd inside $HOME so a stray caller cannot spawn `/bin/zsh` rooted at
    // `/` or an unrelated mount. Falls back to $HOME when the caller supplies nothing valid.
    const targetCwd = isAllowedProjectCwd(rawCwd) ?? os.homedir();
    let term: ReturnType<typeof pty.spawn>;
    try {
      term = pty.spawn(USER_SHELL, ['-l'], {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: targetCwd,
        env: sanitizedShellEnv(),
      });
    } catch (err) {
      safeSend(ws, { type: 'error', message: `shell spawn falhou: ${(err as Error).message}` });
      closeSilently(ws);
      return;
    }

    term.onData((data: string) => safeSend(ws, { type: 'data', data }));
    term.onExit(({ exitCode }: { exitCode: number }) => {
      safeSend(ws, { type: 'exit', exitCode });
      closeSilently(ws);
    });

    ws.on('message', (raw: Buffer) => {
      let msg: { type?: string; data?: string; cols?: number; rows?: number };
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        // Non-JSON frame; ignore.
        return;
      }
      if (msg.type === 'input') {
        try {
          if (typeof msg.data === 'string') term.write(msg.data);
        } catch {
          // Shell exited between receiving the frame and writing.
        }
      } else if (msg.type === 'resize') {
        try {
          if (typeof msg.cols === 'number' && typeof msg.rows === 'number')
            term.resize(msg.cols, msg.rows);
        } catch {
          // Shell exited between receiving the frame and resizing.
        }
      }
    });

    ws.on('close', () => {
      try {
        term.kill();
      } catch {
        // Shell already exited.
      }
    });
  });
}
