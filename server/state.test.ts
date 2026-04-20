import { describe, expect, it } from 'vitest';
import { defaultPrefs, sanitizePrefs } from './state';

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
});
