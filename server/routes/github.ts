import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import type { Express, Request, Response } from 'express';
import type { GhPrResult } from '../../shared/types';
import { ERR, sendError } from '../errors';
import { isAllowedProjectCwd } from '../paths';
import { BRANCH_NAME_RE } from '../validators';

let cachedGhBin: string | null | undefined;

function resolveGhBin(): string | null {
  if (cachedGhBin !== undefined) return cachedGhBin;
  try {
    const out = execFileSync('which', ['gh'], { encoding: 'utf8' }).trim();
    if (out && fs.existsSync(out)) {
      cachedGhBin = fs.realpathSync(out);
      return cachedGhBin;
    }
  } catch {
    // fall through to PATH probe
  }
  const candidates = ['/opt/homebrew/bin/gh', '/usr/local/bin/gh', '/usr/bin/gh'];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      cachedGhBin = fs.realpathSync(c);
      return cachedGhBin;
    }
  }
  cachedGhBin = null;
  return null;
}

export function register(app: Express): void {
  app.get('/api/github/pr', (req: Request, res: Response) => {
    const cwd = isAllowedProjectCwd(typeof req.query.cwd === 'string' ? req.query.cwd : '');
    if (!cwd) return sendError(res, 400, ERR.CWD_INVALID, 'invalid cwd');
    const branchRaw = typeof req.query.branch === 'string' ? req.query.branch : '';
    if (!branchRaw || !BRANCH_NAME_RE.test(branchRaw)) {
      return sendError(res, 400, ERR.WORKTREE_BRANCH_NOT_DETECTED, 'invalid branch name');
    }

    const bin = resolveGhBin();
    if (!bin) {
      const result: GhPrResult = { supported: false, pr: null };
      return res.json(result);
    }

    try {
      const stdout = execFileSync(
        bin,
        ['pr', 'view', branchRaw, '--json', 'number,url,state,mergedAt'],
        { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 10_000 },
      );
      const parsed = JSON.parse(stdout) as {
        number: number;
        url: string;
        state: string;
        mergedAt: string | null;
      };
      const state = parsed.state === 'MERGED' || parsed.state === 'CLOSED' ? parsed.state : 'OPEN';
      const result: GhPrResult = {
        supported: true,
        pr: {
          number: parsed.number,
          url: parsed.url,
          state,
          mergedAt: parsed.mergedAt ?? null,
        },
      };
      return res.json(result);
    } catch (err) {
      const e = err as { stderr?: Buffer; stdout?: Buffer; message?: string };
      const stderr = e.stderr?.toString() || '';
      // No PR for the branch — gh exits non-zero with a "no pull requests found" message.
      // Treat this as a normal "no PR" result so the banner stays hidden.
      if (
        /no pull requests? found/i.test(stderr) ||
        /could not resolve to a pullrequest/i.test(stderr)
      ) {
        const result: GhPrResult = { supported: true, pr: null };
        return res.json(result);
      }
      // Auth or repo-not-found: treat as unsupported so the client stops polling for this cwd.
      const result: GhPrResult = { supported: false, pr: null };
      return res.json(result);
    }
  });
}
