import type { IncomingMessage } from 'node:http';
import type { NextFunction, Request, Response } from 'express';
import { ERR, sendError } from './errors';

const SERVER_PORT = Number(process.env.PORT) || 3000;
const WEB_DEV_PORT = Number(process.env.WEB_DEV_PORT) || 5173;

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function splitCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

function buildHostAllowlist(): Set<string> {
  const hosts = new Set<string>();
  for (const port of [SERVER_PORT, WEB_DEV_PORT]) {
    hosts.add(`localhost:${port}`);
    hosts.add(`127.0.0.1:${port}`);
    hosts.add(`[::1]:${port}`);
  }
  for (const h of splitCsv(process.env.ALLOWED_HOSTS)) hosts.add(h.toLowerCase());
  return hosts;
}

function buildOriginAllowlist(): Set<string> {
  const origins = new Set<string>();
  for (const port of [SERVER_PORT, WEB_DEV_PORT]) {
    origins.add(`http://localhost:${port}`);
    origins.add(`http://127.0.0.1:${port}`);
    origins.add(`http://[::1]:${port}`);
  }
  for (const o of splitCsv(process.env.ALLOWED_ORIGINS)) origins.add(o.toLowerCase());
  return origins;
}

export const ALLOWED_HOSTS = buildHostAllowlist();
export const ALLOWED_ORIGINS = buildOriginAllowlist();

export function isHostAllowed(host: string | undefined | null): boolean {
  if (!host) return false;
  return ALLOWED_HOSTS.has(host.toLowerCase());
}

export function isOriginAllowed(origin: string | undefined | null): boolean {
  if (!origin) return false;
  return ALLOWED_ORIGINS.has(origin.toLowerCase());
}

/** Mitigates DNS rebinding: any request whose Host is not an allowed loopback host is rejected. */
export function hostGuard(req: Request, res: Response, next: NextFunction): void {
  const host = req.headers.host;
  if (!isHostAllowed(host)) {
    sendError(res, 403, ERR.FORBIDDEN, 'host not allowed');
    return;
  }
  next();
}

/**
 * Mitigates CSRF on state-changing requests: POST/PUT/PATCH/DELETE must carry an Origin
 * header that matches the frontend. Safe/read-only methods rely on browser SOP (we never
 * emit `Access-Control-Allow-Origin`, so cross-origin pages cannot read responses).
 */
export function originGuard(req: Request, res: Response, next: NextFunction): void {
  if (!MUTATING_METHODS.has(req.method)) {
    next();
    return;
  }
  const origin = req.headers.origin;
  if (!isOriginAllowed(origin)) {
    sendError(res, 403, ERR.FORBIDDEN, 'origin not allowed');
    return;
  }
  next();
}

/** Host + Origin check for WebSocket upgrade requests. Returns true when the request is allowed. */
export function isWsUpgradeAllowed(req: IncomingMessage | Request): boolean {
  const host = String(req.headers.host || '');
  const origin = String(req.headers.origin || '');
  return isHostAllowed(host) && isOriginAllowed(origin);
}
