import fs from 'node:fs';
import path from 'node:path';
import type { ProjectWorktreeRef } from '../shared/types';
import { type NumStat, parseNumstat, runGitArgs, runGitArgsOrThrow } from './git';
import { realpathSafe } from './paths';

export type WorktreeEntry = {
  path: string;
  branch: string | null;
  head: string | null;
  bare: boolean;
  detached: boolean;
  prunable: boolean;
};

export function listWorktrees(cwd: string): WorktreeEntry[] {
  const raw = runGitArgs(cwd, ['worktree', 'list', '--porcelain']);
  if (!raw) return [];
  const entries: WorktreeEntry[] = [];
  let current: WorktreeEntry | null = null;
  const flush = () => {
    if (current) {
      entries.push(current);
      current = null;
    }
  };
  for (const rawLine of raw.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    if (!line) {
      flush();
      continue;
    }
    const sp = line.indexOf(' ');
    const key = sp === -1 ? line : line.slice(0, sp);
    const val = sp === -1 ? '' : line.slice(sp + 1);
    if (key === 'worktree') {
      flush();
      current = {
        path: val,
        branch: null,
        head: null,
        bare: false,
        detached: false,
        prunable: false,
      };
    } else if (current && key === 'HEAD') current.head = val;
    else if (current && key === 'branch') current.branch = val.replace(/^refs\/heads\//, '');
    else if (current && key === 'bare') current.bare = true;
    else if (current && key === 'detached') current.detached = true;
    else if (current && key === 'prunable') current.prunable = true;
  }
  flush();
  return entries;
}

export type WorktreeStatus = { clean: boolean; modifiedCount: number };

export function worktreeStatus(wtPath: string): WorktreeStatus {
  if (!wtPath || !fs.existsSync(wtPath)) return { clean: true, modifiedCount: 0 };
  const status = runGitArgs(wtPath, ['status', '--porcelain']);
  const lines = status
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  return { clean: lines.length === 0, modifiedCount: lines.length };
}

export function worktreeAheadBehind(
  wtPath: string,
  base: string,
): { ahead: number; behind: number } {
  if (!wtPath || !base) return { ahead: 0, behind: 0 };
  const out = runGitArgs(wtPath, ['rev-list', '--left-right', '--count', `${base}...HEAD`]).trim();
  if (!out) return { ahead: 0, behind: 0 };
  const parts = out.split(/\s+/);
  if (parts.length !== 2) return { ahead: 0, behind: 0 };
  return { behind: parseInt(parts[0], 10) || 0, ahead: parseInt(parts[1], 10) || 0 };
}

export function worktreeDiffStat(wtPath: string, base: string): NumStat {
  if (!wtPath || !base) return { added: 0, removed: 0 };
  const raw = runGitArgs(wtPath, ['diff', '--numstat', `${base}...HEAD`]);
  return parseNumstat(raw);
}

export function guessDefaultBranch(cwd: string): string {
  const head = runGitArgs(cwd, ['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD']).trim();
  if (head) return head.replace(/^refs\/remotes\//, '');
  for (const cand of ['main', 'master']) {
    if (runGitArgs(cwd, ['rev-parse', '--verify', '--quiet', cand]).trim()) return cand;
  }
  return '';
}

export type WorktreeRefDetected = { path: string; name: string };

export function detectWorktree(cwd: string | null): WorktreeRefDetected | null {
  if (!cwd || !fs.existsSync(cwd)) return null;
  const gitDir = runGitArgs(cwd, ['rev-parse', '--git-dir']).trim();
  const commonDir = runGitArgs(cwd, ['rev-parse', '--git-common-dir']).trim();
  if (!gitDir || !commonDir) return null;
  const absGit = path.isAbsolute(gitDir) ? gitDir : path.resolve(cwd, gitDir);
  const absCommon = path.isAbsolute(commonDir) ? commonDir : path.resolve(cwd, commonDir);
  try {
    const realGit = fs.realpathSync(absGit);
    const realCommon = fs.realpathSync(absCommon);
    if (realGit === realCommon) return null;
  } catch {
    if (absGit === absCommon) return null;
  }
  const top = runGitArgs(cwd, ['rev-parse', '--show-toplevel']).trim();
  if (!top) return null;
  return { path: top, name: path.basename(top) };
}

/**
 * Identify which entry from `git worktree list` is the main worktree.
 *
 * Asks git directly for the common `.git` directory whose parent is, by definition, the main
 * worktree. The previous "first non-detached, non-bare, non-prunable" heuristic mis-classified
 * the main worktree as a linked one whenever the user was mid-rebase / mid-bisect there
 * (HEAD detached), and could lead to operations like delete-main being silently allowed.
 *
 * `probeCwd` should be any cwd inside the same repo (most callers pass the cwd that produced
 * `entries` already). Falls back to entries[0].path if not supplied. Falls back to the old
 * heuristic if the git probe fails (unusual repo layout, bare repo edge case).
 */
export function pickMainWorktree(
  entries: WorktreeEntry[],
  probeCwd?: string,
): WorktreeEntry | null {
  if (entries.length === 0) return null;
  const probe = probeCwd ?? entries[0]?.path;
  if (probe) {
    const commonDir = runGitArgs(probe, ['rev-parse', '--git-common-dir']).trim();
    if (commonDir) {
      const absCommon = path.isAbsolute(commonDir) ? commonDir : path.resolve(probe, commonDir);
      const mainReal = realpathSafe(path.dirname(realpathSafe(absCommon)));
      for (const e of entries) {
        if (realpathSafe(e.path) === mainReal) return e;
      }
    }
  }
  for (const e of entries) {
    if (!e.detached && !e.bare && !e.prunable) return e;
  }
  return entries[0] || null;
}

const GHOST_WORKTREE_SEGMENT_RE = /(.+)\/\.claude\/worktrees\/[^/]+\/?$/;

/**
 * If `cwd` is a linked worktree of another git repo, returns a ref pointing at
 * the main worktree path and the branch currently checked out in `cwd`.
 *
 * Handles two cases:
 *   1. The worktree still exists on disk: asks git directly for the main
 *      worktree path and current branch.
 *   2. The worktree was removed (merged + cleaned up) but sessions recorded
 *      its `cwd`: recognizes the app's `<parent>/.claude/worktrees/<name>`
 *      convention, validates that `<parent>` is a git main worktree, and
 *      returns it with a null branch (the branch is unrecoverable once the
 *      worktree is gone).
 *
 * Returns null when `cwd` is the main worktree itself, isn't a git repo, or
 * doesn't match the ghost pattern.
 */
export function projectWorktreeRef(cwd: string): ProjectWorktreeRef | null {
  if (!cwd) return null;
  if (!fs.existsSync(cwd)) return ghostWorktreeRef(cwd);
  const entries = listWorktrees(cwd);
  if (entries.length <= 1) return null;
  const main = pickMainWorktree(entries, cwd);
  if (!main) return null;
  const mainReal = realpathSafe(main.path);
  const ownReal = realpathSafe(cwd);
  if (mainReal === ownReal) return null;
  const branch = runGitArgs(cwd, ['symbolic-ref', '--short', 'HEAD']).trim();
  return { parentCwd: main.path, branch: branch || null };
}

function ghostWorktreeRef(cwd: string): ProjectWorktreeRef | null {
  const match = GHOST_WORKTREE_SEGMENT_RE.exec(cwd);
  if (!match) return null;
  const parent = match[1];
  if (!fs.existsSync(parent)) return null;
  const gitDir = runGitArgs(parent, ['rev-parse', '--git-dir']).trim();
  const commonDir = runGitArgs(parent, ['rev-parse', '--git-common-dir']).trim();
  if (!gitDir || !commonDir) return null;
  const absGit = path.isAbsolute(gitDir) ? gitDir : path.resolve(parent, gitDir);
  const absCommon = path.isAbsolute(commonDir) ? commonDir : path.resolve(parent, commonDir);
  if (realpathSafe(absGit) !== realpathSafe(absCommon)) return null;
  return { parentCwd: parent, branch: null };
}

export function branchUpstream(cwd: string, branch: string): string | null {
  const out = runGitArgs(cwd, [
    'for-each-ref',
    '--format=%(upstream:short)',
    `refs/heads/${branch}`,
  ]).trim();
  return out || null;
}

export function branchExists(cwd: string, branch: string): boolean {
  return (
    runGitArgs(cwd, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`]).trim().length > 0
  );
}

/**
 * Tries to delete a local branch. With `force=false` (default), `git branch -d`
 * refuses unmerged branches — acts as a safety net, leaving anything with lost
 * work alone. With `force=true`, uses `-D` (unsafe delete).
 * Returns true if the branch is gone after the call.
 */
export function deleteLocalBranch(
  cwd: string,
  branch: string,
  opts: { force?: boolean } = {},
): boolean {
  const flag = opts.force ? '-D' : '-d';
  runGitArgs(cwd, ['branch', flag, branch]);
  return !branchExists(cwd, branch);
}

/**
 * Push `branch` to its tracked remote. When no upstream is set yet, sets one on
 * `origin` with `-u`. Returns the remote it pushed to, or throws on failure.
 */
export function pushBranch(cwd: string, branch: string): { remote: string; ref: string } {
  const upstream = branchUpstream(cwd, branch);
  if (upstream) {
    const [remote, ...rest] = upstream.split('/');
    const ref = rest.join('/') || branch;
    runGitArgsOrThrow(cwd, ['push', remote, `${branch}:${ref}`]);
    return { remote, ref };
  }
  runGitArgsOrThrow(cwd, ['push', '-u', 'origin', branch]);
  return { remote: 'origin', ref: branch };
}

/**
 * Delete the remote-tracking branch on its upstream remote. Throws if there is
 * no upstream set — caller should check with `branchUpstream` first.
 */
export function deleteRemoteBranch(cwd: string, branch: string): { remote: string; ref: string } {
  const upstream = branchUpstream(cwd, branch);
  if (!upstream) throw new Error('no upstream configured for this branch');
  const [remote, ...rest] = upstream.split('/');
  const ref = rest.join('/') || branch;
  runGitArgsOrThrow(cwd, ['push', remote, '--delete', ref]);
  return { remote, ref };
}
