const fs = require('node:fs');
const { CONFIG_DIR, STATE_FILE } = require('./paths');

const STATE_VERSION = 1;

function defaultPrefs() {
  return { sections: {}, expanded: [], projectOrder: [] };
}

function sanitizePrefs(raw) {
  if (!raw || typeof raw !== 'object') return defaultPrefs();
  const sectionsRaw = raw.sections && typeof raw.sections === 'object' ? raw.sections : {};
  const sections = {};
  for (const [name, value] of Object.entries(sectionsRaw)) {
    if (!value || typeof value !== 'object') continue;
    sections[name] = {
      groupByProject: typeof value.groupByProject === 'boolean' ? value.groupByProject : true,
      sortBy:
        value.sortBy === 'createdAt' || value.sortBy === 'lastResponse'
          ? value.sortBy
          : 'lastResponse',
    };
  }
  const expanded = Array.isArray(raw.expanded)
    ? raw.expanded.filter((x) => typeof x === 'string')
    : [];
  const projectOrder = Array.isArray(raw.projectOrder)
    ? raw.projectOrder.filter((x) => typeof x === 'string')
    : [];
  return { sections, expanded, projectOrder };
}

function migrateState(raw) {
  // v0 (no `version` field) has the same shape as v1 — no transform needed.
  // Add future steps here: if (raw.version === 1) raw = migrateV1toV2(raw); etc.
  return raw;
}

function loadState() {
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    const migrated = migrateState(raw);
    const archived = Array.isArray(migrated.archived)
      ? migrated.archived.filter((x) => typeof x === 'string')
      : [];
    return { archived: new Set(archived), prefs: sanitizePrefs(migrated.prefs) };
  } catch {
    return { archived: new Set(), prefs: defaultPrefs() };
  }
}

function saveState(state) {
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
    console.warn(`[state] save failed: ${err.message}`);
  }
}

const appState = loadState();

module.exports = {
  STATE_VERSION,
  defaultPrefs,
  sanitizePrefs,
  migrateState,
  loadState,
  saveState,
  appState,
};
