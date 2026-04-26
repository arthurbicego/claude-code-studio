import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const HOME_DIR = os.homedir();
export const HOME_DIR_REAL = (() => {
  try {
    return fs.realpathSync(HOME_DIR);
  } catch {
    return HOME_DIR;
  }
})();

export const CLAUDE_PROJECTS = path.join(HOME_DIR, '.claude', 'projects');
export const USER_CLAUDE_DIR = path.join(HOME_DIR, '.claude');
export const USER_AGENTS_DIR = path.join(HOME_DIR, '.claude', 'agents');
export const USER_SKILLS_DIR = path.join(HOME_DIR, '.claude', 'skills');
export const GLOBAL_CLAUDE_MD = path.join(HOME_DIR, '.claude', 'CLAUDE.md');

export const CONFIG_DIR = path.join(HOME_DIR, '.cockpit-for-claude-code');
export const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
export const STATE_FILE = path.join(CONFIG_DIR, 'state.json');
export const ATTACHMENTS_DIR = path.join(CONFIG_DIR, 'attachments');

export const STATUSLINE_TAP = path.join(__dirname, 'scripts', 'statusline-tap.sh');
export const STATUSLINE_CACHE_DIR = path.join(HOME_DIR, '.cockpit-for-claude-code', 'statusline-cache');
export const STATUSLINE_GLOBAL_META = path.join(
  HOME_DIR,
  '.cockpit-for-claude-code',
  'global-meta.json',
);

export function realpathSafe(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch {
    return p;
  }
}

export function isAllowedProjectCwd(rawCwd: unknown): string | null {
  if (typeof rawCwd !== 'string' || !rawCwd.trim()) return null;
  let resolved: string;
  try {
    resolved = path.resolve(rawCwd);
    if (fs.existsSync(resolved)) resolved = fs.realpathSync(resolved);
  } catch {
    return null;
  }
  const within =
    (resolved + path.sep).startsWith(HOME_DIR_REAL + path.sep) || resolved === HOME_DIR_REAL;
  if (!within) return null;
  return resolved;
}

export function isPathWithinCwd(candidate: string, cwd: string): boolean {
  if (!candidate || !cwd) return false;
  const resolved = realpathSafe(path.resolve(candidate));
  const base = realpathSafe(path.resolve(cwd));
  return resolved === base || resolved.startsWith(base + path.sep);
}

// Mirror the Claude Code "projects" slug convention: leading slash becomes leading dash, then
// every remaining slash is replaced by a dash. Used only to test whether a cwd has been
// registered in ~/.claude/projects, never to read files under that path.
function cwdToProjectSlug(cwd: string): string {
  return cwd.replace(/\//g, '-');
}

// Reserved dirs need to be compared against `resolved`, which has been through realpath in
// isAllowedProjectCwd. On macOS `$HOME` is typically `/Users/<name>` but its realpath is
// `/private/Users/<name>`; USER_CLAUDE_DIR / CONFIG_DIR are joined off un-realpath'd HOME_DIR
// so they keep the `/Users/<name>/...` prefix, and the startsWith comparison would never
// match. Compute the reserved set off HOME_DIR_REAL instead so both sides share the same
// canonical prefix even when $HOME is a symlink.
const PROJECT_SCOPED_RESERVED_DIRS = [
  path.join(HOME_DIR_REAL, '.claude'),
  path.join(HOME_DIR_REAL, '.cockpit-for-claude-code'),
];

/**
 * Stricter form of `isAllowedProjectCwd` used by routes that mutate project-scoped artifacts
 * (CLAUDE.md, .claude/settings*.json, .claude/agents/, .claude/skills/). Accepts a cwd only if:
 *   1. It passes the home-containment check, AND
 *   2. It is not $HOME itself, ~/.claude, or ~/.cockpit-for-claude-code (or any subpath of
 *      those config trees), AND
 *   3. It looks like a real project — has a `.git` entry, OR is already registered as a
 *      Claude Code project at ~/.claude/projects/<slug>.
 *
 * The looser `isAllowedProjectCwd` is kept for read-only listings (hierarchy, GET memory, etc.)
 * where any inside-home directory is fair game.
 */
export function isProjectScopedCwd(rawCwd: unknown): string | null {
  const resolved = isAllowedProjectCwd(rawCwd);
  if (!resolved) return null;
  if (resolved === HOME_DIR_REAL) return null;
  for (const reserved of PROJECT_SCOPED_RESERVED_DIRS) {
    if (resolved === reserved) return null;
    if ((resolved + path.sep).startsWith(reserved + path.sep)) return null;
  }
  try {
    if (fs.existsSync(path.join(resolved, '.git'))) return resolved;
  } catch {
    // Permission errors fall through to the slug check.
  }
  // Slug check: Claude Code stores sessions under ~/.claude/projects/<slug>, where slug
  // comes from the cwd the CLI was launched with. That cwd may have been the un-realpath'd
  // path ($HOME-prefixed) — on macOS $HOME is typically a symlink so realpath rewrites it
  // — and the slug we'd derive from `resolved` (post-realpath) wouldn't match. Try both.
  try {
    const candidates = new Set<string>([cwdToProjectSlug(resolved)]);
    if (resolved === HOME_DIR_REAL || resolved.startsWith(HOME_DIR_REAL + path.sep)) {
      const relative = resolved.slice(HOME_DIR_REAL.length);
      candidates.add(cwdToProjectSlug(`${HOME_DIR}${relative}`));
    }
    for (const slug of candidates) {
      if (fs.existsSync(path.join(CLAUDE_PROJECTS, slug))) return resolved;
    }
  } catch {
    // Fall through.
  }
  return null;
}
