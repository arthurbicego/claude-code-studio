import fs from 'node:fs';
import { removeFooterCacheFor } from './footer';
import { liveSessions, terminateLiveSession } from './live-sessions';
import { cleanupAttachmentsForSession } from './routes/attachments';
import { findSessionFile } from './sessions-meta';
import { broadcastInvalidate } from './sse';
import { type ArchivedMap, appState, saveState } from './state';

const DAY_MS = 24 * 60 * 60 * 1000;
const PURGE_INTERVAL_MS = 6 * 60 * 60 * 1000;
const PURGE_STARTUP_DELAY_MS = 30 * 1000;

export type PurgeDeps = {
  archived: ArchivedMap;
  days: number | null;
  nowMs: number;
  findSessionFile: (id: string) => string | null;
  unlink: (fpath: string) => void;
  /** Returns true when the id is currently live — used to abort the unlink if a session was
   *  re-spawned after the terminate-live pre-pass. */
  isLive?: (id: string) => boolean;
  onPurged?: (id: string) => void;
};

/**
 * Pure-ish core of the purge: mutates `archived` in-place, unlinks expired `.jsonl` files, and
 * returns the list of removed ids. Kept free of module-global state so it can be unit-tested.
 * No-ops when `days` is null/<1.
 */
export function purgeExpiredArchived(deps: PurgeDeps): string[] {
  if (!deps.days || deps.days < 1) return [];
  const retentionMs = deps.days * DAY_MS;
  const purged: string[] = [];
  for (const [id, archivedAt] of deps.archived.entries()) {
    if (deps.nowMs - archivedAt < retentionMs) continue;
    // The terminate-live pre-pass in runArchivePurge has a 3 s timeout; if a PTY did not
    // exit in time and a new session with the same id was started since, skip the unlink so
    // we do not destroy the freshly recreated .jsonl.
    if (deps.isLive?.(id)) {
      console.warn(`[purge] skipping ${id} — session is live again`);
      continue;
    }
    const fpath = deps.findSessionFile(id);
    if (fpath) {
      try {
        deps.unlink(fpath);
      } catch (err) {
        console.warn(`[purge] failed to unlink ${fpath}: ${(err as Error).message}`);
        continue;
      }
    }
    deps.archived.delete(id);
    deps.onPurged?.(id);
    purged.push(id);
  }
  return purged;
}

/**
 * Real-world entry point: kills any live PTYs for expired sessions so they cannot re-create
 * the `.jsonl` mid-delete, runs `purgeExpiredArchived` against the live `appState`, clears
 * cached footers and attachment directories, persists state, and broadcasts an invalidate.
 */
export async function runArchivePurge(nowMs: number = Date.now()): Promise<string[]> {
  const days = appState.prefs.autoDeleteArchivedDays;
  if (!days || days < 1) return [];
  const retentionMs = days * DAY_MS;

  // Pre-pass: kill any live PTY whose session is about to be deleted. The PTY's onExit
  // handler clears timers, removes it from liveSessions, and purges its attachments dir.
  const expiredIds: string[] = [];
  for (const [id, archivedAt] of appState.archived.entries()) {
    if (nowMs - archivedAt >= retentionMs) expiredIds.push(id);
  }
  if (expiredIds.length === 0) return [];
  await Promise.all(expiredIds.map((id) => terminateLiveSession(id)));

  const purged = purgeExpiredArchived({
    archived: appState.archived,
    days,
    nowMs,
    findSessionFile,
    unlink: fs.unlinkSync,
    isLive: (id) => liveSessions.has(id),
    onPurged: (id) => {
      removeFooterCacheFor(id);
      cleanupAttachmentsForSession(id);
    },
  });
  if (purged.length > 0) {
    saveState(appState);
    broadcastInvalidate();
    console.log(`[purge] removed ${purged.length} archived session(s) older than ${days} day(s)`);
  }
  return purged;
}

export function startArchivePurgeSchedule(): void {
  const safeRun = () => {
    runArchivePurge().catch((err) => {
      console.warn(`[purge] run failed: ${(err as Error).message}`);
    });
  };
  setTimeout(() => {
    safeRun();
    setInterval(safeRun, PURGE_INTERVAL_MS);
  }, PURGE_STARTUP_DELAY_MS);
}
