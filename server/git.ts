import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const UNTRACKED_MAX_BYTES = 2 * 1024 * 1024;

export function runGitArgs(cwd: string, args: string[]): string {
  try {
    return execFileSync('git', ['--no-optional-locks', ...args], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch {
    return '';
  }
}

export function runGitArgsOrThrow(cwd: string, args: string[]): string {
  return execFileSync('git', ['--no-optional-locks', ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 16 * 1024 * 1024,
  });
}

export type NumStat = { added: number; removed: number };

export function parseNumstat(raw: string): NumStat {
  let added = 0;
  let removed = 0;
  for (const line of raw.split('\n')) {
    if (!line) continue;
    const [a, r] = line.split('\t');
    if (a === '-' || r === '-') continue;
    const ai = parseInt(a, 10);
    const ri = parseInt(r, 10);
    if (Number.isFinite(ai)) added += ai;
    if (Number.isFinite(ri)) removed += ri;
  }
  return { added, removed };
}

export function countTextLines(s: string): number {
  if (!s) return 0;
  let n = 0;
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 10) n++;
  if (s.charCodeAt(s.length - 1) !== 10) n++;
  return n;
}

export type GitInfo = { branch: string | null; dirty: boolean };

export function gitInfo(cwd: string | null): GitInfo {
  if (!cwd) return { branch: null, dirty: false };
  const branch = runGitArgs(cwd, ['symbolic-ref', '--short', 'HEAD']).trim() || null;
  const status = runGitArgs(cwd, ['status', '--porcelain']);
  return { branch, dirty: status.length > 0 };
}

export type UncommittedLineStats = { added: number | null; removed: number | null };

export function uncommittedLineStats(cwd: string | null): UncommittedLineStats {
  if (!cwd || !fs.existsSync(cwd)) return { added: null, removed: null };
  const tracked = parseNumstat(runGitArgs(cwd, ['diff', '--numstat', 'HEAD']));
  let added = tracked.added;
  const removed = tracked.removed;
  const untrackedRaw = runGitArgs(cwd, ['ls-files', '--others', '--exclude-standard']);
  for (const rel of untrackedRaw
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)) {
    try {
      const p = path.join(cwd, rel);
      const st = fs.statSync(p);
      if (!st.isFile() || st.size > UNTRACKED_MAX_BYTES) continue;
      const content = fs.readFileSync(p, 'utf8');
      if (content.indexOf('\0') !== -1) continue;
      added += countTextLines(content);
    } catch {
      // Untracked file vanished or unreadable between `ls-files` and `stat` — skip.
    }
  }
  return { added, removed };
}
