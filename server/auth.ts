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
function readExistingToken(): string | null {
  try {
    const existing = fs.readFileSync(BOOT_TOKEN_FILE, 'utf8').trim();
    if (existing && existing.length >= 32) return existing;
  } catch {
    // Missing or unreadable — caller decides whether to generate.
  }
  return null;
}

export function getBootToken(): string {
  if (cachedToken) return cachedToken;
  const existing = readExistingToken();
  if (existing) {
    cachedToken = existing;
    return cachedToken;
  }
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  // Race-safe create: 'wx' fails atomically if another process already wrote the file
  // between readExistingToken above and this open. Falling back to a fresh read in that
  // case lets all racing processes converge on the first-writer's token.
  const candidate = crypto.randomBytes(32).toString('hex');
  try {
    fs.writeFileSync(BOOT_TOKEN_FILE, candidate, { mode: 0o600, flag: 'wx' });
    cachedToken = candidate;
    return cachedToken;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
      const winner = readExistingToken();
      if (winner) {
        cachedToken = winner;
        return cachedToken;
      }
    }
    throw err;
  }
}

export function verifyBootToken(provided: string | undefined | null): boolean {
  if (!provided || typeof provided !== 'string') return false;
  const expected = getBootToken();
  // Compare byte buffers of equal length so timingSafeEqual cannot throw on multi-byte
  // input. The expected token is 64 hex chars (always ASCII), but `provided` is
  // attacker-controlled and can contain anything UTF-8.
  const providedBuf = Buffer.from(provided, 'utf8');
  const expectedBuf = Buffer.from(expected, 'utf8');
  if (providedBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(providedBuf, expectedBuf);
}
