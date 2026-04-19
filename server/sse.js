const fs = require('node:fs');
const { CLAUDE_PROJECTS } = require('./paths');
const { liveSessions, computeState } = require('./live-sessions');

const clients = new Set();
let watcher = null;
let invalidateDebounceTimer = null;
let activityDebounceTimer = null;

function broadcastInvalidate() {
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

function liveSessionsSnapshot() {
  const sessions = [];
  for (const [key, entry] of liveSessions) {
    sessions.push({
      sessionKey: key,
      state: computeState(entry),
      cwd: entry.cwd,
      lastOutputAt: entry.lastOutputAt,
      idleSince: entry.idleSince,
    });
  }
  return { at: Date.now(), sessions };
}

function writeActivityTo(res) {
  try {
    res.write(`event: activity\ndata: ${JSON.stringify(liveSessionsSnapshot())}\n\n`);
  } catch {}
}

function broadcastActivity() {
  if (activityDebounceTimer) return;
  activityDebounceTimer = setTimeout(() => {
    activityDebounceTimer = null;
    for (const res of clients) writeActivityTo(res);
  }, 150);
}

function ensureWatcher() {
  if (watcher || !fs.existsSync(CLAUDE_PROJECTS)) return;
  try {
    watcher = fs.watch(CLAUDE_PROJECTS, { recursive: true }, () => broadcastInvalidate());
    watcher.on('error', (err) => {
      console.warn(`[sse] watcher error: ${err.message}`);
      try {
        watcher.close();
      } catch {}
      watcher = null;
    });
  } catch (err) {
    console.warn(`[sse] fs.watch failed: ${err.message}`);
  }
}

function register(app) {
  app.get('/api/sessions/stream', (req, res) => {
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

module.exports = {
  broadcastInvalidate,
  broadcastActivity,
  liveSessionsSnapshot,
  writeActivityTo,
  ensureWatcher,
  register,
};
