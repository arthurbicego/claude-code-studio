import { describe, expect, it } from 'vitest';
import { defaultPrefs, migrateState, sanitizePrefs } from './state';

describe('sanitizePrefs', () => {
  it('returns defaults when input is missing or not an object', () => {
    expect(sanitizePrefs(null)).toEqual(defaultPrefs());
    expect(sanitizePrefs('nope')).toEqual(defaultPrefs());
    expect(sanitizePrefs(42)).toEqual(defaultPrefs());
  });

  it('preserves known section fields and fills defaults', () => {
    const prefs = sanitizePrefs({
      sections: {
        open: { groupByProject: false, projectSortBy: 'alphabetical' },
        history: {},
      },
    });
    expect(prefs.sections.open).toEqual({ groupByProject: false, projectSortBy: 'alphabetical' });
    // history: {} => groupByProject defaults to true, projectSortBy defaults to null (custom)
    expect(prefs.sections.history).toEqual({ groupByProject: true, projectSortBy: null });
  });

  it('drops sections whose value is not an object', () => {
    const prefs = sanitizePrefs({ sections: { open: 'nope', archived: null } });
    expect(prefs.sections).toEqual({});
  });

  it('coerces invalid projectSortBy values to null (custom)', () => {
    const prefs = sanitizePrefs({ sections: { open: { projectSortBy: 'garbage' } } });
    expect(prefs.sections.open?.projectSortBy).toBeNull();
  });

  it('filters non-string entries out of expanded and projectOrder', () => {
    const prefs = sanitizePrefs({ expanded: ['a', 42, null, 'b'], projectOrder: ['x', {}, 'y'] });
    expect(prefs.expanded).toEqual(['a', 'b']);
    expect(prefs.projectOrder).toEqual(['x', 'y']);
  });

  it('accepts lastActivity as a valid projectSortBy value', () => {
    const prefs = sanitizePrefs({ sections: { open: { projectSortBy: 'lastActivity' } } });
    expect(prefs.sections.open?.projectSortBy).toBe('lastActivity');
  });

  it('keeps only valid per-project session sort overrides', () => {
    const prefs = sanitizePrefs({
      sessionSortByProject: {
        'proj-a': 'createdAt',
        'proj-b': 'garbage',
        'proj-c': 'alphabetical',
        'proj-d': 42,
      },
    });
    expect(prefs.sessionSortByProject).toEqual({
      'proj-a': 'createdAt',
      'proj-c': 'alphabetical',
    });
  });

  it('returns an empty map when sessionSortByProject is missing or invalid', () => {
    expect(sanitizePrefs({}).sessionSortByProject).toEqual({});
    expect(sanitizePrefs({ sessionSortByProject: 'nope' }).sessionSortByProject).toEqual({});
  });

  it('accepts a valid autoDeleteArchivedDays and rejects out-of-range values', () => {
    expect(sanitizePrefs({ autoDeleteArchivedDays: 30 }).autoDeleteArchivedDays).toBe(30);
    expect(sanitizePrefs({ autoDeleteArchivedDays: 1 }).autoDeleteArchivedDays).toBe(1);
    expect(sanitizePrefs({ autoDeleteArchivedDays: 365 }).autoDeleteArchivedDays).toBe(365);
    expect(sanitizePrefs({ autoDeleteArchivedDays: 0 }).autoDeleteArchivedDays).toBeNull();
    expect(sanitizePrefs({ autoDeleteArchivedDays: -5 }).autoDeleteArchivedDays).toBeNull();
    expect(sanitizePrefs({ autoDeleteArchivedDays: 400 }).autoDeleteArchivedDays).toBeNull();
    expect(sanitizePrefs({ autoDeleteArchivedDays: '30' }).autoDeleteArchivedDays).toBeNull();
    expect(sanitizePrefs({}).autoDeleteArchivedDays).toBeNull();
  });

  it('truncates fractional days', () => {
    expect(sanitizePrefs({ autoDeleteArchivedDays: 30.7 }).autoDeleteArchivedDays).toBe(30);
  });
});

describe('migrateState', () => {
  it('upgrades v1 string[] archived to v2 objects with archivedAt', () => {
    const before = { version: 1, archived: ['a', 'b', 'c'] };
    const after = migrateState({ ...before }) as { version: number; archived: unknown[] };
    expect(after.version).toBe(2);
    expect(Array.isArray(after.archived)).toBe(true);
    expect(after.archived).toHaveLength(3);
    for (const entry of after.archived) {
      expect(entry).toHaveProperty('id');
      expect(entry).toHaveProperty('archivedAt');
      expect(typeof (entry as { archivedAt: unknown }).archivedAt).toBe('number');
    }
    expect((after.archived[0] as { id: string }).id).toBe('a');
  });

  it('treats missing version as v0 and still migrates the array', () => {
    const after = migrateState({ archived: ['x'] }) as { version: number; archived: unknown[] };
    expect(after.version).toBe(2);
    expect(after.archived).toHaveLength(1);
  });

  it('is a no-op when already at v2', () => {
    const payload = {
      version: 2,
      archived: [{ id: 'x', archivedAt: 12345 }],
    };
    const after = migrateState({ ...payload }) as typeof payload;
    expect(after.version).toBe(2);
    expect(after.archived).toEqual([{ id: 'x', archivedAt: 12345 }]);
  });
});
