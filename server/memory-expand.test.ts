import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { expandImports, IMPORT_MAX_DEPTH } from './memory-expand';

// All imports are resolved against HOME_DIR_REAL, so we put the fixtures under
// a temp dir inside $HOME to stay on the allowed side of the home guard.
let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.homedir(), '.claude-code-studio-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('expandImports', () => {
  it('returns content unchanged when there are no @ imports', () => {
    const basePath = path.join(tmpDir, 'CLAUDE.md');
    const result = expandImports('hello world\n', basePath);
    expect(result.expanded).toBe('hello world\n');
    expect(result.imports).toHaveLength(0);
    expect(result.truncated).toBe(false);
  });

  it('inlines the content of a referenced file', () => {
    fs.writeFileSync(path.join(tmpDir, 'partial.md'), 'partial body');
    const basePath = path.join(tmpDir, 'CLAUDE.md');
    const result = expandImports('before\n@partial.md\nafter', basePath);
    expect(result.expanded).toContain('partial body');
    expect(result.imports).toHaveLength(1);
    expect(result.imports[0].exists).toBe(true);
    expect(result.imports[0].error).toBeNull();
  });

  it('leaves imports inside fenced code blocks untouched', () => {
    fs.writeFileSync(path.join(tmpDir, 'leak.md'), 'SHOULD NOT APPEAR');
    const basePath = path.join(tmpDir, 'CLAUDE.md');
    const input = '```\n@leak.md\n```\n';
    const result = expandImports(input, basePath);
    expect(result.expanded).toContain('@leak.md');
    expect(result.expanded).not.toContain('SHOULD NOT APPEAR');
    expect(result.imports).toHaveLength(0);
  });

  it('marks missing imports with not_found and leaves an HTML comment', () => {
    const basePath = path.join(tmpDir, 'CLAUDE.md');
    const result = expandImports('@missing.md\n', basePath);
    expect(result.imports[0].error).toBe('not_found');
    expect(result.expanded).toContain('não encontrado');
  });

  it('breaks import cycles and reports them', () => {
    const a = path.join(tmpDir, 'a.md');
    const b = path.join(tmpDir, 'b.md');
    fs.writeFileSync(a, '@b.md\n');
    fs.writeFileSync(b, '@a.md\n');
    const result = expandImports('@a.md\n', path.join(tmpDir, 'CLAUDE.md'));
    const cycles = result.imports.filter((i) => i.error === 'cycle');
    expect(cycles.length).toBeGreaterThan(0);
  });

  it('stops descending once IMPORT_MAX_DEPTH is reached', () => {
    // Create a chain of N+2 files; expansion should truncate before the bottom.
    const chainLength = IMPORT_MAX_DEPTH + 2;
    for (let i = 0; i < chainLength; i++) {
      const next = i + 1 < chainLength ? `@f${i + 1}.md\n` : 'leaf\n';
      fs.writeFileSync(path.join(tmpDir, `f${i}.md`), next);
    }
    const result = expandImports('@f0.md\n', path.join(tmpDir, 'CLAUDE.md'));
    expect(result.truncated).toBe(true);
  });
});
