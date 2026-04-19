import fs from 'node:fs';
import path from 'node:path';
import type { Worktree } from '@shared/types';
import type { Express, Request, Response } from 'express';
import { runGitArgs, runGitArgsOrThrow } from '../git';
import { ERR, sendError } from '../errors';
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
    if (!cwd) return sendError(res, 400, ERR.CWD_INVALID, 'invalid cwd');
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
      } catch {
        // Worktree directory may have been removed externally.
      }
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
    if (!cwd) return sendError(res, 400, ERR.CWD_INVALID, 'invalid cwd');
    const rawPath = typeof req.query.path === 'string' ? req.query.path : '';
    const resolved = path.resolve(rawPath);
    if (!isPathWithinCwd(resolved, cwd) || !fs.existsSync(resolved)) {
      return sendError(res, 400, ERR.WORKTREE_PATH_INVALID, 'invalid worktree path');
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
    if (!cwd) return sendError(res, 400, ERR.CWD_INVALID, 'invalid cwd');
    const rawPath = typeof req.query.path === 'string' ? req.query.path : '';
    const resolved = path.resolve(rawPath);
    if (!isPathWithinCwd(resolved, cwd)) {
      return sendError(res, 400, ERR.WORKTREE_PATH_OUTSIDE_CWD, 'worktree path outside cwd');
    }
    const force = req.query.force === '1' || req.query.force === 'true';
    const entries = listWorktrees(cwd);
    const main = pickMainWorktree(entries);
    if (main && realpathSafe(main.path) === realpathSafe(resolved)) {
      return sendError(
        res,
        400,
        ERR.WORKTREE_MAIN_REMOVE_FORBIDDEN,
        'cannot remove the main worktree',
      );
    }
    const counts = liveSessionWorkspaces();
    if ((counts.get(realpathSafe(resolved)) || 0) > 0) {
      return sendError(
        res,
        409,
        ERR.WORKTREE_HAS_ACTIVE_SESSIONS,
        'there are active sessions in this worktree',
      );
    }
    try {
      const args = ['worktree', 'remove'];
      if (force) args.push('--force');
      args.push(resolved);
      runGitArgsOrThrow(cwd, args);
    } catch (err) {
      const e = err as { stderr?: Buffer; message?: string };
      return sendError(
        res,
        500,
        ERR.GIT_COMMAND_FAILED,
        e.stderr?.toString() || e.message || 'git command failed',
      );
    }
    res.json({ ok: true });
  });

  app.post('/api/worktrees/commit', (req: Request, res: Response) => {
    const cwd = isAllowedProjectCwd(req.body?.cwd);
    if (!cwd) return sendError(res, 400, ERR.CWD_INVALID, 'invalid cwd');
    const rawPath = typeof req.body?.path === 'string' ? req.body.path : '';
    const resolved = path.resolve(rawPath);
    if (!isPathWithinCwd(resolved, cwd) || !fs.existsSync(resolved)) {
      return sendError(res, 400, ERR.WORKTREE_PATH_INVALID, 'invalid worktree path');
    }
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    if (!message || message.length > 4096) {
      return sendError(
        res,
        400,
        ERR.WORKTREE_COMMIT_MESSAGE_REQUIRED,
        'commit message is required (max 4096 chars)',
      );
    }
    try {
      runGitArgsOrThrow(resolved, ['add', '-A']);
      runGitArgsOrThrow(resolved, ['commit', '-m', message]);
    } catch (err) {
      const e = err as { stderr?: Buffer; message?: string };
      return sendError(
        res,
        500,
        ERR.GIT_COMMAND_FAILED,
        e.stderr?.toString() || e.message || 'git command failed',
      );
    }
    res.json({ ok: true });
  });

  app.post('/api/worktrees/discard', (req: Request, res: Response) => {
    const cwd = isAllowedProjectCwd(req.body?.cwd);
    if (!cwd) return sendError(res, 400, ERR.CWD_INVALID, 'invalid cwd');
    const rawPath = typeof req.body?.path === 'string' ? req.body.path : '';
    const resolved = path.resolve(rawPath);
    if (!isPathWithinCwd(resolved, cwd) || !fs.existsSync(resolved)) {
      return sendError(res, 400, ERR.WORKTREE_PATH_INVALID, 'invalid worktree path');
    }
    const entries = listWorktrees(cwd);
    const main = pickMainWorktree(entries);
    if (main && realpathSafe(main.path) === realpathSafe(resolved)) {
      return sendError(
        res,
        400,
        ERR.WORKTREE_MAIN_DISCARD_FORBIDDEN,
        'cannot discard the main worktree',
      );
    }
    const counts = liveSessionWorkspaces();
    if ((counts.get(realpathSafe(resolved)) || 0) > 0) {
      return sendError(
        res,
        409,
        ERR.WORKTREE_HAS_ACTIVE_SESSIONS,
        'there are active sessions in this worktree',
      );
    }
    try {
      runGitArgs(resolved, ['reset', '--hard', 'HEAD']);
      runGitArgs(resolved, ['clean', '-fd']);
      runGitArgsOrThrow(cwd, ['worktree', 'remove', '--force', resolved]);
    } catch (err) {
      const e = err as { stderr?: Buffer; message?: string };
      return sendError(
        res,
        500,
        ERR.GIT_COMMAND_FAILED,
        e.stderr?.toString() || e.message || 'git command failed',
      );
    }
    res.json({ ok: true });
  });

  app.post('/api/worktrees/merge', (req: Request, res: Response) => {
    const cwd = isAllowedProjectCwd(req.body?.cwd);
    if (!cwd) return sendError(res, 400, ERR.CWD_INVALID, 'invalid cwd');
    const rawPath = typeof req.body?.path === 'string' ? req.body.path : '';
    const resolved = path.resolve(rawPath);
    if (!isPathWithinCwd(resolved, cwd) || !fs.existsSync(resolved)) {
      return sendError(res, 400, ERR.WORKTREE_PATH_INVALID, 'invalid worktree path');
    }
    const rawBase = typeof req.body?.base === 'string' ? req.body.base.trim() : '';
    const base = rawBase && BRANCH_NAME_RE.test(rawBase) ? rawBase : guessDefaultBranch(cwd);
    if (!base)
      return sendError(res, 400, ERR.WORKTREE_BASE_NOT_DETECTED, 'could not determine base branch');

    const entries = listWorktrees(cwd);
    const main = pickMainWorktree(entries);
    if (!main) return sendError(res, 400, ERR.WORKTREE_MAIN_NOT_FOUND, 'main worktree not found');
    const mainPath = main.path;

    const branch = runGitArgs(resolved, ['symbolic-ref', '--short', 'HEAD']).trim();
    if (!branch || !BRANCH_NAME_RE.test(branch)) {
      return sendError(
        res,
        400,
        ERR.WORKTREE_BRANCH_NOT_DETECTED,
        'worktree branch could not be detected',
      );
    }

    const status = worktreeStatus(resolved);
    if (!status.clean) {
      return sendError(
        res,
        409,
        ERR.WORKTREE_NOT_CLEAN,
        'worktree has uncommitted changes — commit before merging',
        { which: 'worktree' },
      );
    }
    const mainStatus = worktreeStatus(mainPath);
    if (!mainStatus.clean) {
      return sendError(
        res,
        409,
        ERR.WORKTREE_NOT_CLEAN,
        'main worktree has uncommitted changes — sync before',
        { which: 'main' },
      );
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
      sendError(
        res,
        500,
        ERR.GIT_COMMAND_FAILED,
        e.stderr?.toString() || e.message || 'git command failed',
      );
    }
  });
}
