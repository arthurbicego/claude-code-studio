import { describe, expect, it } from 'vitest';
import { BRANCH_NAME_RE, FOOTER_ID_RE } from './validators';

describe('BRANCH_NAME_RE', () => {
  it('accepts ordinary branch names', () => {
    expect(BRANCH_NAME_RE.test('main')).toBe(true);
    expect(BRANCH_NAME_RE.test('feature/foo')).toBe(true);
    expect(BRANCH_NAME_RE.test('release-1.2.3')).toBe(true);
    expect(BRANCH_NAME_RE.test('user/x/topic')).toBe(true);
  });

  it('rejects names that git check-ref-format also rejects', () => {
    expect(BRANCH_NAME_RE.test('foo..bar')).toBe(false); // consecutive dots
    expect(BRANCH_NAME_RE.test('foo//bar')).toBe(false); // double slash
    expect(BRANCH_NAME_RE.test('foo@{bar}')).toBe(false); // @{ sequence
    expect(BRANCH_NAME_RE.test('foo.lock')).toBe(false); // .lock suffix
    expect(BRANCH_NAME_RE.test('foo.lock/bar')).toBe(false); // .lock segment
    expect(BRANCH_NAME_RE.test('foo/')).toBe(false); // trailing slash
    expect(BRANCH_NAME_RE.test('foo.')).toBe(false); // trailing dot
    expect(BRANCH_NAME_RE.test('foo\\bar')).toBe(false); // backslash
    expect(BRANCH_NAME_RE.test('-foo')).toBe(false); // leading dash
    expect(BRANCH_NAME_RE.test('')).toBe(false); // empty
  });
});

describe('FOOTER_ID_RE', () => {
  it('accepts session ids and slug-like strings', () => {
    expect(FOOTER_ID_RE.test('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe(true);
    expect(FOOTER_ID_RE.test('foo.bar')).toBe(true);
    expect(FOOTER_ID_RE.test('a')).toBe(true);
  });

  it('rejects pure-dot strings that resolve to . or ..', () => {
    expect(FOOTER_ID_RE.test('.')).toBe(false);
    expect(FOOTER_ID_RE.test('..')).toBe(false);
    expect(FOOTER_ID_RE.test('...')).toBe(false);
    expect(FOOTER_ID_RE.test('....')).toBe(false);
  });

  it('rejects empty and overlong inputs', () => {
    expect(FOOTER_ID_RE.test('')).toBe(false);
    expect(FOOTER_ID_RE.test('a'.repeat(129))).toBe(false);
  });
});
