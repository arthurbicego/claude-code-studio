import fs from 'node:fs';
import path from 'node:path';
import type { Express, Request, Response } from 'express';
import {
  MAINTENANCE_CATEGORY_KEYS,
  MAINTENANCE_MAX_ITEMS_PER_REQUEST,
  type MaintenanceCategoryKey,
  type MaintenanceCleanupResult,
  type MaintenanceCleanupSkipped,
  type MaintenanceScanResult,
} from '../../shared/types';
import { ERR, sendError, sendInternalError } from '../errors';
import { liveSessions } from '../live-sessions';
import {
  assertWithinBase,
  PROJECT_SLUG_RE,
  scanOrphanAttachments,
  scanOrphanProjects,
  scanProjectsWithoutSessions,
  scanStaleArchived,
  scanStatuslineCache,
  toSkipReason,
} from '../maintenance';
import { ATTACHMENTS_DIR, CLAUDE_PROJECTS, STATUSLINE_CACHE_DIR } from '../paths';
import { findSessionFile, readSessionMeta } from '../sessions-meta';
import { broadcastInvalidate } from '../sse';
import { appState, saveState } from '../state';
import { UUID_RE } from '../validators';

/** Set of slugs derived from live-session cwds. Prevents deleting a project folder whose
 * session is actively writing to `.jsonl` — a race we cannot fully close with filesystem
 * checks alone because the CLI creates the file only after the first event lands. */
