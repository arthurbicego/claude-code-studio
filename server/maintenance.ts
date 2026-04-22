import fs from 'node:fs';
import path from 'node:path';
import type { MaintenanceCategory, MaintenanceItem } from '../shared/types';
import { readSessionMeta } from './sessions-meta';

/**
 * Slug regex for `~/.claude/projects/<slug>/` directories. The Claude CLI encodes absolute
 * paths by replacing `/` with `-`, so slugs are always alphanumerics plus `-`, `.`, `_`.
 * Rejecting anything else blocks path-traversal attempts like `..` or slugs with separators.
 */
export const PROJECT_SLUG_RE = /^(?!\.{1,2}$)[A-Za-z0-9._-]+$/;

/** Matches a safe single-file basename for statusline cache files. */
export const CACHE_FILE_RE = /^(?!\.{1,2}$)[A-Za-z0-9._-]+$/;

/** Recursively sum file sizes under a directory. Uses `lstat` to avoid following symlinks. */
export function sumDirSize(dir: string): number {
  let total = 0;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      total += sumDirSize(full);
      continue;
    }
    try {
      const st = fs.lstatSync(full);
      if (st.isFile()) total += st.size;
    } catch {
      // Entry vanished between readdir and lstat — ignore.
    }
  }
  return total;
}

function emptyCategory(): MaintenanceCategory {
  return { totalBytes: 0, items: [] };
}

/**
 * Scans `projectsRoot` for subdirectories with no `.jsonl` sessions. These are project
 * folders left behind after all sessions were removed, or legacy UUID-folder installs that
 * the listing endpoint already filters out.
 */
export function scanProjectsWithoutSessions(projectsRoot: string): MaintenanceCategory {
  const category = emptyCategory();
  if (!fs.existsSync(projectsRoot)) return category;
  let slugs: string[];
  try {
    slugs = fs.readdirSync(projectsRoot);
  } catch {
    return category;
  }
  for (const slug of slugs) {
    if (!PROJECT_SLUG_RE.test(slug)) continue;
    const dir = path.join(projectsRoot, slug);
    let st: fs.Stats;
    try {
      st = fs.lstatSync(dir);
    } catch {
      continue;
    }
    if (st.isSymbolicLink() || !st.isDirectory()) continue;
    let entries: string[];
    try {
      entries = fs.readdirSync(dir);
    } catch {
      continue;
    }
    const hasJsonl = entries.some((name) => name.endsWith('.jsonl'));
    if (hasJsonl) continue;
    const size = sumDirSize(dir);
    category.items.push({ id: slug, path: dir, size });
    category.totalBytes += size;
  }
  return category;
}

/**
 * Scans `projectsRoot` for projects whose first `.jsonl` records a `cwd` that no longer
 * exists on disk. Useful to prune history for projects the user has deleted. Skips projects
 * whose cwd still resolves — those are still in active use.
 */
export function scanOrphanProjects(projectsRoot: string): MaintenanceCategory {
  const category = emptyCategory();
  if (!fs.existsSync(projectsRoot)) return category;
  let slugs: string[];
  try {
    slugs = fs.readdirSync(projectsRoot);
  } catch {
    return category;
  }
  for (const slug of slugs) {
    if (!PROJECT_SLUG_RE.test(slug)) continue;
    const dir = path.join(projectsRoot, slug);
    let st: fs.Stats;
    try {
      st = fs.lstatSync(dir);
    } catch {
      continue;
    }
    if (st.isSymbolicLink() || !st.isDirectory()) continue;
    let entries: string[];
    try {
      entries = fs.readdirSync(dir);
    } catch {
      continue;
    }
    const jsonl = entries.find((name) => name.endsWith('.jsonl'));
    if (!jsonl) continue;
    const { cwd } = readSessionMeta(path.join(dir, jsonl));
    if (!cwd) continue;
    if (fs.existsSync(cwd)) continue;
    const size = sumDirSize(dir);
    category.items.push({ id: slug, path: dir, size, cwd });
    category.totalBytes += size;
  }
  return category;
}

/**
 * Returns archived session ids whose `.jsonl` can no longer be found on disk. Cleaning these
 * up drops dangling entries from the state file that would otherwise grow unbounded.
 */
export function scanStaleArchived(
  archived: ReadonlyMap<string, number> | ReadonlySet<string>,
  findSessionFile: (id: string) => string | null,
): MaintenanceCategory {
  const category = emptyCategory();
  const ids: Iterable<string> =
    archived instanceof Map
      ? (archived.keys() as Iterable<string>)
      : (archived as ReadonlySet<string>);
  for (const id of ids) {
    if (findSessionFile(id)) continue;
    category.items.push({ id });
  }
  return category;
}

/**
 * Lists files under the Cockpit statusline cache directory. They are regenerated on demand,
 * so any present file is removable.
 */
export function scanStatuslineCache(cacheDir: string): MaintenanceCategory {
  const category = emptyCategory();
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(cacheDir, { withFileTypes: true });
  } catch {
    return category;
  }
  for (const entry of entries) {
    if (!CACHE_FILE_RE.test(entry.name)) continue;
    if (entry.isSymbolicLink() || !entry.isFile()) continue;
    const full = path.join(cacheDir, entry.name);
    let st: fs.Stats;
    try {
      st = fs.lstatSync(full);
    } catch {
      continue;
    }
    if (!st.isFile()) continue;
    category.items.push({ id: entry.name, path: full, size: st.size });
    category.totalBytes += st.size;
  }
  return category;
}

/**
 * Returns attachment directories that no longer belong to any live or persisted session.
 * A session key is considered orphan when it is neither in `liveKeys` nor matched by a
 * `.jsonl` on disk.
 */
export function scanOrphanAttachments(
  attachmentsDir: string,
  liveKeys: ReadonlySet<string>,
  findSessionFile: (id: string) => string | null,
  sessionKeyPattern: RegExp,
): MaintenanceCategory {
  const category = emptyCategory();
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(attachmentsDir, { withFileTypes: true });
  } catch {
    return category;
  }
  for (const entry of entries) {
    if (!sessionKeyPattern.test(entry.name)) continue;
    if (entry.isSymbolicLink() || !entry.isDirectory()) continue;
    if (liveKeys.has(entry.name)) continue;
    if (findSessionFile(entry.name)) continue;
    const full = path.join(attachmentsDir, entry.name);
    const size = sumDirSize(full);
    category.items.push({ id: entry.name, path: full, size });
    category.totalBytes += size;
  }
  return category;
}

/**
 * Resolves `candidate` and enforces that it lies inside `base` (after following symlinks).
 * Used as the last safety gate before any destructive filesystem operation to defeat path
 * traversal, symlink escape, and race conditions that change the tree between scan and apply.
 * Throws when the candidate resolves outside the base.
 */
export function assertWithinBase(base: string, candidate: string): string {
  const resolvedBase = fs.realpathSync(base);
  const resolved = fs.realpathSync(candidate);
  if (resolved !== resolvedBase && !resolved.startsWith(resolvedBase + path.sep)) {
    throw new Error(`path ${resolved} escapes base ${resolvedBase}`);
  }
  return resolved;
}

export type MaintenanceCategoryName =
  | 'projectsWithoutSessions'
  | 'orphanProjects'
  | 'staleArchived'
  | 'statuslineCache'
  | 'orphanAttachments';

/** Helper shared by the route: convert a thrown error to a stable skip reason. */
export function toSkipReason(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export function maintenanceItemById(cat: MaintenanceCategory, id: string): MaintenanceItem | null {
  return cat.items.find((it) => it.id === id) ?? null;
}
