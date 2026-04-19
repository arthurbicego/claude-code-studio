const { execSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function resolveClaudeBin() {
  try {
    const out = execSync('which claude', { encoding: 'utf8', env: process.env }).trim();
    if (out && fs.existsSync(out)) return fs.realpathSync(out);
  } catch {}
  const candidates = [
    path.join(os.homedir(), '.local/bin/claude'),
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude',
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return fs.realpathSync(c);
  }
  return null;
}

function resolveUserShell() {
  const envShell = process.env.SHELL;
  if (envShell && fs.existsSync(envShell)) return envShell;
  for (const c of ['/bin/zsh', '/bin/bash', '/bin/sh']) {
    if (fs.existsSync(c)) return c;
  }
  return '/bin/sh';
}

const CLAUDE_BIN = resolveClaudeBin();
const USER_SHELL = resolveUserShell();

module.exports = { CLAUDE_BIN, USER_SHELL, resolveClaudeBin, resolveUserShell };
