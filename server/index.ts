import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import expressWs from 'express-ws';
import { CLAUDE_BIN } from './claude-bin';
import { liveSessions, startIdleSweep } from './live-sessions';
import * as agentsSkillsRoutes from './routes/agents-skills';
import * as attachmentsRoutes from './routes/attachments';
import * as maintenanceRoutes from './routes/maintenance';
import * as memoryRoutes from './routes/memory';
import * as miscRoutes from './routes/misc';
import * as prefsRoutes from './routes/prefs';
import * as ptyRoutes from './routes/pty';
import * as sandboxRoutes from './routes/sandbox';
import * as sessionsRoutes from './routes/sessions';
import * as worktreesRoutes from './routes/worktrees';
import { hostGuard, originGuard } from './security';
import * as sse from './sse';

if (!CLAUDE_BIN) {
  console.error('ERROR: claude binary not found. Make sure `which claude` works in your shell.');
  process.exit(1);
}
console.log(`Using claude binary: ${CLAUDE_BIN}`);

const PORT = Number(process.env.PORT) || 3000;
const HOST = '127.0.0.1';
const WEB_DIST = path.join(__dirname, '..', 'web', 'dist');

const app = express();
expressWs(app);
app.use(hostGuard);
app.use(originGuard);
app.use(express.json());

if (fs.existsSync(WEB_DIST)) {
  app.use(express.static(WEB_DIST));
}

sse.register(app);
sessionsRoutes.register(app);
memoryRoutes.register(app);
agentsSkillsRoutes.register(app);
sandboxRoutes.register(app);
worktreesRoutes.register(app);
prefsRoutes.register(app);
miscRoutes.register(app);
attachmentsRoutes.register(app);
maintenanceRoutes.register(app);
ptyRoutes.register(app);

startIdleSweep();
attachmentsRoutes.cleanupOrphanAttachments(new Set(liveSessions.keys()));

if (fs.existsSync(WEB_DIST)) {
  app.get(/^\/(?!api|pty).*/, (_req, res) => {
    res.sendFile(path.join(WEB_DIST, 'index.html'));
  });
}

app.listen(PORT, HOST, () => {
  console.log(`Claude Code Studio rodando em http://${HOST}:${PORT}`);
});
