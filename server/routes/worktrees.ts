import fs from 'node:fs';
import path from 'node:path';
import type { Worktree } from '@shared/types';
import type { Express, Request, Response } from 'express';
import { runGitArgs, runGitArgsOrThrow } from '../git';
import { liveSessionWorkspaces } from '../live-sessions';
import { isAllowedProjectCwd, isPathWithinCwd, realpathSafe } from '../paths';
import { BRANCH_NAME_RE } from '../validators';
import {
  guessDefaultBranch,
  listWorktrees,
  pickMainWorktree,
  worktreeAheadBehind,
  worktreeDiffStat,
  worktreeStatus,
} from '../worktrees';

export function register(app: Express): void {
  app.get('/api/worktrees', (req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store');
    const cwd = isAllowedProjectCwd(req.query.cwd);
    if (!cwd) return res.status(400).json({ error: 'cwd inválido' });
    const rawBase = typeof req.query.base === 'string' ? req.query.base.trim() : '';
    const base = rawBase && BRANCH_NAME_RE.test(rawBase) ? rawBase : guessDefaultBranch(cwd);

    const entries = listWorktrees(cwd);
    const main = pickMainWorktree(entries);
    const mainRealPath = main ? realpathSafe(main.path) : realpathSafe(cwd);
    const workspaceCounts = liveSessionWorkspaces();

    const worktrees: Worktree[] = entries.map((e) => {
      const realPath = realpathSafe(e.path);
      const isMain = realPath === mainRealPath;
      const status = worktreeStatus(e.path);
      let ahead = 0;
      let behind = 0;
      let linesAdded = 0;
      let linesRemoved = 0;
      if (!isMain && base && !e.detached && e.branch) {
        const ab = worktreeAheadBehind(e.path, base);
        ahead = ab.ahead;
        behind = ab.behind;
        const ns = worktreeDiffStat(e.path, base);
        linesAdded = ns.added;
        linesRemoved = ns.removed;
      }
      let mtime: number | null = null;
      try {
        mtime = fs.statSync(e.path).mtimeMs;
      } catch {}
      return {
        path: e.path,
        branch: e.branch,
        head: e.head,
        detached: e.detached,
        prunable: e.prunable,
        isMain,
        clean: status.clean,
        modifiedCount: status.modifiedCount,
        ahead,
        behind,
        linesAdded,
        linesRemoved,
        liveSessionCount: workspaceCounts.get(realPath) || 0,
        mtime,
      };
    });

    res.json({ cwd, base: base || null, mainPath: main ? main.path : null, worktrees });
  });

  app.get('/api/worktrees/diff', (req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store');
    const cwd = isAllowedProjectCwd(req.query.cwd);
    if (!cwd) return res.status(400).json({ error: 'cwd inválido' });
    const rawPath = typeof req.query.path === 'string' ? req.query.path : '';
    const resolved = path.resolve(rawPath);
    if (!isPathWithinCwd(resolved, cwd) || !fs.existsSync(resolved)) {
      return res.status(400).json({ error: 'worktree path inválido' });
    }
    const rawBase = typeof req.query.base === 'string' ? req.query.base.trim() : '';
    const base = rawBase && BRANCH_NAME_RE.test(rawBase) ? rawBase : guessDefaultBranch(cwd);
    const branch = runGitArgs(resolved, ['symbolic-ref', '--short', 'HEAD']).trim() || null;
    const committed = base ? runGitArgs(resolved, ['diff', '--no-color', `${base}...HEAD`]) : '';
    const unstaged = runGitArgs(resolved, ['diff', '--no-color']);
    const staged = runGitArgs(resolved, ['diff', '--no-color', '--staged']);
    const untrackedRaw = runGitArgs(resolved, ['ls-files', '--others', '--exclude-standard']);
    const untracked = untrackedRaw
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    res.json({ cwd: resolved, branch, base: base || null, committed, unstaged, staged, untracked });
  });

  app.delete('/api/worktrees', (req: Request, res: Response) => {
    const cwd = isAllowedProjectCwd(req.query.cwd);
    if (!cwd) return res.status(400).json({ error: 'cwd inválido' });
    const rawPath = typeof req.query.path === 'string' ? req.query.path : '';
    const resolved = path.resolve(rawPath);
    if (!isPathWithinCwd(resolved, cwd)) {
      return res.status(400).json({ error: 'worktree path fora do cwd' });
    }
    const force = req.query.force === '1' || req.query.force === 'true';
    const entries = listWorktrees(cwd);
    const main = pickMainWorktree(entries);
    if (main && realpathSafe(main.path) === realpathSafe(resolved)) {
      return res.status(400).json({ error: 'não é possível remover o worktree principal' });
    }
    const counts = liveSessionWorkspaces();
    if ((counts.get(realpathSafe(resolved)) || 0) > 0) {
      return res.status(409).json({ error: 'há sessões ativas neste worktree' });
    }
    try {
      const args = ['worktree', 'remove'];
      if (force) args.push('--force');
      args.push(resolved);
      runGitArgsOrThrow(cwd, args);
    } catch (err) {
      const e = err as { stderr?: Buffer; message?: string };
      return res.status(500).json({ error: e.stderr?.toString() || e.message });
    }
    res.json({ ok: true });
  });

  app.post('/api/worktrees/commit', (req: Request, res: Response) => {
    const cwd = isAllowedProjectCwd(req.body?.cwd);
    if (!cwd) return res.status(400).json({ error: 'cwd inválido' });
    const rawPath = typeof req.body?.path === 'string' ? req.body.path : '';
    const resolved = path.resolve(rawPath);
    if (!isPathWithinCwd(resolved, cwd) || !fs.existsSync(resolved)) {
      return res.status(400).json({ error: 'worktree path inválido' });
    }
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    if (!message || message.length > 4096) {
      return res.status(400).json({ error: 'mensagem obrigatória (máx 4096 chars)' });
    }
    try {
      runGitArgsOrThrow(resolved, ['add', '-A']);
      runGitArgsOrThrow(resolved, ['commit', '-m', message]);
    } catch (err) {
      const e = err as { stderr?: Buffer; message?: string };
      return res.status(500).json({ error: e.stderr?.toString() || e.message });
    }
    res.json({ ok: true });
  });

  app.post('/api/worktrees/discard', (req: Request, res: Response) => {
    const cwd = isAllowedProjectCwd(req.body?.cwd);
    if (!cwd) return res.status(400).json({ error: 'cwd inválido' });
    const rawPath = typeof req.body?.path === 'string' ? req.body.path : '';
    const resolved = path.resolve(rawPath);
    if (!isPathWithinCwd(resolved, cwd) || !fs.existsSync(resolved)) {
      return res.status(400).json({ error: 'worktree path inválido' });
    }
    const entries = listWorktrees(cwd);
    const main = pickMainWorktree(entries);
    if (main && realpathSafe(main.path) === realpathSafe(resolved)) {
      return res.status(400).json({ error: 'não é possível descartar o worktree principal' });
    }
    const counts = liveSessionWorkspaces();
    if ((counts.get(realpathSafe(resolved)) || 0) > 0) {
      return res.status(409).json({ error: 'há sessões ativas neste worktree' });
    }
    try {
      runGitArgs(resolved, ['reset', '--hard', 'HEAD']);
      runGitArgs(resolved, ['clean', '-fd']);
      runGitArgsOrThrow(cwd, ['worktree', 'remove', '--force', resolved]);
    } catch (err) {
      const e = err as { stderr?: Buffer; message?: string };
      return res.status(500).json({ error: e.stderr?.toString() || e.message });
    }
    res.json({ ok: true });
  });

  app.post('/api/worktrees/merge', (req: Request, res: Response) => {
    const cwd = isAllowedProjectCwd(req.body?.cwd);
    if (!cwd) return res.status(400).json({ error: 'cwd inválido' });
    const rawPath = typeof req.body?.path === 'string' ? req.body.path : '';
    const resolved = path.resolve(rawPath);
    if (!isPathWithinCwd(resolved, cwd) || !fs.existsSync(resolved)) {
      return res.status(400).json({ error: 'worktree path inválido' });
    }
    const rawBase = typeof req.body?.base === 'string' ? req.body.base.trim() : '';
    const base = rawBase && BRANCH_NAME_RE.test(rawBase) ? rawBase : guessDefaultBranch(cwd);
    if (!base) return res.status(400).json({ error: 'não foi possível determinar a base' });

    const entries = listWorktrees(cwd);
    const main = pickMainWorktree(entries);
    if (!main) return res.status(400).json({ error: 'worktree principal não encontrado' });
    const mainPath = main.path;

    const branch = runGitArgs(resolved, ['symbolic-ref', '--short', 'HEAD']).trim();
    if (!branch || !BRANCH_NAME_RE.test(branch)) {
      return res.status(400).json({ error: 'branch do worktree não detectada' });
    }

    const status = worktreeStatus(resolved);
    if (!status.clean) {
      return res.status(409).json({
        error: 'worktree tem mudanças não commitadas — commite antes de mergear',
      });
    }
    const mainStatus = worktreeStatus(mainPath);
    if (!mainStatus.clean) {
      return res.status(409).json({
        error: 'worktree principal tem mudanças não commitadas — sincronize antes',
      });
    }

    const baseLocal = base.replace(/^origin\//, '');
    const mainBranch = runGitArgs(mainPath, ['symbolic-ref', '--short', 'HEAD']).trim();
    let switched = false;
    try {
      if (mainBranch !== baseLocal) {
        runGitArgsOrThrow(mainPath, ['switch', baseLocal]);
        switched = true;
      }
      runGitArgsOrThrow(mainPath, ['merge', '--ff-only', branch]);
      res.json({ ok: true, base: baseLocal, branch, switched });
    } catch (err) {
      const e = err as { stderr?: Buffer; message?: string };
      res.status(500).json({ error: e.stderr?.toString() || e.message });
    }
  });
}
