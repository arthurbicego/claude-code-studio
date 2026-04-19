import fs from 'node:fs';
import path from 'node:path';
import type { MemoryFile, MemoryHierarchyEntry, MemoryVariant } from '@shared/types';
import type { Express, Request, Response } from 'express';
import { ERR, sendError, sendInternalError } from '../lib/errors';
import { expandImports } from '../memory-expand';
import { GLOBAL_CLAUDE_MD, HOME_DIR_REAL, isAllowedProjectCwd } from '../paths';

const PROJECT_MEMORY_VARIANTS: Record<MemoryVariant, string> = {
  shared: 'CLAUDE.md',
  local: 'CLAUDE.local.md',
};

function projectMemoryFileName(variant: MemoryVariant): string {
  return PROJECT_MEMORY_VARIANTS[variant] || PROJECT_MEMORY_VARIANTS.shared;
}

type ReadResult = { exists: boolean; content: string; mtime: number | null };

function readMemoryFile(filePath: string): ReadResult {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return { exists: false, content: '', mtime: null };
    return {
      exists: true,
      content: fs.readFileSync(filePath, 'utf8'),
      mtime: stat.mtimeMs,
    };
  } catch (err) {
    if (err && (err as NodeJS.ErrnoException).code === 'ENOENT')
      return { exists: false, content: '', mtime: null };
    throw err;
  }
}

function writeMemoryFile(filePath: string, content: string): ReadResult {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  const stat = fs.statSync(filePath);
  return { exists: true, content, mtime: stat.mtimeMs };
}

function deleteMemoryFile(filePath: string): ReadResult {
  try {
    fs.unlinkSync(filePath);
  } catch (err) {
    if (!err || (err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
  return { exists: false, content: '', mtime: null };
}

function statMemoryMeta(filePath: string): { exists: boolean; mtime: number | null; size: number } {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return { exists: false, mtime: null, size: 0 };
    return { exists: true, mtime: stat.mtimeMs, size: stat.size };
  } catch {
    return { exists: false, mtime: null, size: 0 };
  }
}

export function register(app: Express): void {
  app.get('/api/memory/global', (_req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store');
    try {
      const data = readMemoryFile(GLOBAL_CLAUDE_MD);
      const payload: MemoryFile = { path: GLOBAL_CLAUDE_MD, ...data };
      res.json(payload);
    } catch (err) {
      sendInternalError(res, err);
    }
  });

  app.put('/api/memory/global', (req: Request, res: Response) => {
    const content = typeof req.body?.content === 'string' ? req.body.content : null;
    if (content == null)
      return sendError(res, 400, ERR.CONTENT_REQUIRED, 'content is required (string)');
    try {
      if (content === '') {
        const data = deleteMemoryFile(GLOBAL_CLAUDE_MD);
        return res.json({ path: GLOBAL_CLAUDE_MD, ...data });
      }
      const data = writeMemoryFile(GLOBAL_CLAUDE_MD, content);
      res.json({ path: GLOBAL_CLAUDE_MD, ...data });
    } catch (err) {
      sendInternalError(res, err);
    }
  });

  app.get('/api/memory/project', (req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store');
    const cwd = isAllowedProjectCwd(req.query.cwd);
    if (!cwd) return sendError(res, 400, ERR.CWD_INVALID, 'invalid cwd or outside home');
    const variant: MemoryVariant = req.query.variant === 'local' ? 'local' : 'shared';
    const filePath = path.join(cwd, projectMemoryFileName(variant));
    try {
      const data = readMemoryFile(filePath);
      res.json({ path: filePath, variant, ...data });
    } catch (err) {
      sendInternalError(res, err);
    }
  });

  app.put('/api/memory/project', (req: Request, res: Response) => {
    const cwd = isAllowedProjectCwd(req.body?.cwd);
    if (!cwd) return sendError(res, 400, ERR.CWD_INVALID, 'invalid cwd or outside home');
    const content = typeof req.body?.content === 'string' ? req.body.content : null;
    if (content == null)
      return sendError(res, 400, ERR.CONTENT_REQUIRED, 'content is required (string)');
    if (!fs.existsSync(cwd)) return sendError(res, 400, ERR.CWD_NOT_FOUND, 'cwd does not exist');
    const variant: MemoryVariant = req.body?.variant === 'local' ? 'local' : 'shared';
    const filePath = path.join(cwd, projectMemoryFileName(variant));
    try {
      if (content === '') {
        const data = deleteMemoryFile(filePath);
        return res.json({ path: filePath, variant, ...data });
      }
      const data = writeMemoryFile(filePath, content);
      res.json({ path: filePath, variant, ...data });
    } catch (err) {
      sendInternalError(res, err);
    }
  });

  app.get('/api/memory/hierarchy', (req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store');
    const cwd = isAllowedProjectCwd(req.query.cwd);
    if (!cwd) return sendError(res, 400, ERR.CWD_INVALID, 'invalid cwd or outside home');

    const entries: MemoryHierarchyEntry[] = [];
    entries.push({
      scope: 'global',
      variant: 'shared',
      dir: path.dirname(GLOBAL_CLAUDE_MD),
      path: GLOBAL_CLAUDE_MD,
      ...statMemoryMeta(GLOBAL_CLAUDE_MD),
    });

    const dirs: string[] = [];
    let cur: string = cwd;
    while (cur && (cur + path.sep).startsWith(HOME_DIR_REAL + path.sep)) {
      dirs.unshift(cur);
      const parent = path.dirname(cur);
      if (parent === cur) break;
      cur = parent;
    }
    if (
      !dirs.includes(HOME_DIR_REAL) &&
      (HOME_DIR_REAL === cwd || cwd.startsWith(HOME_DIR_REAL + path.sep))
    ) {
      dirs.unshift(HOME_DIR_REAL);
    }

    for (const dir of dirs) {
      for (const variant of ['shared', 'local'] as const) {
        const fp = path.join(dir, projectMemoryFileName(variant));
        entries.push({
          scope: dir === cwd ? 'project' : 'ancestor',
          variant,
          dir,
          path: fp,
          ...statMemoryMeta(fp),
        });
      }
    }

    res.json({ cwd, entries });
  });

  app.post('/api/memory/expand', (req: Request, res: Response) => {
    const content = typeof req.body?.content === 'string' ? req.body.content : null;
    if (content == null)
      return sendError(res, 400, ERR.CONTENT_REQUIRED, 'content is required (string)');
    const rawBase = typeof req.body?.basePath === 'string' ? req.body.basePath : '';
    const basePath = path.resolve(rawBase || HOME_DIR_REAL);
    const withinHome =
      (basePath + path.sep).startsWith(HOME_DIR_REAL + path.sep) || basePath === HOME_DIR_REAL;
    if (!withinHome)
      return sendError(res, 400, ERR.BASE_PATH_OUTSIDE_HOME, 'basePath is outside home');
    try {
      const result = expandImports(content, basePath);
      res.json({ basePath, ...result });
    } catch (err) {
      sendInternalError(res, err);
    }
  });
}
