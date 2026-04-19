import fs from 'node:fs';
import type { LiveSessionsSnapshot } from '@shared/types';
import type { Express, Request, Response } from 'express';
import { computeState, liveSessions } from './live-sessions';
import { CLAUDE_PROJECTS } from './paths';

const clients = new Set<Response>();
let watcher: fs.FSWatcher | null = null;
let invalidateDebounceTimer: NodeJS.Timeout | null = null;
let activityDebounceTimer: NodeJS.Timeout | null = null;

export function broadcastInvalidate(): void {
  if (invalidateDebounceTimer) return;
  invalidateDebounceTimer = setTimeout(() => {
    invalidateDebounceTimer = null;
    for (const res of clients) {
      try {
        res.write(`event: invalidate\ndata: ${Date.now()}\n\n`);
      } catch {}
    }
  }, 500);
}

export function liveSessionsSnapshot(): LiveSessionsSnapshot {
  const sessions: LiveSessionsSnapshot['sessions'] = [];
  for (const [key, entry] of liveSessions) {
    sessions.push({
      sessionKey: key,
      state: computeState(entry),
      cwd: entry.cwd ?? '',
      lastOutputAt: entry.lastOutputAt,
      idleSince: entry.idleSince,
    });
  }
  return { at: Date.now(), sessions };
}

export function writeActivityTo(res: Response): void {
  try {
    res.write(`event: activity\ndata: ${JSON.stringify(liveSessionsSnapshot())}\n\n`);
  } catch {}
}

export function broadcastActivity(): void {
  if (activityDebounceTimer) return;
  activityDebounceTimer = setTimeout(() => {
    activityDebounceTimer = null;
    for (const res of clients) writeActivityTo(res);
  }, 150);
}

export function ensureWatcher(): void {
  if (watcher || !fs.existsSync(CLAUDE_PROJECTS)) return;
  try {
    watcher = fs.watch(CLAUDE_PROJECTS, { recursive: true }, () => broadcastInvalidate());
    watcher.on('error', (err) => {
      console.warn(`[sse] watcher error: ${err.message}`);
      try {
        watcher?.close();
      } catch {}
      watcher = null;
    });
  } catch (err) {
    console.warn(`[sse] fs.watch failed: ${(err as Error).message}`);
  }
}

export function register(app: Express): void {
  app.get('/api/sessions/stream', (req: Request, res: Response) => {
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders?.();
    res.write(`event: hello\ndata: ${Date.now()}\n\n`);
    writeActivityTo(res);

    clients.add(res);
    ensureWatcher();

    const heartbeat = setInterval(() => {
      try {
        res.write(`: keepalive ${Date.now()}\n\n`);
      } catch {}
    }, 25000);

    req.on('close', () => {
      clearInterval(heartbeat);
      clients.delete(res);
      if (clients.size === 0 && watcher) {
        try {
          watcher.close();
        } catch {}
        watcher = null;
      }
    });
  });
}
