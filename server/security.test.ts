import type { IncomingMessage } from 'node:http';
import { describe, expect, it } from 'vitest';
import { isHostAllowed, isOriginAllowed, isWsUpgradeAllowed } from './security';

describe('isHostAllowed', () => {
  it('accepts loopback hosts on the server port', () => {
    expect(isHostAllowed('localhost:3000')).toBe(true);
    expect(isHostAllowed('127.0.0.1:3000')).toBe(true);
    expect(isHostAllowed('[::1]:3000')).toBe(true);
  });

  it('accepts loopback hosts on the Vite dev port', () => {
    expect(isHostAllowed('localhost:5173')).toBe(true);
    expect(isHostAllowed('127.0.0.1:5173')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isHostAllowed('LocalHost:3000')).toBe(true);
  });

  it('rejects non-loopback hosts (DNS rebinding guard)', () => {
    expect(isHostAllowed('evil.com:3000')).toBe(false);
    expect(isHostAllowed('192.168.1.10:3000')).toBe(false);
    expect(isHostAllowed('localhost:80')).toBe(false);
    expect(isHostAllowed('')).toBe(false);
    expect(isHostAllowed(undefined)).toBe(false);
  });
});

describe('isOriginAllowed', () => {
  it('accepts the frontend origins', () => {
    expect(isOriginAllowed('http://localhost:3000')).toBe(true);
    expect(isOriginAllowed('http://127.0.0.1:3000')).toBe(true);
    expect(isOriginAllowed('http://localhost:5173')).toBe(true);
    expect(isOriginAllowed('http://127.0.0.1:5173')).toBe(true);
  });

  it('rejects foreign origins (CSRF guard)', () => {
    expect(isOriginAllowed('http://evil.com')).toBe(false);
    expect(isOriginAllowed('https://localhost:3000')).toBe(false);
    expect(isOriginAllowed('null')).toBe(false);
    expect(isOriginAllowed('')).toBe(false);
    expect(isOriginAllowed(undefined)).toBe(false);
  });
});

describe('isWsUpgradeAllowed', () => {
  function req(headers: Record<string, string | undefined>): IncomingMessage {
    return { headers } as unknown as IncomingMessage;
  }

  it('accepts when both host and origin match the allowlist', () => {
    expect(
      isWsUpgradeAllowed(req({ host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' })),
    ).toBe(true);
    expect(
      isWsUpgradeAllowed(req({ host: 'localhost:5173', origin: 'http://localhost:5173' })),
    ).toBe(true);
  });

  it('rejects when origin is missing', () => {
    expect(isWsUpgradeAllowed(req({ host: '127.0.0.1:3000' }))).toBe(false);
  });

  it('rejects when origin points to a foreign site', () => {
    expect(isWsUpgradeAllowed(req({ host: '127.0.0.1:3000', origin: 'http://evil.com' }))).toBe(
      false,
    );
  });

  it('rejects when host fails the DNS rebinding check', () => {
    expect(
      isWsUpgradeAllowed(req({ host: 'evil.com:3000', origin: 'http://127.0.0.1:3000' })),
    ).toBe(false);
  });
});
