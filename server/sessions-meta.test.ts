import { describe, expect, it } from 'vitest';
import { fallbackSlugToCwd, isSystemText } from './sessions-meta';

describe('fallbackSlugToCwd', () => {
  it('converts a Claude project slug back to an absolute path', () => {
    expect(fallbackSlugToCwd('-Users-arthur-project')).toBe('/Users/arthur/project');
  });

  it('collapses a bare slug rooted at $HOME', () => {
    expect(fallbackSlugToCwd('-Users-arthur')).toBe('/Users/arthur');
  });
});

describe('isSystemText', () => {
  it('treats empty, null, and undefined as system text', () => {
    expect(isSystemText('')).toBe(true);
    expect(isSystemText(null)).toBe(true);
    expect(isSystemText(undefined)).toBe(true);
  });

  it('detects <command-...> tags', () => {
    expect(isSystemText('<command-name>/clear</command-name>')).toBe(true);
    expect(isSystemText('  <command-stdout>hello</command-stdout>')).toBe(true);
  });

  it('detects <system-reminder> and similar system tags', () => {
    expect(isSystemText('<system-reminder>do X</system-reminder>')).toBe(true);
    expect(isSystemText('<user-prompt-submit-hook>ok</user-prompt-submit-hook>')).toBe(true);
    expect(isSystemText('<bash-stdout>out</bash-stdout>')).toBe(true);
  });

  it('treats regular user text as non-system', () => {
    expect(isSystemText('hello world')).toBe(false);
    expect(isSystemText('<div>inline html</div>')).toBe(false);
  });
});
