import fs from 'node:fs';
import {
  ARCHIVE_RETENTION_MAX_DAYS,
  ARCHIVE_RETENTION_MIN_DAYS,
  type Locale,
  PROJECT_SORT_OPTIONS,
  type Prefs,
  type ProjectSortBy,
  SESSION_SORT_OPTIONS,
  type SessionSortBy,
  SUPPORTED_LOCALES,
} from '../shared/types';
import { CONFIG_DIR, STATE_FILE } from './paths';

export const STATE_VERSION = 2;

export type ArchivedMap = Map<string, number>;

export type AppState = {
  archived: ArchivedMap;
  prefs: Prefs;
};

export function defaultPrefs(): Prefs {
  return {
    sections: {},
    expanded: [],
    projectOrder: [],
    locale: null,
    sessionSortByProject: {},
    autoDeleteArchivedDays: null,
  };
}

function coerceSessionSortBy(value: unknown): SessionSortBy | null {
  return typeof value === 'string' && (SESSION_SORT_OPTIONS as string[]).includes(value)
    ? (value as SessionSortBy)
    : null;
}

function coerceProjectSortBy(value: unknown): ProjectSortBy | null {
  return typeof value === 'string' && (PROJECT_SORT_OPTIONS as string[]).includes(value)
    ? (value as ProjectSortBy)
    : null;
}

function coerceAutoDeleteArchivedDays(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const n = Math.trunc(value);
  if (n < ARCHIVE_RETENTION_MIN_DAYS || n > ARCHIVE_RETENTION_MAX_DAYS) return null;
  return n;
}

export function sanitizePrefs(raw: unknown): Prefs {
  if (!raw || typeof raw !== 'object') return defaultPrefs();
  const rawObj = raw as Record<string, unknown>;
  const sectionsRaw =
    rawObj.sections && typeof rawObj.sections === 'object'
      ? (rawObj.sections as Record<string, unknown>)
      : {};
  const sections: Prefs['sections'] = {};
  for (const [name, value] of Object.entries(sectionsRaw)) {
    if (!value || typeof value !== 'object') continue;
    const v = value as Record<string, unknown>;
    sections[name] = {
      groupByProject: typeof v.groupByProject === 'boolean' ? v.groupByProject : true,
      projectSortBy: coerceProjectSortBy(v.projectSortBy),
    };
  }
  const expanded = Array.isArray(rawObj.expanded)
    ? (rawObj.expanded as unknown[]).filter((x): x is string => typeof x === 'string')
    : [];
  const projectOrder = Array.isArray(rawObj.projectOrder)
    ? (rawObj.projectOrder as unknown[]).filter((x): x is string => typeof x === 'string')
    : [];
  const locale: Locale | null =
    typeof rawObj.locale === 'string' && (SUPPORTED_LOCALES as string[]).includes(rawObj.locale)
      ? (rawObj.locale as Locale)
      : null;
  const sessionSortByProject: Record<string, SessionSortBy> = {};
  if (rawObj.sessionSortByProject && typeof rawObj.sessionSortByProject === 'object') {
    for (const [slug, value] of Object.entries(
      rawObj.sessionSortByProject as Record<string, unknown>,
    )) {
      const coerced = coerceSessionSortBy(value);
      if (coerced) sessionSortByProject[slug] = coerced;
    }
  }
  return {
    sections,
    expanded,
    projectOrder,
    locale,
    sessionSortByProject,
    autoDeleteArchivedDays: coerceAutoDeleteArchivedDays(rawObj.autoDeleteArchivedDays),
  };
}

export function migrateState(raw: Record<string, unknown>): Record<string, unknown> {
  const version = typeof raw.version === 'number' ? raw.version : 0;
  // v0/v1 → v2: `archived` was a string[]; now it's a [{id, archivedAt}][]. Unknown archive
  // timestamps default to now — the retention clock starts at migration for old entries.
  if (version < 2 && Array.isArray(raw.archived)) {
    const now = Date.now();
    raw.archived = (raw.archived as unknown[])
      .filter((x): x is string => typeof x === 'string')
      .map((id) => ({ id, archivedAt: now }));
    raw.version = 2;
  }
  return raw;
}

function coerceArchived(value: unknown): ArchivedMap {
  const map: ArchivedMap = new Map();
  if (!Array.isArray(value)) return map;
  const now = Date.now();
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.id !== 'string' || !e.id) continue;
    const ts =
      typeof e.archivedAt === 'number' && Number.isFinite(e.archivedAt) ? e.archivedAt : now;
    map.set(e.id, ts);
  }
  return map;
}

export function loadState(): AppState {
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) as Record<string, unknown>;
    const migrated = migrateState(raw);
    return {
      archived: coerceArchived(migrated.archived),
      prefs: sanitizePrefs(migrated.prefs),
    };
  } catch {
    return { archived: new Map(), prefs: defaultPrefs() };
  }
}

export function saveState(state: AppState): void {
  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    const payload = {
      version: STATE_VERSION,
      archived: Array.from(state.archived.entries(), ([id, archivedAt]) => ({ id, archivedAt })),
      prefs: state.prefs,
    };
    const tmp = `${STATE_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(payload, null, 2));
    fs.renameSync(tmp, STATE_FILE);
  } catch (err) {
    console.warn(`[state] save failed: ${(err as Error).message}`);
  }
}

export const appState = loadState();
