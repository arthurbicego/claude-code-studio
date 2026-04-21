import { describe, expect, it, vi } from 'vitest';
import { purgeExpiredArchived } from './purge';

const DAY = 24 * 60 * 60 * 1000;

function makeDeps(overrides: Partial<Parameters<typeof purgeExpiredArchived>[0]> = {}) {
  return {
    archived: new Map<string, number>(),
    days: 30,
    nowMs: Date.now(),
    findSessionFile: () => null,
    unlink: vi.fn(),
    ...overrides,
  };
}

describe('purgeExpiredArchived', () => {
  it('returns an empty list and mutates nothing when days is null', () => {
    const archived = new Map([['a', 0]]);
    const purged = purgeExpiredArchived(makeDeps({ archived, days: null }));
    expect(purged).toEqual([]);
    expect(archived.has('a')).toBe(true);
  });

  it('returns an empty list when days is 0 or negative', () => {
    const archived = new Map([['a', 0]]);
    expect(purgeExpiredArchived(makeDeps({ archived, days: 0 }))).toEqual([]);
    expect(purgeExpiredArchived(makeDeps({ archived, days: -5 }))).toEqual([]);
    expect(archived.has('a')).toBe(true);
  });

  it('keeps entries still within the retention window', () => {
    const now = 1_000_000_000_000;
    const archived = new Map([['recent', now - 5 * DAY]]);
    const purged = purgeExpiredArchived(makeDeps({ archived, days: 30, nowMs: now }));
    expect(purged).toEqual([]);
    expect(archived.has('recent')).toBe(true);
  });

  it('removes entries whose archive age exceeds the retention window', () => {
    const now = 1_000_000_000_000;
    const unlink = vi.fn();
    const archived = new Map([
      ['old', now - 40 * DAY],
      ['fresh', now - 5 * DAY],
    ]);
    const purged = purgeExpiredArchived(
      makeDeps({
        archived,
        days: 30,
        nowMs: now,
        findSessionFile: (id) => (id === 'old' ? '/tmp/old.jsonl' : null),
        unlink,
      }),
    );
    expect(purged).toEqual(['old']);
    expect(archived.has('old')).toBe(false);
    expect(archived.has('fresh')).toBe(true);
    expect(unlink).toHaveBeenCalledWith('/tmp/old.jsonl');
  });

  it('still drops the archive entry when the session file is already gone', () => {
    const now = 1_000_000_000_000;
    const archived = new Map([['gone', now - 90 * DAY]]);
    const unlink = vi.fn();
    const purged = purgeExpiredArchived(
      makeDeps({
        archived,
        days: 30,
        nowMs: now,
        findSessionFile: () => null,
        unlink,
      }),
    );
    expect(purged).toEqual(['gone']);
    expect(archived.has('gone')).toBe(false);
    expect(unlink).not.toHaveBeenCalled();
  });

  it('keeps the archive entry when unlink fails and does not report it as purged', () => {
    const now = 1_000_000_000_000;
    const archived = new Map([['stuck', now - 90 * DAY]]);
    const unlink = vi.fn(() => {
      throw new Error('EBUSY');
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const purged = purgeExpiredArchived(
        makeDeps({
          archived,
          days: 30,
          nowMs: now,
          findSessionFile: () => '/tmp/stuck.jsonl',
          unlink,
        }),
      );
      expect(purged).toEqual([]);
      expect(archived.has('stuck')).toBe(true);
    } finally {
      warn.mockRestore();
    }
  });

  it('invokes onPurged only for ids that were removed', () => {
    const now = 1_000_000_000_000;
    const archived = new Map([
      ['old-1', now - 90 * DAY],
      ['old-2', now - 90 * DAY],
      ['fresh', now],
    ]);
    const onPurged = vi.fn();
    purgeExpiredArchived(
      makeDeps({
        archived,
        days: 30,
        nowMs: now,
        findSessionFile: () => null,
        onPurged,
      }),
    );
    expect(onPurged).toHaveBeenCalledTimes(2);
    expect(onPurged).toHaveBeenCalledWith('old-1');
    expect(onPurged).toHaveBeenCalledWith('old-2');
  });
});
