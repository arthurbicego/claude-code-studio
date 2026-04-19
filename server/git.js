const { execSync, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const UNTRACKED_MAX_BYTES = 2 * 1024 * 1024;

function runGit(cwd, args) {
  try {
    return execSync(`git --no-optional-locks ${args}`, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch {
    return '';
  }
}

function runGitArgs(cwd, args) {
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

function runGitArgsOrThrow(cwd, args) {
  return execFileSync('git', ['--no-optional-locks', ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 16 * 1024 * 1024,
  });
}

function parseNumstat(raw) {
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

function countTextLines(s) {
  if (!s) return 0;
  let n = 0;
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 10) n++;
  if (s.charCodeAt(s.length - 1) !== 10) n++;
  return n;
}

function gitInfo(cwd) {
  if (!cwd) return { branch: null, dirty: false };
  try {
    const branch =
      execSync('git --no-optional-locks symbolic-ref --short HEAD', {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim() || null;
    const status = execSync('git --no-optional-locks status --porcelain', {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return { branch, dirty: status.length > 0 };
  } catch {
    return { branch: null, dirty: false };
  }
}

function uncommittedLineStats(cwd) {
  if (!cwd || !fs.existsSync(cwd)) return { added: null, removed: null };
  const tracked = parseNumstat(runGit(cwd, 'diff --numstat HEAD'));
  let added = tracked.added;
  const removed = tracked.removed;
  const untrackedRaw = runGit(cwd, 'ls-files --others --exclude-standard');
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
    } catch {}
  }
  return { added, removed };
}

module.exports = {
  UNTRACKED_MAX_BYTES,
  runGit,
  runGitArgs,
  runGitArgsOrThrow,
  parseNumstat,
  countTextLines,
  gitInfo,
  uncommittedLineStats,
};
