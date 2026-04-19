const express = require('express');
const expressWs = require('express-ws');
const fs = require('node:fs');
const path = require('node:path');

const { CLAUDE_BIN } = require('./claude-bin');

if (!CLAUDE_BIN) {
  console.error('ERROR: claude binary not found. Make sure `which claude` works in your shell.');
  process.exit(1);
}
console.log(`Using claude binary: ${CLAUDE_BIN}`);

const PORT = process.env.PORT || 3000;
const HOST = '127.0.0.1';
const WEB_DIST = path.join(__dirname, '..', 'web', 'dist');

const app = express();
expressWs(app);
app.use(express.json());

if (fs.existsSync(WEB_DIST)) {
  app.use(express.static(WEB_DIST));
}

require('./sse').register(app);
require('./routes/sessions').register(app);
require('./routes/memory').register(app);
require('./routes/agents-skills').register(app);
require('./routes/sandbox').register(app);
require('./routes/worktrees').register(app);
require('./routes/prefs').register(app);
require('./routes/misc').register(app);
require('./routes/pty').register(app);

require('./live-sessions').startIdleSweep();

if (fs.existsSync(WEB_DIST)) {
  app.get(/^\/(?!api|pty).*/, (_req, res) => {
    res.sendFile(path.join(WEB_DIST, 'index.html'));
  });
}

app.listen(PORT, HOST, () => {
  console.log(`Claude Code Studio rodando em http://${HOST}:${PORT}`);
});
