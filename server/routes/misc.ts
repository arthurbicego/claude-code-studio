import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Express, Request, Response } from 'express';
import { ERR, sendError, sendInternalError } from '../errors';
import { isAllowedProjectCwd } from '../paths';

function resolveVSCodeBin(): string | null {
  try {
    const out = execSync('which code', { encoding: 'utf8', env: process.env }).trim();
    if (out && fs.existsSync(out)) return fs.realpathSync(out);
  } catch {
    // `which` exits non-zero when `code` is not on PATH — fall through.
  }
  const candidates = [
    '/opt/homebrew/bin/code',
    '/usr/local/bin/code',
    '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code',
    path.join(os.homedir(), '.local/bin/code'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return fs.realpathSync(c);
  }
  return null;
}

export function register(app: Express): void {
  app.post('/api/open/vscode', (req: Request, res: Response) => {
    const rawPath = typeof req.body?.path === 'string' ? req.body.path : '';
    const target = isAllowedProjectCwd(rawPath);
    if (!target) return sendError(res, 400, ERR.PATH_INVALID, 'invalid path');
    try {
      const st = fs.statSync(target);
      if (!st.isDirectory())
        return sendError(res, 400, ERR.PATH_NOT_DIRECTORY, 'path is not a directory');
    } catch {
      return sendError(res, 404, ERR.PATH_NOT_FOUND, 'path not found');
    }
    const bin = resolveVSCodeBin();
    if (!bin) {
      return sendError(
        res,
        500,
        ERR.INTERNAL,
        'VS Code `code` binary not found — install via "Shell Command: Install \'code\' command in PATH"',
      );
    }
    try {
      const child = spawn(bin, [target], { detached: true, stdio: 'ignore' });
      child.on('error', () => {});
      child.unref();
    } catch (err) {
      return sendInternalError(res, err);
    }
    res.json({ ok: true });
  });

  app.get('/api/defaults', (_req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store');
    const defaults = {
      model: null as string | null,
      effort: null as string | null,
      permissionMode: 'default',
    };
    const files = ['settings.json', 'settings.local.json'];
    for (const name of files) {
      const p = path.join(os.homedir(), '.claude', name);
      try {
        const s = JSON.parse(fs.readFileSync(p, 'utf8')) as Record<string, unknown>;
        if (typeof s.model === 'string') defaults.model = s.model;
        if (typeof s.effortLevel === 'string') defaults.effort = s.effortLevel;
        if (typeof s.permissionMode === 'string') defaults.permissionMode = s.permissionMode;
      } catch (err) {
        const e = err as NodeJS.ErrnoException;
        // ENOENT is the normal case when either settings file is missing.
        if (e.code !== 'ENOENT') {
          console.warn(`[defaults] failed to parse ${p}: ${e.message}`);
        }
      }
    }
    res.json(defaults);
  });

  app.get('/api/browse', (req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store');
    const requested = req.query.path ? String(req.query.path) : os.homedir();
    const showHidden = req.query.hidden === '1';
    try {
      const abs = path.resolve(requested);
      const st = fs.statSync(abs);
      if (!st.isDirectory()) return sendError(res, 400, ERR.PATH_NOT_DIRECTORY, 'not a directory');
      const entries = fs
        .readdirSync(abs, { withFileTypes: true })
        .filter((e) => e.isDirectory() && (showHidden || !e.name.startsWith('.')))
        .map((e) => ({ name: e.name }))
        .sort((a, b) => a.name.localeCompare(b.name));
      res.json({
        path: abs,
        parent: path.dirname(abs) === abs ? null : path.dirname(abs),
        home: os.homedir(),
        entries,
      });
    } catch (e) {
      return sendError(res, 400, ERR.PATH_INVALID, (e as Error).message);
    }
  });
}
