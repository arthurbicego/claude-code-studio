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
        open: { groupByProject: false, sortBy: 'createdAt' },
        history: {},
      },
    });
    expect(prefs.sections.open).toEqual({ groupByProject: false, sortBy: 'createdAt' });
    // history: {} => groupByProject defaults to true, sortBy defaults to 'lastResponse'
    expect(prefs.sections.history).toEqual({ groupByProject: true, sortBy: 'lastResponse' });
  });

  it('drops sections whose value is not an object', () => {
    const prefs = sanitizePrefs({ sections: { open: 'nope', archived: null } });
    expect(prefs.sections).toEqual({});
  });

  it('coerces invalid sortBy values to the default', () => {
    const prefs = sanitizePrefs({ sections: { open: { sortBy: 'garbage' } } });
    expect(prefs.sections.open?.sortBy).toBe('lastResponse');
  });

  it('filters non-string entries out of expanded and projectOrder', () => {
    const prefs = sanitizePrefs({ expanded: ['a', 42, null, 'b'], projectOrder: ['x', {}, 'y'] });
    expect(prefs.expanded).toEqual(['a', 'b']);
    expect(prefs.projectOrder).toEqual(['x', 'y']);
  });
});
