import { describe, expect, it } from 'vitest';
import { countTextLines, parseNumstat } from './git';

describe('parseNumstat', () => {
  it('returns zero totals for empty input', () => {
    expect(parseNumstat('')).toEqual({ added: 0, removed: 0 });
  });

  it('sums added and removed across lines', () => {
    const raw = '10\t2\tfoo.ts\n3\t5\tbar.md\n';
    expect(parseNumstat(raw)).toEqual({ added: 13, removed: 7 });
  });

  it('skips binary diff lines (marked with "-")', () => {
    const raw = '-\t-\timage.png\n4\t1\treadme.md\n';
    expect(parseNumstat(raw)).toEqual({ added: 4, removed: 1 });
  });
});

describe('countTextLines', () => {
  it('returns zero for empty string', () => {
    expect(countTextLines('')).toBe(0);
  });

  it('counts a single trailing newline as one line', () => {
    expect(countTextLines('hello\n')).toBe(1);
  });

  it('counts the final line even when no trailing newline', () => {
    expect(countTextLines('a\nb')).toBe(2);
  });

  it('handles multiple trailing newlines', () => {
    expect(countTextLines('a\n\n')).toBe(2);
  });
});
