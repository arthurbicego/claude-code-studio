import fs from 'node:fs';
import path from 'node:path';
import { type NumStat, parseNumstat, runGitArgs } from './git';

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

export function pickMainWorktree(entries: WorktreeEntry[]): WorktreeEntry | null {
  for (const e of entries) {
    if (!e.detached && !e.bare && !e.prunable) return e;
  }
  return entries[0] || null;
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
