import fs from 'node:fs';
import { type Locale, type Prefs, type SessionSortBy, SUPPORTED_LOCALES } from '@shared/types';
import { CONFIG_DIR, STATE_FILE } from './paths';

export const STATE_VERSION = 1;

export type AppState = {
  archived: Set<string>;
  prefs: Prefs;
};

export function defaultPrefs(): Prefs {
  return { sections: {}, expanded: [], projectOrder: [], locale: null };
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
    const sortBy: SessionSortBy =
      v.sortBy === 'createdAt' || v.sortBy === 'lastResponse' ? v.sortBy : 'lastResponse';
    sections[name] = {
      groupByProject: typeof v.groupByProject === 'boolean' ? v.groupByProject : true,
      sortBy,
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
  return { sections, expanded, projectOrder, locale };
}

export function migrateState(raw: Record<string, unknown>): Record<string, unknown> {
  // v0 (no `version` field) has the same shape as v1 — no transform needed.
  // Add future steps here: if (raw.version === 1) raw = migrateV1toV2(raw); etc.
  return raw;
}

export function loadState(): AppState {
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) as Record<string, unknown>;
    const migrated = migrateState(raw);
    const archived = Array.isArray(migrated.archived)
      ? (migrated.archived as unknown[]).filter((x): x is string => typeof x === 'string')
      : [];
    return { archived: new Set(archived), prefs: sanitizePrefs(migrated.prefs) };
  } catch {
    return { archived: new Set(), prefs: defaultPrefs() };
  }
}

export function saveState(state: AppState): void {
  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    const payload = {
      version: STATE_VERSION,
      archived: [...state.archived],
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
