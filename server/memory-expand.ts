import fs from 'node:fs';
import path from 'node:path';
import type { MemoryImportEntry } from '@shared/types';
import { HOME_DIR_REAL, realpathSafe } from './paths';

export const IMPORT_MAX_DEPTH = 5;
export const IMPORT_LINE_RE = /^(\s*)@(\S+)\s*$/;
export const FENCE_RE = /^\s*(```|~~~)/;

// Hard limit per file and aggregate ceiling across the whole expansion. Memory expand is reachable
// over a localhost-only API with no auth, so a malicious local caller could otherwise dump a large
// file into the response or chain @imports until the server runs out of memory.
export const IMPORT_MAX_FILE_BYTES = 1 * 1024 * 1024;
export const IMPORT_MAX_TOTAL_BYTES = 5 * 1024 * 1024;

// @imports are validated to live inside $HOME, but $HOME also stores credentials and SSH/GPG/AWS
// keys that have no business being inlined into a CLAUDE.md preview. Refuse anything under these
// well-known sensitive locations so the expand endpoint cannot be used as an exfiltration primitive.
const SENSITIVE_REL_PATHS = [
  '.ssh',
  '.gnupg',
  '.aws',
  '.azure',
  '.kube',
  '.config/gh',
  '.config/gh-cli',
  '.config/git',
  '.config/op',
  '.config/1Password',
  '.cargo/credentials',
  '.cargo/credentials.toml',
  '.docker/config.json',
  '.netrc',
  '.npmrc',
  '.pypirc',
  '.gitconfig',
  '.claude/.credentials.json',
] as const;

export function isSensitiveImportPath(realResolved: string): boolean {
  for (const rel of SENSITIVE_REL_PATHS) {
    const target = path.join(HOME_DIR_REAL, rel);
    if (realResolved === target) return true;
    if ((realResolved + path.sep).startsWith(target + path.sep)) return true;
  }
  return false;
}

export function resolveImportPath(raw: string, basePath: string): string | null {
  if (!raw) return null;
  if (raw.startsWith('~/') || raw === '~') {
    return path.join(HOME_DIR_REAL, raw.slice(1));
  }
  if (path.isAbsolute(raw)) return path.resolve(raw);
  return path.resolve(path.dirname(basePath), raw);
}

export type ExpandResult = {
  expanded: string;
  imports: MemoryImportEntry[];
  truncated: boolean;
};

export function expandImports(
  content: string,
  basePath: string,
  options: { depth?: number; visited?: Set<string>; budget?: { remaining: number } } = {},
): ExpandResult {
  const depth = options.depth || 0;
  const visited = options.visited || new Set<string>();
  const budget = options.budget || { remaining: IMPORT_MAX_TOTAL_BYTES };
  const imports: MemoryImportEntry[] = [];

  if (depth >= IMPORT_MAX_DEPTH) {
    return {
      expanded: content,
      imports,
      truncated: true,
    };
  }

  const lines = (content || '').split('\n');
  let inFence = false;
  const out: string[] = [];
  let truncated = false;

  for (const line of lines) {
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      out.push(line);
      continue;
    }
    if (inFence) {
      out.push(line);
      continue;
    }

    const m = IMPORT_LINE_RE.exec(line);
    if (!m) {
      out.push(line);
      continue;
    }

    const rawPath = m[2];
    const resolved = resolveImportPath(rawPath, basePath);
    const entry: MemoryImportEntry = {
      raw: rawPath,
      resolved,
      basePath,
      depth,
      exists: false,
      error: null,
    };

    if (!resolved) {
      entry.error = 'invalid_path';
      imports.push(entry);
      out.push(line);
      continue;
    }

    // Resolve symlinks before the home check so a symlink inside $HOME that points at, say,
    // /etc/passwd cannot be read back through an @import.
    const realResolved = realpathSafe(resolved);
    const withinHome =
      (realResolved + path.sep).startsWith(HOME_DIR_REAL + path.sep) ||
      realResolved === HOME_DIR_REAL;
    if (!withinHome) {
      entry.error = 'outside_home';
      imports.push(entry);
      out.push(`<!-- @${rawPath} — fora de $HOME, ignorado -->`);
      continue;
    }

    if (isSensitiveImportPath(realResolved)) {
      entry.error = 'sensitive';
      imports.push(entry);
      out.push(`<!-- @${rawPath} — caminho sensível, ignorado -->`);
      continue;
    }

    if (visited.has(resolved)) {
      entry.error = 'cycle';
      imports.push(entry);
      out.push(`<!-- @${rawPath} — ciclo detectado, não expandido -->`);
      continue;
    }

    let stat: fs.Stats | null;
    try {
      stat = fs.statSync(resolved);
    } catch {
      stat = null;
    }
    if (!stat?.isFile()) {
      entry.error = 'not_found';
      imports.push(entry);
      out.push(`<!-- @${rawPath} — arquivo não encontrado -->`);
      continue;
    }

    if (stat.size > IMPORT_MAX_FILE_BYTES) {
      entry.error = 'too_large';
      entry.exists = true;
      imports.push(entry);
      out.push(`<!-- @${rawPath} — arquivo excede limite por arquivo, ignorado -->`);
      continue;
    }

    if (stat.size > budget.remaining) {
      entry.error = 'budget_exceeded';
      entry.exists = true;
      imports.push(entry);
      out.push(`<!-- @${rawPath} — limite total de expansão atingido, truncado -->`);
      truncated = true;
      break;
    }

    entry.exists = true;
    let inner: string;
    try {
      inner = fs.readFileSync(resolved, 'utf8');
    } catch (err) {
      entry.error = (err as Error).message;
      imports.push(entry);
      out.push(`<!-- @${rawPath} — erro: ${(err as Error).message} -->`);
      continue;
    }

    budget.remaining -= stat.size;

    const nextVisited = new Set(visited);
    nextVisited.add(resolved);
    const sub = expandImports(inner, resolved, {
      depth: depth + 1,
      visited: nextVisited,
      budget,
    });
    imports.push(entry, ...sub.imports);
    if (sub.truncated) truncated = true;
    out.push(sub.expanded);
  }

  return { expanded: out.join('\n'), imports, truncated };
}
