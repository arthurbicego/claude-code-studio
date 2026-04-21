import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  assertWithinBase,
  CACHE_FILE_RE,
  PROJECT_SLUG_RE,
  scanOrphanAttachments,
  scanOrphanProjects,
  scanProjectsWithoutSessions,
  scanStaleArchived,
  scanStatuslineCache,
  sumDirSize,
} from './maintenance';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function makeTemp(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe('PROJECT_SLUG_RE', () => {
  it('accepts typical Claude project slugs', () => {
    expect(PROJECT_SLUG_RE.test('-Users-arthur-project')).toBe(true);
    expect(PROJECT_SLUG_RE.test('-Users-arthur-Workspace-personal-projects-foo')).toBe(true);
  });

  it('rejects separators and traversal segments', () => {
    expect(PROJECT_SLUG_RE.test('..')).toBe(false);
    expect(PROJECT_SLUG_RE.test('.')).toBe(false);
    expect(PROJECT_SLUG_RE.test('foo/bar')).toBe(false);
    expect(PROJECT_SLUG_RE.test('foo\\bar')).toBe(false);
    expect(PROJECT_SLUG_RE.test('foo bar')).toBe(false);
    expect(PROJECT_SLUG_RE.test('')).toBe(false);
  });
});

describe('CACHE_FILE_RE', () => {
  it('rejects hidden traversal segments', () => {
    expect(CACHE_FILE_RE.test('..')).toBe(false);
    expect(CACHE_FILE_RE.test('.')).toBe(false);
    expect(CACHE_FILE_RE.test('foo.json')).toBe(true);
  });
});

describe('sumDirSize', () => {
  let dir: string;
  beforeEach(() => {
    dir = makeTemp('ccs-size-');
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('sums regular files recursively but skips symlinks', () => {
    fs.writeFileSync(path.join(dir, 'a.txt'), 'x'.repeat(10));
    fs.mkdirSync(path.join(dir, 'sub'));
    fs.writeFileSync(path.join(dir, 'sub', 'b.txt'), 'y'.repeat(5));
    const external = makeTemp('ccs-size-ext-');
    fs.writeFileSync(path.join(external, 'big.txt'), 'z'.repeat(100));
    try {
      fs.symlinkSync(external, path.join(dir, 'link'));
      expect(sumDirSize(dir)).toBe(15);
    } finally {
      fs.rmSync(external, { recursive: true, force: true });
    }
  });

  it('returns 0 for missing directories', () => {
    expect(sumDirSize(path.join(dir, 'nope'))).toBe(0);
  });
});

describe('scanProjectsWithoutSessions', () => {
  let root: string;
  beforeEach(() => (root = makeTemp('ccs-pwo-')));
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('returns subdirs with no .jsonl', () => {
    const a = path.join(root, '-Users-foo');
    fs.mkdirSync(a);
    fs.writeFileSync(path.join(a, 'notes.txt'), 'x');
    const b = path.join(root, '-Users-bar');
    fs.mkdirSync(b);
    fs.writeFileSync(path.join(b, 'session.jsonl'), '{}');

    const cat = scanProjectsWithoutSessions(root);
    expect(cat.items.map((i) => i.id)).toEqual(['-Users-foo']);
    expect(cat.totalBytes).toBeGreaterThan(0);
  });

  it('skips entries whose names are exactly . or .. (traversal segments)', () => {
    // readdir never yields "." or ".." in Node, but the regex guard is defense in depth.
    expect(PROJECT_SLUG_RE.test('.')).toBe(false);
    expect(PROJECT_SLUG_RE.test('..')).toBe(false);
  });

  it('treats legacy UUID-only folders as empty of sessions', () => {
    const legacy = path.join(root, '-Users-legacy');
    fs.mkdirSync(path.join(legacy, 'abcd-dir'), { recursive: true });
    const cat = scanProjectsWithoutSessions(root);
    expect(cat.items.map((i) => i.id)).toEqual(['-Users-legacy']);
  });

  it('returns empty when the root does not exist', () => {
    expect(scanProjectsWithoutSessions(path.join(root, 'nope')).items).toHaveLength(0);
  });
});

describe('scanOrphanProjects', () => {
  let root: string;
  let realCwd: string;
  beforeEach(() => {
    root = makeTemp('ccs-op-');
    realCwd = makeTemp('ccs-op-cwd-');
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(realCwd, { recursive: true, force: true });
  });

  it('returns projects whose recorded cwd does not exist on disk', () => {
    const slug = '-tmp-deleted';
    const dir = path.join(root, slug);
    fs.mkdirSync(dir);
    fs.writeFileSync(
      path.join(dir, 'a.jsonl'),
      `${JSON.stringify({ cwd: '/nonexistent/path/xyz' })}\n`,
    );
    const cat = scanOrphanProjects(root);
    expect(cat.items.map((i) => i.id)).toEqual([slug]);
    expect(cat.items[0].cwd).toBe('/nonexistent/path/xyz');
  });

  it('skips projects whose cwd still exists', () => {
    const slug = '-tmp-alive';
    const dir = path.join(root, slug);
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'a.jsonl'), `${JSON.stringify({ cwd: realCwd })}\n`);
    const cat = scanOrphanProjects(root);
    expect(cat.items).toHaveLength(0);
  });

  it('skips projects without any .jsonl', () => {
    fs.mkdirSync(path.join(root, '-tmp-nojsonl'));
    const cat = scanOrphanProjects(root);
    expect(cat.items).toHaveLength(0);
  });
});

describe('scanStaleArchived', () => {
  it('returns archived ids whose findSessionFile resolves null', () => {
    const find = (id: string) => (id === 'alive' ? '/tmp/alive.jsonl' : null);
    const archived = new Map<string, number>([
      ['alive', 0],
      ['stale-1', 0],
      ['stale-2', 0],
    ]);
    const cat = scanStaleArchived(archived, find);
    expect(cat.items.map((i) => i.id).sort()).toEqual(['stale-1', 'stale-2']);
  });

  it('still accepts a plain Set for callers that have not migrated', () => {
    const find = (id: string) => (id === 'alive' ? '/tmp/alive.jsonl' : null);
    const cat = scanStaleArchived(new Set(['alive', 'stale-1']), find);
    expect(cat.items.map((i) => i.id)).toEqual(['stale-1']);
  });
});

describe('scanStatuslineCache', () => {
  let dir: string;
  beforeEach(() => (dir = makeTemp('ccs-sl-')));
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('lists regular files and ignores directories + symlinks', () => {
    fs.writeFileSync(path.join(dir, 'foo.json'), 'x'.repeat(10));
    fs.mkdirSync(path.join(dir, 'sub'));
    const target = path.join(dir, 'sub', 'b.json');
    fs.writeFileSync(target, 'y');
    fs.symlinkSync(target, path.join(dir, 'link'));
    const cat = scanStatuslineCache(dir);
    expect(cat.items.map((i) => i.id)).toEqual(['foo.json']);
  });

  it('rejects cache names with traversal segments', () => {
    // Create ".." as a name by dropping a file named ".." — impossible on POSIX, so
    // just ensure the regex filter stands alone for a legitimate payload.
    expect(CACHE_FILE_RE.test('..')).toBe(false);
  });

  it('returns empty when the directory does not exist', () => {
    expect(scanStatuslineCache(path.join(dir, 'nope')).items).toHaveLength(0);
  });
});

describe('scanOrphanAttachments', () => {
  let dir: string;
  beforeEach(() => (dir = makeTemp('ccs-att-')));
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('lists directories whose sessionKey is neither live nor has a .jsonl', () => {
    const liveKey = '11111111-1111-1111-1111-111111111111';
    const persistedKey = '22222222-2222-2222-2222-222222222222';
    const orphanKey = '33333333-3333-3333-3333-333333333333';
    fs.mkdirSync(path.join(dir, liveKey));
    fs.mkdirSync(path.join(dir, persistedKey));
    fs.mkdirSync(path.join(dir, orphanKey));
    fs.writeFileSync(path.join(dir, orphanKey, 'x.png'), 'x'.repeat(5));

    const find = (id: string) => (id === persistedKey ? '/tmp/fake.jsonl' : null);
    const cat = scanOrphanAttachments(dir, new Set([liveKey]), find, UUID);
    expect(cat.items.map((i) => i.id)).toEqual([orphanKey]);
    expect(cat.totalBytes).toBe(5);
  });

  it('ignores names that do not match the session key pattern', () => {
    fs.mkdirSync(path.join(dir, 'not-a-uuid'));
    const cat = scanOrphanAttachments(dir, new Set(), () => null, UUID);
    expect(cat.items).toHaveLength(0);
  });
});

describe('assertWithinBase', () => {
  let base: string;
  let outside: string;
  beforeEach(() => {
    base = fs.realpathSync(makeTemp('ccs-guard-base-'));
    outside = fs.realpathSync(makeTemp('ccs-guard-out-'));
  });
  afterEach(() => {
    fs.rmSync(base, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  });

  it('accepts paths strictly inside the base', () => {
    const child = path.join(base, 'a');
    fs.mkdirSync(child);
    expect(assertWithinBase(base, child)).toBe(fs.realpathSync(child));
  });

  it('accepts the base itself', () => {
    expect(assertWithinBase(base, base)).toBe(base);
  });

  it('rejects a sibling with overlapping prefix', () => {
    const sibling = `${base}x`;
    fs.mkdirSync(sibling);
    try {
      expect(() => assertWithinBase(base, sibling)).toThrow();
    } finally {
      fs.rmSync(sibling, { recursive: true, force: true });
    }
  });

  it('rejects paths that escape via symlinks', () => {
    fs.symlinkSync(outside, path.join(base, 'escape'));
    expect(() => assertWithinBase(base, path.join(base, 'escape'))).toThrow();
  });

  it('rejects traversal like base/..', () => {
    expect(() => assertWithinBase(base, path.join(base, '..'))).toThrow();
  });
});