function liveSlugSet(): Set<string> {
  const set = new Set<string>();
  for (const live of liveSessions.values()) {
    if (live.cwd) set.add(live.cwd.replace(/\//g, '-'));
  }
  return set;
}

function liveKeySet(): Set<string> {
  return new Set(liveSessions.keys());
}

function cleanProjectDir(
  slug: string,
  base: string,
  options: { expectNoJsonl?: boolean; expectMissingCwd?: boolean } = {},
): string {
  if (!PROJECT_SLUG_RE.test(slug)) throw new Error('invalid slug');
  const candidate = path.join(base, slug);
  if (!fs.existsSync(candidate)) throw new Error('not found');
  const resolved = assertWithinBase(base, candidate);

  let entries: string[];
  try {
    entries = fs.readdirSync(resolved);
  } catch {
    throw new Error('unreadable');
  }
  const hasJsonl = entries.some((name) => name.endsWith('.jsonl'));
  if (options.expectNoJsonl && hasJsonl) {
    throw new Error('sessions appeared since scan');
  }
  if (options.expectMissingCwd) {
    if (!hasJsonl) throw new Error('no session to verify cwd');
    const firstJsonl = entries.find((name) => name.endsWith('.jsonl'))!;
    const { cwd } = readSessionMeta(path.join(resolved, firstJsonl));
    if (cwd && fs.existsSync(cwd)) throw new Error('cwd reappeared on disk');
  }
  if (liveSlugSet().has(slug)) throw new Error('slug is bound to a live session');
  fs.rmSync(resolved, { recursive: true, force: false });
  return slug;
}

function cleanStatuslineCacheFile(name: string): string {
  if (!PROJECT_SLUG_RE.test(name)) throw new Error('invalid filename');
  const candidate = path.join(STATUSLINE_CACHE_DIR, name);
  const resolved = assertWithinBase(STATUSLINE_CACHE_DIR, candidate);
  const st = fs.lstatSync(resolved);
  if (!st.isFile()) throw new Error('not a regular file');
  fs.unlinkSync(resolved);
  return name;
}

function cleanAttachmentDir(sessionKey: string): string {
  if (!UUID_RE.test(sessionKey)) throw new Error('invalid session key');
  if (liveKeySet().has(sessionKey)) throw new Error('session is live');
  if (findSessionFile(sessionKey)) throw new Error('session .jsonl still exists');
  const candidate = path.join(ATTACHMENTS_DIR, sessionKey);
  if (!fs.existsSync(candidate)) throw new Error('not found');
  const resolved = assertWithinBase(ATTACHMENTS_DIR, candidate);
  fs.rmSync(resolved, { recursive: true, force: false });
  return sessionKey;
}

function dropArchivedId(id: string): string {
  if (id.length === 0 || id.length > 128) throw new Error('invalid id');
  if (!/^[A-Za-z0-9._-]+$/.test(id)) throw new Error('invalid id');
  if (findSessionFile(id)) throw new Error('session .jsonl still exists');
  if (!appState.archived.has(id)) throw new Error('not archived');
  appState.archived.delete(id);
  return id;
}

function isValidCategory(value: unknown): value is MaintenanceCategoryKey {
  return typeof value === 'string' && (MAINTENANCE_CATEGORY_KEYS as string[]).includes(value);
}

export function register(app: Express): void {
  app.get('/api/maintenance/scan', (_req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store, max-age=0');
    try {
      const result: MaintenanceScanResult = {
        scannedAt: Date.now(),
        categories: {
          projectsWithoutSessions: scanProjectsWithoutSessions(CLAUDE_PROJECTS),
          orphanProjects: scanOrphanProjects(CLAUDE_PROJECTS),
          staleArchived: scanStaleArchived(appState.archived, findSessionFile),
          statuslineCache: scanStatuslineCache(STATUSLINE_CACHE_DIR),
          orphanAttachments: scanOrphanAttachments(
            ATTACHMENTS_DIR,
            liveKeySet(),
            findSessionFile,
            UUID_RE,
          ),
        },
      };
      res.json(result);
    } catch (err) {
      sendInternalError(res, err);
    }
  });

  app.post('/api/maintenance/cleanup', (req: Request, res: Response) => {
    const body = (req.body ?? {}) as {
      category?: unknown;
      itemIds?: unknown;
      confirm?: unknown;
    };
    if (!isValidCategory(body.category)) {
      return sendError(res, 400, ERR.MAINTENANCE_CATEGORY_INVALID, 'invalid category');
    }
    if (body.confirm !== true) {
      return sendError(res, 400, ERR.MAINTENANCE_CONFIRM_REQUIRED, 'confirm must be true');
    }
    if (!Array.isArray(body.itemIds)) {
      return sendError(res, 400, ERR.INVALID_REQUEST, 'itemIds must be an array');
    }
    const itemIds = (body.itemIds as unknown[]).filter((x): x is string => typeof x === 'string');
    if (itemIds.length === 0) {
      return res.json({ deleted: [], skipped: [] } satisfies MaintenanceCleanupResult);
    }
    if (itemIds.length > MAINTENANCE_MAX_ITEMS_PER_REQUEST) {
      return sendError(res, 400, ERR.MAINTENANCE_TOO_MANY_ITEMS, 'too many items', {
        max: MAINTENANCE_MAX_ITEMS_PER_REQUEST,
      });
    }

    const deleted: string[] = [];
    const skipped: MaintenanceCleanupSkipped[] = [];

    for (const id of itemIds) {
      try {
        switch (body.category) {
          case 'projectsWithoutSessions':
            cleanProjectDir(id, CLAUDE_PROJECTS, { expectNoJsonl: true });
            break;
          case 'orphanProjects':
            cleanProjectDir(id, CLAUDE_PROJECTS, { expectMissingCwd: true });
            break;
          case 'staleArchived':
            dropArchivedId(id);
            break;
          case 'statuslineCache':
            cleanStatuslineCacheFile(id);
            break;
          case 'orphanAttachments':
            cleanAttachmentDir(id);
            break;
        }
        deleted.push(id);
      } catch (err) {
        skipped.push({ id, reason: toSkipReason(err) });
      }
    }

    if (body.category === 'staleArchived' && deleted.length > 0) {
      saveState(appState);
    }
    if (
      (body.category === 'projectsWithoutSessions' || body.category === 'orphanProjects') &&
      deleted.length > 0
    ) {
      broadcastInvalidate();
    }

    res.json({ deleted, skipped } satisfies MaintenanceCleanupResult);
  });
}
