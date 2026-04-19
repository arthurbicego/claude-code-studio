const fs = require('node:fs');
const path = require('node:path');
const { HOME_DIR_REAL } = require('./paths');

const IMPORT_MAX_DEPTH = 5;
const IMPORT_LINE_RE = /^(\s*)@(\S+)\s*$/;
const FENCE_RE = /^\s*(```|~~~)/;

function resolveImportPath(raw, basePath) {
  if (!raw) return null;
  if (raw.startsWith('~/') || raw === '~') {
    return path.join(HOME_DIR_REAL, raw.slice(1));
  }
  if (path.isAbsolute(raw)) return path.resolve(raw);
  return path.resolve(path.dirname(basePath), raw);
}

function expandImports(content, basePath, options = {}) {
  const depth = options.depth || 0;
  const visited = options.visited || new Set();
  const imports = [];

  if (depth >= IMPORT_MAX_DEPTH) {
    return {
      expanded: content,
      imports,
      truncated: true,
    };
  }

  const lines = (content || '').split('\n');
  let inFence = false;
  const out = [];
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
    const entry = { raw: rawPath, resolved, basePath, depth, exists: false, error: null };

    if (!resolved) {
      entry.error = 'invalid_path';
      imports.push(entry);
      out.push(line);
      continue;
    }

    const withinHome =
      (resolved + path.sep).startsWith(HOME_DIR_REAL + path.sep) || resolved === HOME_DIR_REAL;
    if (!withinHome) {
      entry.error = 'outside_home';
      imports.push(entry);
      out.push(`<!-- @${rawPath} — fora de $HOME, ignorado -->`);
      continue;
    }

    if (visited.has(resolved)) {
      entry.error = 'cycle';
      imports.push(entry);
      out.push(`<!-- @${rawPath} — ciclo detectado, não expandido -->`);
      continue;
    }

    let stat;
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

    entry.exists = true;
    let inner;
    try {
      inner = fs.readFileSync(resolved, 'utf8');
    } catch (err) {
      entry.error = err.message;
      imports.push(entry);
      out.push(`<!-- @${rawPath} — erro: ${err.message} -->`);
      continue;
    }

    const nextVisited = new Set(visited);
    nextVisited.add(resolved);
    const sub = expandImports(inner, resolved, { depth: depth + 1, visited: nextVisited });
    imports.push(entry, ...sub.imports);
    if (sub.truncated) truncated = true;
    out.push(sub.expanded);
  }

  return { expanded: out.join('\n'), imports, truncated };
}

module.exports = {
  IMPORT_MAX_DEPTH,
  IMPORT_LINE_RE,
  FENCE_RE,
  resolveImportPath,
  expandImports,
};
