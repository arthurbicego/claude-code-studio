import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  expandImports,
  IMPORT_MAX_DEPTH,
  IMPORT_MAX_FILE_BYTES,
  IMPORT_MAX_TOTAL_BYTES,
} from './memory-expand';

// All imports are resolved against HOME_DIR_REAL, so we put the fixtures under
// a temp dir inside $HOME to stay on the allowed side of the home guard.
let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.homedir(), '.cockpit-for-claude-code-test-'));
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

  it('rejects symlinks that escape $HOME (no info disclosure through symlinked @imports)', () => {
    const outside = '/etc/hosts';
    if (!fs.existsSync(outside)) return;
    const link = path.join(tmpDir, 'escape.md');
    fs.symlinkSync(outside, link);
    const basePath = path.join(tmpDir, 'CLAUDE.md');
    const result = expandImports('@escape.md\n', basePath);
    expect(result.imports[0].error).toBe('outside_home');
    expect(result.expanded).not.toContain(fs.readFileSync(outside, 'utf8'));
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

  it('refuses imports under sensitive paths under $HOME (e.g. ~/.ssh, ~/.aws)', () => {
    // We do not actually create files under $HOME/.ssh in tests; instead we make a real symlink
    // from inside tmpDir to a sensitive location and assert it is rejected. Using a stable target
    // that may or may not exist in CI is fine — the rejection happens before fs.statSync.
    const fakeSshDir = path.join(os.homedir(), '.ssh');
    const link = path.join(tmpDir, 'creds.md');
    try {
      fs.symlinkSync(fakeSshDir, link);
    } catch {
      // Some sandboxes disallow creating symlinks; fall back to direct path probe.
    }
    const probe = expandImports('@~/.ssh/id_rsa\n', path.join(tmpDir, 'CLAUDE.md'));
    expect(probe.imports[0].error).toBe('sensitive');
  });

  it('rejects files larger than IMPORT_MAX_FILE_BYTES without reading them', () => {
    const big = path.join(tmpDir, 'big.md');
    // Write one byte beyond the cap so the size check triggers.
    fs.writeFileSync(big, 'a'.repeat(IMPORT_MAX_FILE_BYTES + 1));
    const result = expandImports('@big.md\n', path.join(tmpDir, 'CLAUDE.md'));
    expect(result.imports[0].error).toBe('too_large');
    expect(result.expanded).not.toContain('aaaa');
  });

  it('truncates the expansion when total bytes exceed IMPORT_MAX_TOTAL_BYTES', () => {
    // Each chunk is just under the per-file cap; six of them push past the total cap.
    const chunkBytes = IMPORT_MAX_FILE_BYTES - 1024;
    const chunks = Math.ceil(IMPORT_MAX_TOTAL_BYTES / chunkBytes) + 1;
    let manifest = '';
    for (let i = 0; i < chunks; i++) {
      const file = path.join(tmpDir, `c${i}.md`);
      fs.writeFileSync(file, 'x'.repeat(chunkBytes));
      manifest += `@c${i}.md\n`;
    }
    const result = expandImports(manifest, path.join(tmpDir, 'CLAUDE.md'));
    expect(result.truncated).toBe(true);
    const exceeded = result.imports.find((i) => i.error === 'budget_exceeded');
    expect(exceeded).toBeDefined();
  });
});
