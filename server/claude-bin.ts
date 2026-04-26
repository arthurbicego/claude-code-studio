import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function resolveClaudeBin(): string | null {
  try {
    // 5 s timeout in case PATH contains a slow/dead network mount that hangs `which`.
    const out = execSync('which claude', {
      encoding: 'utf8',
      env: process.env,
      timeout: 5000,
    }).trim();
    if (out && fs.existsSync(out)) return fs.realpathSync(out);
  } catch {
    // `which` exits non-zero when not found — fall through to candidate list.
  }
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

export function resolveUserShell(): string {
  const envShell = process.env.SHELL;
  if (envShell && fs.existsSync(envShell)) return envShell;
  for (const c of ['/bin/zsh', '/bin/bash', '/bin/sh']) {
    if (fs.existsSync(c)) return c;
  }
  return '/bin/sh';
}

export const CLAUDE_BIN = resolveClaudeBin();
export const USER_SHELL = resolveUserShell();
