import fs from 'node:fs';
import os from 'node:os';
import type { Express, Request } from 'express';
import * as pty from 'node-pty';
import type { WebSocket } from 'ws';
import { USER_SHELL } from '../claude-bin';
import {
  buildPtyArgs,
  getOrCreateLiveSession,
  maybeBroadcastStateChange,
  safeSend,
} from '../live-sessions';
import { isWsUpgradeAllowed } from '../security';

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
      closeSilently(ws);
      return;
    }
    const sessionKey = req.query.sessionKey ? String(req.query.sessionKey).trim() : '';
    if (!sessionKey) {
      safeSend(ws, { type: 'error', message: 'sessionKey obrigatório' });
      closeSilently(ws);
      return;
    }

    const args = buildPtyArgs({ ...req.query, sessionId: sessionKey });
    let entry: ReturnType<typeof getOrCreateLiveSession>;
    try {
      entry = getOrCreateLiveSession(sessionKey, {
        cwd: typeof req.query.cwd === 'string' ? req.query.cwd : undefined,
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
    const rawCwd = req.query.cwd ? String(req.query.cwd) : '';
    const targetCwd = rawCwd && fs.existsSync(rawCwd) ? rawCwd : os.homedir();
    let term: ReturnType<typeof pty.spawn>;
    try {
      term = pty.spawn(USER_SHELL, ['-l'], {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: targetCwd,
        env: { ...process.env, TERM: 'xterm-256color' },
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
