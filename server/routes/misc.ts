import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Express, Request, Response } from 'express';
import { getBootToken } from '../auth';
import { ERR, sendError, sendInternalError } from '../errors';
import { isAllowedProjectCwd } from '../paths';

function resolveVSCodeBin(): string | null {
  try {
    const out = execSync('which code', {
      encoding: 'utf8',
      env: process.env,
      timeout: 5000,
    }).trim();
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
  // The host/origin guards already ensure cross-origin pages cannot read this response under
  // SOP. The token itself only exists to gate WebSocket upgrades on /pty endpoints, so a
  // caller that grabbed a sessionKey via the SSE stream still cannot connect to the live PTY
  // unless it can also read the token file (mode 0600) or sniff a same-origin response.
  app.get('/api/auth/boot-token', (_req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store');
    res.json({ token: getBootToken() });
  });

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
        if (typeof s.model === 'string') {
          // Claude stores model variants as `opus[1m]`, `sonnet[1m]`, etc. The web UI only
          // offers the base family in its dropdown, so strip the trailing `[…]` suffix so the
          // user's configured model matches one of the options and renders as the default.
          defaults.model = s.model.replace(/\[[^\]]*\]$/, '');
        }
        if (typeof s.effortLevel === 'string') defaults.effort = s.effortLevel;
        // The Claude Code CLI reads the user's default permission mode from
        // `permissions.defaultMode`. Accept the legacy top-level `permissionMode` as a
        // fallback, and give the nested key precedence so Cockpit matches CLI behaviour.
        if (typeof s.permissionMode === 'string') defaults.permissionMode = s.permissionMode;
        if (typeof s.permissions === 'object' && s.permissions !== null) {
          const perms = s.permissions as Record<string, unknown>;
          if (typeof perms.defaultMode === 'string') defaults.permissionMode = perms.defaultMode;
        }
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

  app.post('/api/pick-folder', (req: Request, res: Response) => {
    if (process.platform !== 'darwin') {
      return sendError(res, 501, ERR.INTERNAL, 'folder picker is only supported on macOS');
    }
    const rawDefault = typeof req.body?.defaultPath === 'string' ? req.body.defaultPath : '';
    let defaultClause = '';
    if (rawDefault) {
      try {
        const resolved = path.resolve(rawDefault);
        if (fs.statSync(resolved).isDirectory()) {
          defaultClause = ` default location POSIX file ${quoteApplescriptString(resolved)}`;
        }
      } catch {
        // ignore — fall back to the Finder default.
      }
    }
    const script = `try\n  set theFolder to choose folder with prompt "Selecione a pasta do projeto"${defaultClause}\n  return POSIX path of theFolder\non error number -128\n  return ""\nend try`;
    const child = spawn('osascript', ['-e', script]);
    let stdout = '';
    let stderr = '';
    let responded = false;
    const respond = (fn: () => void) => {
      if (responded) return;
      responded = true;
      fn();
    };
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (err) => {
      respond(() => sendInternalError(res, err));
    });
    child.on('close', (code) => {
      respond(() => {
        if (code !== 0) {
          return sendInternalError(
            res,
            new Error(stderr.trim() || `osascript exited with code ${code}`),
          );
        }
        const raw = stdout.trim();
        if (!raw) return res.json({ path: null, canceled: true });
        const folderPath = raw.replace(/\/$/, '');
        res.json({ path: folderPath, canceled: false });
      });
    });
  });
}

function quoteApplescriptString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
