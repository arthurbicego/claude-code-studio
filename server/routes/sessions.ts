import fs from 'node:fs';
import type { SessionsListResponse } from '@shared/types';
import type { Express, Request, Response } from 'express';
import { ERR, sendError, sendInternalError } from '../errors';
import { buildFooterPayload, removeFooterCacheFor } from '../footer';
import { runGitArgs } from '../git';
import { liveSessions, terminateLiveSession } from '../live-sessions';
import { CLAUDE_PROJECTS } from '../paths';
import {
  findLastToolUse,
  findSessionFile,
  listProjectsWithSessions,
  resolveSessionCwd,
} from '../sessions-meta';
import { broadcastInvalidate } from '../sse';
import { appState, saveState } from '../state';
import { FOOTER_ID_RE } from '../validators';
import { projectWorktreeRef } from '../worktrees';
import { cleanupAttachmentsForSession } from './attachments';

export function register(app: Express): void {
  app.get('/api/sessions', (_req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store, max-age=0');
    const rawProjects = listProjectsWithSessions(CLAUDE_PROJECTS, appState.archived);
    const projects = rawProjects.map((p) => ({ ...p, worktreeOf: projectWorktreeRef(p.cwd) }));
    res.json({ projects } satisfies SessionsListResponse);
  });

  app.post('/api/sessions/:id/archive', (req: Request, res: Response) => {
    const id = String(req.params.id || '').trim();
    if (!id) return sendError(res, 400, ERR.SESSION_ID_REQUIRED, 'session id is required');
    if (!FOOTER_ID_RE.test(id))
      return sendError(res, 400, ERR.SESSION_ID_INVALID, 'invalid session id');
    // Don't reset the archive timestamp if the id is already archived: re-archiving on every
    // call would let a caller indefinitely postpone the auto-purge cron by spamming this route.
    if (appState.archived.has(id)) {
      return res.json({ ok: true, archived: true });
    }
    // Refuse archive of an id that has no .jsonl on disk. Without this, a caller can spam
    // archive with arbitrary FOOTER_ID_RE-valid strings (any 1–128-char id passes the regex),
    // and each one becomes a permanent entry in appState.archived → state.json grows without
    // bound and the maintenance regex (PROJECT_SLUG_RE-style) would not necessarily clean it.
    if (!findSessionFile(id))
      return sendError(res, 404, ERR.SESSION_NOT_FOUND, 'session not found');
    appState.archived.set(id, Date.now());
    saveState(appState);
    broadcastInvalidate();
    res.json({ ok: true, archived: true });
  });

  app.post('/api/sessions/:id/unarchive', (req: Request, res: Response) => {
    const id = String(req.params.id || '').trim();
    if (!id) return sendError(res, 400, ERR.SESSION_ID_REQUIRED, 'session id is required');
    if (!FOOTER_ID_RE.test(id))
      return sendError(res, 400, ERR.SESSION_ID_INVALID, 'invalid session id');
    // Idempotent: if the id wasn't archived, skip the persist + SSE broadcast to avoid noise.
    if (!appState.archived.delete(id)) {
      return res.json({ ok: true, archived: false });
    }
    saveState(appState);
    broadcastInvalidate();
    res.json({ ok: true, archived: false });
  });

  app.delete('/api/sessions/:id', async (req: Request, res: Response) => {
    const id = String(req.params.id || '').trim();
    if (!id) return sendError(res, 400, ERR.SESSION_ID_REQUIRED, 'session id is required');
    if (!FOOTER_ID_RE.test(id))
      return sendError(res, 400, ERR.SESSION_ID_INVALID, 'invalid session id');
    const fpath = findSessionFile(id);
    if (!fpath) return sendError(res, 404, ERR.SESSION_NOT_FOUND, 'session not found');
    // Kill the PTY first so it cannot re-materialize the .jsonl after we unlink it.
    await terminateLiveSession(id);
    // The terminate has a 3 s timeout; if the PTY did not exit and the user re-opened a
    // session with the same id during that window, liveSessions.has(id) is true again. In
    // that case we must NOT unlink the freshly-recreated .jsonl — same defense the M4 fix
    // added to the purge loop.
    if (liveSessions.has(id)) {
      return sendError(
        res,
        409,
        ERR.SESSION_NOT_LIVE,
        'session is live again — try again',
      );
    }
    try {
      fs.unlinkSync(fpath);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') return sendInternalError(res, err);
    }
    cleanupAttachmentsForSession(id);
    removeFooterCacheFor(id);
    if (appState.archived.delete(id)) saveState(appState);
    broadcastInvalidate();
    res.json({ ok: true, deleted: true });
  });

  app.get('/api/sessions/:id/diff', (req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store');
    const id = String(req.params.id || '').trim();
    if (!FOOTER_ID_RE.test(id))
      return sendError(res, 400, ERR.SESSION_ID_INVALID, 'invalid session id');
    const cwd = resolveSessionCwd(id);
    if (!cwd || !fs.existsSync(cwd)) {
      return res.json({ cwd: null, branch: null, unstaged: '', staged: '', untracked: [] });
    }
    const branch = runGitArgs(cwd, ['symbolic-ref', '--short', 'HEAD']).trim() || null;
    const unstaged = runGitArgs(cwd, ['diff', '--no-color']);
    const staged = runGitArgs(cwd, ['diff', '--no-color', '--staged']);
    const untrackedRaw = runGitArgs(cwd, ['ls-files', '--others', '--exclude-standard']);
    const untracked = untrackedRaw
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    res.json({ cwd, branch, unstaged, staged, untracked });
  });

  app.get('/api/sessions/:id/tasks', (req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store');
    const id = String(req.params.id || '').trim();
    if (!FOOTER_ID_RE.test(id))
      return sendError(res, 400, ERR.SESSION_ID_INVALID, 'invalid session id');
    const fpath = findSessionFile(id);
    if (!fpath) return res.json({ todos: [], updatedAt: null });
    const last = findLastToolUse(fpath, 'TodoWrite');
    const todos = Array.isArray(last?.input?.todos) ? last.input.todos : [];
    res.json({ todos, updatedAt: last?.timestamp || null });
  });

  app.get('/api/sessions/:id/plan', (req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store');
    const id = String(req.params.id || '').trim();
    if (!FOOTER_ID_RE.test(id))
      return sendError(res, 400, ERR.SESSION_ID_INVALID, 'invalid session id');
    const fpath = findSessionFile(id);
    if (!fpath) return res.json({ plan: null, updatedAt: null });
    const last = findLastToolUse(fpath, 'ExitPlanMode');
    const plan = typeof last?.input?.plan === 'string' ? last.input.plan : null;
    res.json({ plan, updatedAt: last?.timestamp || null });
  });

  app.get('/api/sessions/:id/footer', (req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store');
    const id = String(req.params.id || '').trim();
    if (!FOOTER_ID_RE.test(id))
      return sendError(res, 400, ERR.SESSION_ID_INVALID, 'invalid session id');
    res.json(buildFooterPayload(id));
  });

  app.post('/api/sessions/:key/close', async (req: Request, res: Response) => {
    const key = String(req.params.key || '').trim();
    if (!FOOTER_ID_RE.test(key))
      return sendError(res, 400, ERR.SESSION_ID_INVALID, 'invalid session key');
    const entry = liveSessions.get(key);
    if (!entry) return sendError(res, 404, ERR.SESSION_NOT_LIVE, 'session is not live');
    try {
      entry.pty.kill();
    } catch {
      // PTY may have exited between the lookup and kill.
    }
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, 3000));
    await Promise.race([entry.exited, timeout]);
    res.json({ ok: true });
  });
}
