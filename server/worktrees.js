const fs = require('node:fs');
const path = require('node:path');
const { runGitArgs } = require('./git');
const { parseNumstat } = require('./git');

function listWorktrees(cwd) {
  const raw = runGitArgs(cwd, ['worktree', 'list', '--porcelain']);
  if (!raw) return [];
  const entries = [];
  let current = null;
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

function worktreeStatus(wtPath) {
  if (!wtPath || !fs.existsSync(wtPath)) return { clean: true, modifiedCount: 0 };
  const status = runGitArgs(wtPath, ['status', '--porcelain']);
  const lines = status
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  return { clean: lines.length === 0, modifiedCount: lines.length };
}

function worktreeAheadBehind(wtPath, base) {
  if (!wtPath || !base) return { ahead: 0, behind: 0 };
  const out = runGitArgs(wtPath, ['rev-list', '--left-right', '--count', `${base}...HEAD`]).trim();
  if (!out) return { ahead: 0, behind: 0 };
  const parts = out.split(/\s+/);
  if (parts.length !== 2) return { ahead: 0, behind: 0 };
  return { behind: parseInt(parts[0], 10) || 0, ahead: parseInt(parts[1], 10) || 0 };
}

function worktreeDiffStat(wtPath, base) {
  if (!wtPath || !base) return { added: 0, removed: 0 };
  const raw = runGitArgs(wtPath, ['diff', '--numstat', `${base}...HEAD`]);
  return parseNumstat(raw);
}

function guessDefaultBranch(cwd) {
  const head = runGitArgs(cwd, ['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD']).trim();
  if (head) return head.replace(/^refs\/remotes\//, '');
  for (const cand of ['main', 'master']) {
    if (runGitArgs(cwd, ['rev-parse', '--verify', '--quiet', cand]).trim()) return cand;
  }
  return '';
}

function detectWorktree(cwd) {
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

function pickMainWorktree(entries) {
  for (const e of entries) {
    if (!e.detached && !e.bare && !e.prunable) return e;
  }
  return entries[0] || null;
}

module.exports = {
  listWorktrees,
  worktreeStatus,
  worktreeAheadBehind,
  worktreeDiffStat,
  guessDefaultBranch,
  detectWorktree,
  pickMainWorktree,
};
