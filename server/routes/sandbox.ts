import fs from 'node:fs';
import path from 'node:path';
import type { SandboxScope } from '@shared/types';
import type { Express, Request, Response } from 'express';
import {
  DEFAULT_CONFIG,
  getConfig,
  MAX_STANDBY_MS,
  MIN_STANDBY_MS,
  updateConfig,
  validateConfig,
} from '../config';
import { isAllowedProjectCwd, USER_CLAUDE_DIR } from '../paths';

const SANDBOX_SCOPES: SandboxScope[] = ['user', 'user-local', 'project', 'project-local'];

const SANDBOX_BOOL_KEYS = [
  'enabled',
  'failIfUnavailable',
  'autoAllowBashIfSandboxed',
  'ignoreViolations',
  'enableWeakerNestedSandbox',
  'enableWeakerNetworkIsolation',
] as const;

const SANDBOX_STRING_LIST_KEYS = ['allowUnsandboxedCommands', 'excludedCommands'] as const;
const SANDBOX_OBJECT_KEYS = ['network', 'filesystem', 'ripgrep', 'seccomp'] as const;
const SANDBOX_PLATFORMS = ['macos', 'linux'] as const;

type RawSandbox = Record<string, unknown>;

function resolveSandboxSettingsPath(scope: SandboxScope, rawCwd: unknown): string | null {
  if (scope === 'user') return path.join(USER_CLAUDE_DIR, 'settings.json');
  if (scope === 'user-local') return path.join(USER_CLAUDE_DIR, 'settings.local.json');
  if (scope === 'project' || scope === 'project-local') {
    const cwd = isAllowedProjectCwd(rawCwd);
    if (!cwd) return null;
    const file = scope === 'project' ? 'settings.json' : 'settings.local.json';
    return path.join(cwd, '.claude', file);
  }
  return null;
}

function loadSettingsFile(filePath: string): Record<string, unknown> {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function saveSettingsFile(filePath: string, obj: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(obj, null, 2)}\n`);
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item === 'string') {
      const trimmed = item.trim();
      if (trimmed) out.push(trimmed);
    }
  }
  return out;
}

function normalizePlatforms(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (
      typeof item === 'string' &&
      (SANDBOX_PLATFORMS as readonly string[]).includes(item) &&
      !out.includes(item)
    ) {
      out.push(item);
    }
  }
  return out;
}

function normalizeObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function projectSandbox(raw: unknown): Record<string, unknown> {
  const sandbox = (raw && typeof raw === 'object' ? raw : {}) as RawSandbox;
  const out: Record<string, unknown> = {};
  for (const key of SANDBOX_BOOL_KEYS) out[key] = !!sandbox[key];
  for (const key of SANDBOX_STRING_LIST_KEYS) out[key] = normalizeStringList(sandbox[key]);
  for (const key of SANDBOX_OBJECT_KEYS) out[key] = normalizeObject(sandbox[key]);
  out.enabledPlatforms = normalizePlatforms(sandbox.enabledPlatforms);
  return out;
}

type ScopeParsed = { scope: SandboxScope; filePath: string } | { error: string };

function parseSandboxScope(req: Request): ScopeParsed {
  const raw = req.query?.scope ?? req.body?.scope ?? 'user-local';
  const scope = typeof raw === 'string' ? raw : 'user-local';
  if (!SANDBOX_SCOPES.includes(scope as SandboxScope)) {
    return { error: `scope inválido; use: ${SANDBOX_SCOPES.join(', ')}` };
  }
  const cwd = req.query?.cwd ?? req.body?.cwd;
  const filePath = resolveSandboxSettingsPath(scope as SandboxScope, cwd);
  if (!filePath) {
    return { error: 'cwd obrigatório e deve apontar para um diretório dentro de $HOME' };
  }
  return { scope: scope as SandboxScope, filePath };
}

export function register(app: Express): void {
  app.get('/api/config', (_req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store');
    res.json({
      config: getConfig(),
      defaults: DEFAULT_CONFIG,
      bounds: { standbyTimeoutMs: { min: MIN_STANDBY_MS, max: MAX_STANDBY_MS } },
    });
  });

  app.patch('/api/config', (req: Request, res: Response) => {
    let validated: ReturnType<typeof validateConfig>;
    try {
      validated = validateConfig(req.body || {});
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }
    const cfg = updateConfig(validated);
    res.json({ config: cfg });
  });

  app.get('/api/claude-settings', (req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store');
    const parsed = parseSandboxScope(req);
    if ('error' in parsed) return res.status(400).json({ error: parsed.error });
    const s = loadSettingsFile(parsed.filePath);
    res.json({ scope: parsed.scope, path: parsed.filePath, sandbox: projectSandbox(s.sandbox) });
  });

  app.patch('/api/claude-settings', (req: Request, res: Response) => {
    const parsed = parseSandboxScope(req);
    if ('error' in parsed) return res.status(400).json({ error: parsed.error });
    const body = (req.body || {}) as Record<string, unknown>;
    const s = loadSettingsFile(parsed.filePath);
    if (body.sandbox && typeof body.sandbox === 'object') {
      const cur =
        s.sandbox && typeof s.sandbox === 'object'
          ? { ...(s.sandbox as Record<string, unknown>) }
          : ({} as Record<string, unknown>);
      const incoming = body.sandbox as Record<string, unknown>;

      for (const key of SANDBOX_BOOL_KEYS) {
        if (typeof incoming[key] === 'boolean') cur[key] = incoming[key];
      }
      for (const key of SANDBOX_STRING_LIST_KEYS) {
        if (Array.isArray(incoming[key])) cur[key] = normalizeStringList(incoming[key]);
      }
      for (const key of SANDBOX_OBJECT_KEYS) {
        if (Object.hasOwn(incoming, key)) {
          const v = incoming[key];
          if (v === null) {
            delete cur[key];
          } else if (typeof v === 'object' && !Array.isArray(v)) {
            cur[key] = v;
          } else {
            return res.status(400).json({ error: `sandbox.${key} deve ser um objeto` });
          }
        }
      }
      if (Object.hasOwn(incoming, 'enabledPlatforms')) {
        if (!Array.isArray(incoming.enabledPlatforms)) {
          return res.status(400).json({ error: 'sandbox.enabledPlatforms deve ser um array' });
        }
        const normalized = normalizePlatforms(incoming.enabledPlatforms);
        if (normalized.length !== (incoming.enabledPlatforms as unknown[]).length) {
          return res.status(400).json({
            error: `sandbox.enabledPlatforms aceita apenas: ${SANDBOX_PLATFORMS.join(', ')}`,
          });
        }
        cur.enabledPlatforms = normalized;
      }

      s.sandbox = cur;
    }
    try {
      saveSettingsFile(parsed.filePath, s);
      res.json({ scope: parsed.scope, path: parsed.filePath, sandbox: projectSandbox(s.sandbox) });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });
}
