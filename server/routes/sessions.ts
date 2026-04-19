import fs from 'node:fs';
import path from 'node:path';
import type { SessionsListResponse } from '@shared/types';
import type { Express, Request, Response } from 'express';
import { buildFooterPayload, removeFooterCacheFor } from '../footer';
import { runGit } from '../git';
import { liveSessions } from '../live-sessions';
import { CLAUDE_PROJECTS } from '../paths';
import {
  fallbackSlugToCwd,
  findLastToolUse,
  findSessionFile,
  readSessionMeta,
  resolveSessionCwd,
} from '../sessions-meta';
import { broadcastInvalidate } from '../sse';
import { appState, saveState } from '../state';
import { FOOTER_ID_RE } from '../validators';

export function register(app: Express): void {
  app.get('/api/sessions', (_req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store, max-age=0');
    if (!fs.existsSync(CLAUDE_PROJECTS)) {
      const empty: SessionsListResponse = { projects: [] };
      return res.json(empty);
    }

    const projects = fs
      .readdirSync(CLAUDE_PROJECTS)
      .map((slug) => {
        const dir = path.join(CLAUDE_PROJECTS, slug);
        if (!fs.statSync(dir).isDirectory()) return null;

        const sessionFiles = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl'));
        let projectCwd: string | null = null;
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
      .filter((p): p is NonNullable<typeof p> => p !== null)
      .sort((a, b) => (b.sessions[0]?.mtime || 0) - (a.sessions[0]?.mtime || 0));

    res.json({ projects } satisfies SessionsListResponse);
  });

  app.post('/api/sessions/:id/archive', (req: Request, res: Response) => {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'id obrigatório' });
    appState.archived.add(id);
    saveState(appState);
    broadcastInvalidate();
    res.json({ ok: true, archived: true });
  });

  app.post('/api/sessions/:id/unarchive', (req: Request, res: Response) => {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'id obrigatório' });
    appState.archived.delete(id);
    saveState(appState);
    broadcastInvalidate();
    res.json({ ok: true, archived: false });
  });

  app.delete('/api/sessions/:id', (req: Request, res: Response) => {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'id obrigatório' });
    const fpath = findSessionFile(id);
    if (!fpath) return res.status(404).json({ error: 'sessão não encontrada' });
    try {
      fs.unlinkSync(fpath);
    } catch (err) {
      return res.status(500).json({ error: (err as Error).message });
    }
    removeFooterCacheFor(id);
    if (appState.archived.delete(id)) saveState(appState);
    broadcastInvalidate();
    res.json({ ok: true, deleted: true });
  });

  app.get('/api/sessions/:id/diff', (req: Request, res: Response) => {
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

  app.get('/api/sessions/:id/tasks', (req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store');
    const id = String(req.params.id || '').trim();
    if (!FOOTER_ID_RE.test(id)) return res.status(400).json({ error: 'id inválido' });
    const fpath = findSessionFile(id);
    if (!fpath) return res.json({ todos: [], updatedAt: null });
    const last = findLastToolUse(fpath, 'TodoWrite');
    const todos = Array.isArray(last?.input?.todos) ? last.input.todos : [];
    res.json({ todos, updatedAt: last?.timestamp || null });
  });

  app.get('/api/sessions/:id/plan', (req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store');
    const id = String(req.params.id || '').trim();
    if (!FOOTER_ID_RE.test(id)) return res.status(400).json({ error: 'id inválido' });
    const fpath = findSessionFile(id);
    if (!fpath) return res.json({ plan: null, updatedAt: null });
    const last = findLastToolUse(fpath, 'ExitPlanMode');
    const plan = typeof last?.input?.plan === 'string' ? last.input.plan : null;
    res.json({ plan, updatedAt: last?.timestamp || null });
  });

  app.get('/api/sessions/:id/footer', (req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store');
    const id = String(req.params.id || '').trim();
    if (!FOOTER_ID_RE.test(id)) return res.status(400).json({ error: 'id inválido' });
    res.json(buildFooterPayload(id));
  });

  app.post('/api/sessions/:key/close', async (req: Request, res: Response) => {
    const key = String(req.params.key || '').trim();
    const entry = liveSessions.get(key);
    if (!entry) return res.status(404).json({ error: 'session not live' });
    try {
      entry.pty.kill();
    } catch {}
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, 3000));
    await Promise.race([entry.exited, timeout]);
    res.json({ ok: true });
  });
}
