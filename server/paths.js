const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const HOME_DIR = os.homedir();
const HOME_DIR_REAL = (() => {
  try {
    return fs.realpathSync(HOME_DIR);
  } catch {
    return HOME_DIR;
  }
})();

const CLAUDE_PROJECTS = path.join(HOME_DIR, '.claude', 'projects');
const USER_CLAUDE_DIR = path.join(HOME_DIR, '.claude');
const USER_AGENTS_DIR = path.join(HOME_DIR, '.claude', 'agents');
const USER_SKILLS_DIR = path.join(HOME_DIR, '.claude', 'skills');
const GLOBAL_CLAUDE_MD = path.join(HOME_DIR, '.claude', 'CLAUDE.md');

const CONFIG_DIR = path.join(HOME_DIR, '.claude-code-studio');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const STATE_FILE = path.join(CONFIG_DIR, 'state.json');

const STATUSLINE_TAP = path.join(__dirname, 'scripts', 'statusline-tap.sh');
const STATUSLINE_CACHE_DIR = path.join(HOME_DIR, '.claude-code-studio', 'statusline-cache');
const STATUSLINE_GLOBAL_META = path.join(HOME_DIR, '.claude-code-studio', 'global-meta.json');

function realpathSafe(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    return p;
  }
}

function isAllowedProjectCwd(rawCwd) {
  if (typeof rawCwd !== 'string' || !rawCwd.trim()) return null;
  let resolved;
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

function isPathWithinCwd(candidate, cwd) {
  if (!candidate || !cwd) return false;
  const resolved = realpathSafe(path.resolve(candidate));
  const base = realpathSafe(path.resolve(cwd));
  return resolved === base || resolved.startsWith(base + path.sep);
}

module.exports = {
  HOME_DIR,
  HOME_DIR_REAL,
  CLAUDE_PROJECTS,
  USER_CLAUDE_DIR,
  USER_AGENTS_DIR,
  USER_SKILLS_DIR,
  GLOBAL_CLAUDE_MD,
  CONFIG_DIR,
  CONFIG_FILE,
  STATE_FILE,
  STATUSLINE_TAP,
  STATUSLINE_CACHE_DIR,
  STATUSLINE_GLOBAL_META,
  realpathSafe,
  isAllowedProjectCwd,
  isPathWithinCwd,
};
