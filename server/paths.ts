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

export const CONFIG_DIR = path.join(HOME_DIR, '.claude-code-studio');
export const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
export const STATE_FILE = path.join(CONFIG_DIR, 'state.json');
export const ATTACHMENTS_DIR = path.join(CONFIG_DIR, 'attachments');

export const STATUSLINE_TAP = path.join(__dirname, 'scripts', 'statusline-tap.sh');
export const STATUSLINE_CACHE_DIR = path.join(HOME_DIR, '.claude-code-studio', 'statusline-cache');
export const STATUSLINE_GLOBAL_META = path.join(
  HOME_DIR,
  '.claude-code-studio',
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
