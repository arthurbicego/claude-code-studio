import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG_DIR } from './paths';

const BOOT_TOKEN_FILE = path.join(CONFIG_DIR, 'boot-token');

let cachedToken: string | null = null;

/**
 * Returns a stable boot token used to authenticate WebSocket upgrades on /pty endpoints.
 *
 * The token is persisted to ~/.cockpit-for-claude-code/boot-token with mode 0600 so it
 * survives server restarts (frontend tabs keep working) but is only readable by the user
 * the server runs as. It is *not* a strong secret — any local process running as the same
 * user can read the file. Its job is to break the "any localhost caller can hijack a PTY
 * by guessing the sessionKey" path: cross-origin pages cannot read the token thanks to SOP,
 * and the WS upgrade now needs the token in addition to the host/origin checks.
 */
export function getBootToken(): string {
  if (cachedToken) return cachedToken;
  try {
    const existing = fs.readFileSync(BOOT_TOKEN_FILE, 'utf8').trim();
    if (existing && existing.length >= 32) {
      cachedToken = existing;
      return cachedToken;
    }
  } catch {
    // Token file is missing or unreadable — fall through and generate a fresh one.
  }
  cachedToken = crypto.randomBytes(32).toString('hex');
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(BOOT_TOKEN_FILE, cachedToken, { mode: 0o600 });
  // Re-apply mode in case the file already existed with looser perms.
  try {
    fs.chmodSync(BOOT_TOKEN_FILE, 0o600);
  } catch {
    // Best-effort — chmod may fail on some filesystems but the write succeeded.
  }
  return cachedToken;
}

export function verifyBootToken(provided: string | undefined | null): boolean {
  if (!provided || typeof provided !== 'string') return false;
  const expected = getBootToken();
  if (provided.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  } catch {
    return false;
  }
}
