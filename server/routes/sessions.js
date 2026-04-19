const fs = require('node:fs');
const path = require('node:path');

const { CLAUDE_PROJECTS } = require('../paths');
const { FOOTER_ID_RE } = require('../validators');
const { runGit } = require('../git');
const {
  readSessionMeta,
  fallbackSlugToCwd,
  findSessionFile,
  findLastToolUse,
  resolveSessionCwd,
} = require('../sessions-meta');
const { buildFooterPayload, removeFooterCacheFor } = require('../footer');
const { appState, saveState } = require('../state');
const { liveSessions } = require('../live-sessions');
const { broadcastInvalidate } = require('../sse');

function register(app) {
  app.get('/api/sessions', (_req, res) => {
    res.set('Cache-Control', 'no-store, max-age=0');
    if (!fs.existsSync(CLAUDE_PROJECTS)) return res.json({ projects: [] });

    const projects = fs
      .readdirSync(CLAUDE_PROJECTS)
      .map((slug) => {
        const dir = path.join(CLAUDE_PROJECTS, slug);
        if (!fs.statSync(dir).isDirectory()) return null;

        const sessionFiles = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl'));
        let projectCwd = null;
        const sessions = sessionFiles
          .map((f) => {
            const id = f.replace(/\.jsonl$/, '');
            const fpath = path.join(dir, f);
            const st = fs.statSync(fpath);
            const { cwd, preview } = readSessionMeta(fpath);
            if (cwd && !projectCwd) projectCwd = cwd;
            return {
              id,
              mtime: st.mtimeMs,
              createdAt: st.birthtimeMs || st.ctimeMs,
              size: st.size,
              preview: preview || null,
              archived: appState.archived.has(id),
            };
          })
          .sort((a, b) => b.mtime - a.mtime);

        return {
          slug,
          cwd: projectCwd || fallbackSlugToCwd(slug),
          cwdResolved: !!projectCwd,
          sessions,
        };
      })
      .filter(Boolean)
      .sort((a, b) => (b.sessions[0]?.mtime || 0) - (a.sessions[0]?.mtime || 0));

    res.json({ projects });
  });

  app.post('/api/sessions/:id/archive', (req, res) => {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'id obrigatório' });
    appState.archived.add(id);
    saveState(appState);
    broadcastInvalidate();
    res.json({ ok: true, archived: true });
  });

  app.post('/api/sessions/:id/unarchive', (req, res) => {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'id obrigatório' });
    appState.archived.delete(id);
    saveState(appState);
    broadcastInvalidate();
    res.json({ ok: true, archived: false });
  });

  app.delete('/api/sessions/:id', (req, res) => {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'id obrigatório' });
    const fpath = findSessionFile(id);
    if (!fpath) return res.status(404).json({ error: 'sessão não encontrada' });
    try {
      fs.unlinkSync(fpath);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
    removeFooterCacheFor(id);
    if (appState.archived.delete(id)) saveState(appState);
    broadcastInvalidate();
    res.json({ ok: true, deleted: true });
  });

  app.get('/api/sessions/:id/diff', (req, res) => {
    res.set('Cache-Control', 'no-store');
    const id = String(req.params.id || '').trim();
    if (!FOOTER_ID_RE.test(id)) return res.status(400).json({ error: 'id inválido' });
    const cwd = resolveSessionCwd(id);
    if (!cwd || !fs.existsSync(cwd)) {
      return res.json({ cwd: null, branch: null, unstaged: '', staged: '', untracked: [] });
    }
    const branch = runGit(cwd, 'symbolic-ref --short HEAD').trim() || null;
    const unstaged = runGit(cwd, 'diff --no-color');
    const staged = runGit(cwd, 'diff --no-color --staged');
    const untrackedRaw = runGit(cwd, 'ls-files --others --exclude-standard');
    const untracked = untrackedRaw
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    res.json({ cwd, branch, unstaged, staged, untracked });
  });

  app.get('/api/sessions/:id/tasks', (req, res) => {
    res.set('Cache-Control', 'no-store');
    const id = String(req.params.id || '').trim();
    if (!FOOTER_ID_RE.test(id)) return res.status(400).json({ error: 'id inválido' });
    const fpath = findSessionFile(id);
    if (!fpath) return res.json({ todos: [], updatedAt: null });
    const last = findLastToolUse(fpath, 'TodoWrite');
    const todos = Array.isArray(last?.input?.todos) ? last.input.todos : [];
    res.json({ todos, updatedAt: last?.timestamp || null });
  });

  app.get('/api/sessions/:id/plan', (req, res) => {
    res.set('Cache-Control', 'no-store');
    const id = String(req.params.id || '').trim();
    if (!FOOTER_ID_RE.test(id)) return res.status(400).json({ error: 'id inválido' });
    const fpath = findSessionFile(id);
    if (!fpath) return res.json({ plan: null, updatedAt: null });
    const last = findLastToolUse(fpath, 'ExitPlanMode');
    const plan = typeof last?.input?.plan === 'string' ? last.input.plan : null;
    res.json({ plan, updatedAt: last?.timestamp || null });
  });

  app.get('/api/sessions/:id/footer', (req, res) => {
    res.set('Cache-Control', 'no-store');
    const id = String(req.params.id || '').trim();
    if (!FOOTER_ID_RE.test(id)) return res.status(400).json({ error: 'id inválido' });
    res.json(buildFooterPayload(id));
  });

  app.post('/api/sessions/:key/close', async (req, res) => {
    const key = String(req.params.key || '').trim();
    const entry = liveSessions.get(key);
    if (!entry) return res.status(404).json({ error: 'session not live' });
    try {
      entry.pty.kill();
    } catch {}
    const timeout = new Promise((resolve) => setTimeout(resolve, 3000));
    await Promise.race([entry.exited, timeout]);
    res.json({ ok: true });
  });
}

module.exports = { register };
