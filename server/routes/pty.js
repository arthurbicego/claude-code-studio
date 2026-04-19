const fs = require('node:fs');
const os = require('node:os');
const pty = require('node-pty');
const { USER_SHELL } = require('../claude-bin');
const {
  buildPtyArgs,
  getOrCreateLiveSession,
  maybeBroadcastStateChange,
  safeSend,
} = require('../live-sessions');

function register(app) {
  app.ws('/pty', (ws, req) => {
    const sessionKey = req.query.sessionKey ? String(req.query.sessionKey).trim() : '';
    if (!sessionKey) {
      safeSend(ws, { type: 'error', message: 'sessionKey obrigatório' });
      try {
        ws.close();
      } catch {}
      return;
    }

    const args = buildPtyArgs({ ...req.query, sessionId: sessionKey });
    let entry;
    try {
      entry = getOrCreateLiveSession(sessionKey, { cwd: req.query.cwd, args });
    } catch (err) {
      safeSend(ws, { type: 'error', message: `Failed to spawn claude: ${err.message}` });
      try {
        ws.close();
      } catch {}
      return;
    }

    entry.subscribers.add(ws);
    entry.idleSince = null;
    maybeBroadcastStateChange(entry);

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (msg.type === 'input') {
        try {
          entry.pty.write(msg.data);
        } catch {}
      } else if (msg.type === 'resize') {
        try {
          entry.pty.resize(msg.cols, msg.rows);
        } catch {}
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

  app.ws('/pty/shell', (ws, req) => {
    const rawCwd = req.query.cwd ? String(req.query.cwd) : '';
    const targetCwd = rawCwd && fs.existsSync(rawCwd) ? rawCwd : os.homedir();
    let term;
    try {
      term = pty.spawn(USER_SHELL, ['-l'], {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: targetCwd,
        env: { ...process.env, TERM: 'xterm-256color' },
      });
    } catch (err) {
      safeSend(ws, { type: 'error', message: `shell spawn falhou: ${err.message}` });
      try {
        ws.close();
      } catch {}
      return;
    }

    term.onData((data) => safeSend(ws, { type: 'data', data }));
    term.onExit(({ exitCode }) => {
      safeSend(ws, { type: 'exit', exitCode });
      try {
        ws.close();
      } catch {}
    });

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (msg.type === 'input') {
        try {
          term.write(msg.data);
        } catch {}
      } else if (msg.type === 'resize') {
        try {
          term.resize(msg.cols, msg.rows);
        } catch {}
      }
    });

    ws.on('close', () => {
      try {
        term.kill();
      } catch {}
    });
  });
}

module.exports = { register };
