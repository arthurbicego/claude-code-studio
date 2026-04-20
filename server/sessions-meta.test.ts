import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isSystemText, listProjectsWithSessions } from './sessions-meta';

describe('listProjectsWithSessions', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-projects-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function writeSession(slug: string, id: string, cwd: string | null, extra = ''): void {
    const dir = path.join(root, slug);
    fs.mkdirSync(dir, { recursive: true });
    const line = cwd ? JSON.stringify({ cwd }) : JSON.stringify({ type: 'meta' });
    fs.writeFileSync(path.join(dir, `${id}.jsonl`), `${line}\n${extra}`);
  }

  it('returns [] when the projects root does not exist', () => {
    fs.rmSync(root, { recursive: true, force: true });
    expect(listProjectsWithSessions(root, new Set())).toEqual([]);
  });

  it('lists projects that have at least one .jsonl with a cwd', () => {
    writeSession('-tmp-foo', '11111111-1111-1111-1111-111111111111', '/tmp/foo');
    const projects = listProjectsWithSessions(root, new Set());
    expect(projects).toHaveLength(1);
    expect(projects[0].cwd).toBe('/tmp/foo');
    expect(projects[0].cwdResolved).toBe(true);
    expect(projects[0].sessions).toHaveLength(1);
  });

  it('skips project dirs that have no .jsonl files (legacy UUID folders only)', () => {
    const slug = '-tmp-legacy';
    fs.mkdirSync(path.join(root, slug, 'abcd-legacy-dir'), { recursive: true });
    const projects = listProjectsWithSessions(root, new Set());
    expect(projects).toHaveLength(0);
  });

  it('skips project dirs whose sessions have no cwd recorded', () => {
    writeSession('-tmp-nocwd', '22222222-2222-2222-2222-222222222222', null);
    const projects = listProjectsWithSessions(root, new Set());
    expect(projects).toHaveLength(0);
  });

  it('marks sessions as archived based on the provided set', () => {
    const id = '33333333-3333-3333-3333-333333333333';
    writeSession('-tmp-bar', id, '/tmp/bar');
    const projects = listProjectsWithSessions(root, new Set([id]));
    expect(projects[0].sessions[0].archived).toBe(true);
  });

  it('sorts projects by most recent session mtime', () => {
    writeSession('-tmp-older', '44444444-4444-4444-4444-444444444444', '/tmp/older');
    writeSession('-tmp-newer', '55555555-5555-5555-5555-555555555555', '/tmp/newer');
    const olderPath = path.join(root, '-tmp-older', '44444444-4444-4444-4444-444444444444.jsonl');
    const newerPath = path.join(root, '-tmp-newer', '55555555-5555-5555-5555-555555555555.jsonl');
    const base = Date.now();
    fs.utimesSync(olderPath, new Date(base - 10000), new Date(base - 10000));
    fs.utimesSync(newerPath, new Date(base), new Date(base));
    const projects = listProjectsWithSessions(root, new Set());
    expect(projects.map((p) => p.slug)).toEqual(['-tmp-newer', '-tmp-older']);
  });

  it('ignores non-directory entries at the root', () => {
    fs.writeFileSync(path.join(root, 'stray-file.txt'), 'ignore me');
    writeSession('-tmp-good', '66666666-6666-6666-6666-666666666666', '/tmp/good');
    const projects = listProjectsWithSessions(root, new Set());
    expect(projects).toHaveLength(1);
    expect(projects[0].slug).toBe('-tmp-good');
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
