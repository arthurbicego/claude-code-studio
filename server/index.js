const express = require('express');
const expressWs = require('express-ws');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const pty = require('node-pty');

const PORT = process.env.PORT || 3000;
const HOST = '127.0.0.1';
const CLAUDE_PROJECTS = path.join(os.homedir(), '.claude', 'projects');

function resolveClaudeBin() {
  try {
    const out = execSync('which claude', { encoding: 'utf8', env: process.env }).trim();
    if (out && fs.existsSync(out)) return fs.realpathSync(out);
  } catch {}
  const candidates = [
    path.join(os.homedir(), '.local/bin/claude'),
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude',
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return fs.realpathSync(c);
  }
  return null;
}

const CLAUDE_BIN = resolveClaudeBin();
if (!CLAUDE_BIN) {
  console.error('ERROR: claude binary not found. Make sure `which claude` works in your shell.');
  process.exit(1);
}
console.log(`Using claude binary: ${CLAUDE_BIN}`);

const SYSTEM_TAG_RE = /^\s*<(command-[\w-]+|local-command-[\w-]+|system-reminder|user-prompt-submit-hook|bash-stdout|bash-stderr)\b/;

function isSystemText(s) {
  return !s || SYSTEM_TAG_RE.test(s);
}

function resolveUserShell() {
  const envShell = process.env.SHELL;
  if (envShell && fs.existsSync(envShell)) return envShell;
  for (const c of ['/bin/zsh', '/bin/bash', '/bin/sh']) {
    if (fs.existsSync(c)) return c;
  }
  return '/bin/sh';
}

const USER_SHELL = resolveUserShell();

function readSessionMeta(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(64 * 1024);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    const head = buf.slice(0, n).toString('utf8');

    let cwd = null;
    let preview = null;

    for (const line of head.split('\n')) {
      if (!line) continue;
      let obj;
      try { obj = JSON.parse(line); } catch { continue; }

      if (!cwd && typeof obj.cwd === 'string') cwd = obj.cwd;

      if (!preview && obj.type === 'user' && !obj.isSidechain) {
        const content = obj.message && obj.message.content;
        let text = null;
        if (typeof content === 'string') {
          text = content;
        } else if (Array.isArray(content)) {
          const textPart = content.find(p => p && p.type === 'text' && typeof p.text === 'string');
          if (textPart) text = textPart.text;
        }
        if (text && !isSystemText(text)) preview = text;
      }

      if (cwd && preview) break;
    }

    return { cwd, preview };
  } catch {
    return { cwd: null, preview: null };
  }
}

function fallbackSlugToCwd(slug) {
  return '/' + slug.replace(/^-/, '').replace(/-/g, '/');
}

const app = express();
expressWs(app);
app.use(express.json());

const WEB_DIST = path.join(__dirname, '..', 'web', 'dist');
if (fs.existsSync(WEB_DIST)) {
  app.use(express.static(WEB_DIST));
}

app.get('/api/sessions', (_req, res) => {
  res.set('Cache-Control', 'no-store, max-age=0');
  if (!fs.existsSync(CLAUDE_PROJECTS)) return res.json({ projects: [] });

  const projects = fs.readdirSync(CLAUDE_PROJECTS)
    .map(slug => {
      const dir = path.join(CLAUDE_PROJECTS, slug);
      if (!fs.statSync(dir).isDirectory()) return null;

      const sessionFiles = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl'));
      let projectCwd = null;
      const sessions = sessionFiles
        .map(f => {
          const id = f.replace(/\.jsonl$/, '');
          const fpath = path.join(dir, f);
          const st = fs.statSync(fpath);
          const { cwd, preview } = readSessionMeta(fpath);
          if (cwd && !projectCwd) projectCwd = cwd;
          return {
            id,
            mtime: st.mtimeMs,
            createdAt: st.birthtimeMs || st.ctimeMs,
            size: st.size,
            preview: preview || null,
            archived: appState.archived.has(id),
          };
        })
        .sort((a, b) => b.mtime - a.mtime);

      return {
        slug,
        cwd: projectCwd || fallbackSlugToCwd(slug),
        cwdResolved: !!projectCwd,
        sessions,
      };
    })
    .filter(Boolean)
    .sort((a, b) => (b.sessions[0]?.mtime || 0) - (a.sessions[0]?.mtime || 0));

  res.json({ projects });
});

const sseClients = new Set();
let sseWatcher = null;
let sseDebounceTimer = null;
let activityDebounceTimer = null;

function broadcastInvalidate() {
  if (sseDebounceTimer) return;
  sseDebounceTimer = setTimeout(() => {
    sseDebounceTimer = null;
    for (const res of sseClients) {
      try { res.write(`event: invalidate\ndata: ${Date.now()}\n\n`); } catch {}
    }
  }, 500);
}

function liveSessionsSnapshot() {
  const sessions = [];
  for (const [key, entry] of liveSessions) {
    sessions.push({
      sessionKey: key,
      state: computeState(entry),
      cwd: entry.cwd,
      lastOutputAt: entry.lastOutputAt,
      idleSince: entry.idleSince,
    });
  }
  return { at: Date.now(), sessions };
}

function writeActivityTo(res) {
  try {
    res.write(`event: activity\ndata: ${JSON.stringify(liveSessionsSnapshot())}\n\n`);
  } catch {}
}

function broadcastActivity() {
  if (activityDebounceTimer) return;
  activityDebounceTimer = setTimeout(() => {
    activityDebounceTimer = null;
    for (const res of sseClients) writeActivityTo(res);
  }, 150);
}

function ensureSseWatcher() {
  if (sseWatcher || !fs.existsSync(CLAUDE_PROJECTS)) return;
  try {
    sseWatcher = fs.watch(CLAUDE_PROJECTS, { recursive: true }, () => broadcastInvalidate());
    sseWatcher.on('error', (err) => {
      console.warn(`[sse] watcher error: ${err.message}`);
      try { sseWatcher.close(); } catch {}
      sseWatcher = null;
    });
  } catch (err) {
    console.warn(`[sse] fs.watch failed: ${err.message}`);
  }
}

app.get('/api/sessions/stream', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-store, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();
  res.write(`event: hello\ndata: ${Date.now()}\n\n`);
  writeActivityTo(res);

  sseClients.add(res);
  ensureSseWatcher();

  const heartbeat = setInterval(() => {
    try { res.write(`: keepalive ${Date.now()}\n\n`); } catch {}
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
    if (sseClients.size === 0 && sseWatcher) {
      try { sseWatcher.close(); } catch {}
      sseWatcher = null;
    }
  });
});

app.get('/api/config', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({
    config: getConfig(),
    defaults: DEFAULT_CONFIG,
    bounds: { standbyTimeoutMs: { min: MIN_STANDBY_MS, max: MAX_STANDBY_MS } },
  });
});

app.patch('/api/config', (req, res) => {
  let validated;
  try {
    validated = validateConfig(req.body || {});
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  currentConfig = { ...currentConfig, ...validated };
  saveConfig(currentConfig);
  res.json({ config: currentConfig });
});

const USER_CLAUDE_DIR = path.join(os.homedir(), '.claude');

const SANDBOX_SCOPES = ['user', 'user-local', 'project', 'project-local'];

function resolveSandboxSettingsPath(scope, rawCwd) {
  if (scope === 'user') return path.join(USER_CLAUDE_DIR, 'settings.json');
  if (scope === 'user-local') return path.join(USER_CLAUDE_DIR, 'settings.local.json');
  if (scope === 'project' || scope === 'project-local') {
    const cwd = isAllowedProjectCwd(rawCwd);
    if (!cwd) return null;
    const file = scope === 'project' ? 'settings.json' : 'settings.local.json';
    return path.join(cwd, '.claude', file);
  }
  return null;
}

function loadSettingsFile(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function saveSettingsFile(filePath, obj) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2) + '\n');
}

const SANDBOX_BOOL_KEYS = [
  'enabled',
  'failIfUnavailable',
  'autoAllowBashIfSandboxed',
  'ignoreViolations',
  'enableWeakerNestedSandbox',
  'enableWeakerNetworkIsolation',
];

const SANDBOX_STRING_LIST_KEYS = ['allowUnsandboxedCommands', 'excludedCommands'];

const SANDBOX_OBJECT_KEYS = ['network', 'filesystem', 'ripgrep', 'seccomp'];

const SANDBOX_PLATFORMS = ['macos', 'linux'];

function normalizeStringList(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const item of value) {
    if (typeof item === 'string') {
      const trimmed = item.trim();
      if (trimmed) out.push(trimmed);
    }
  }
  return out;
}

function normalizePlatforms(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const item of value) {
    if (typeof item === 'string' && SANDBOX_PLATFORMS.includes(item) && !out.includes(item)) {
      out.push(item);
    }
  }
  return out;
}

function normalizeObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }
  return null;
}

function projectSandbox(raw) {
  const sandbox = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  for (const key of SANDBOX_BOOL_KEYS) out[key] = !!sandbox[key];
  for (const key of SANDBOX_STRING_LIST_KEYS) out[key] = normalizeStringList(sandbox[key]);
  for (const key of SANDBOX_OBJECT_KEYS) out[key] = normalizeObject(sandbox[key]);
  out.enabledPlatforms = normalizePlatforms(sandbox.enabledPlatforms);
  return out;
}

function parseSandboxScope(req) {
  const raw = (req.query?.scope ?? req.body?.scope ?? 'user-local');
  const scope = typeof raw === 'string' ? raw : 'user-local';
  if (!SANDBOX_SCOPES.includes(scope)) {
    return { error: `scope inválido; use: ${SANDBOX_SCOPES.join(', ')}` };
  }
  const cwd = req.query?.cwd ?? req.body?.cwd;
  const filePath = resolveSandboxSettingsPath(scope, cwd);
  if (!filePath) {
    return { error: 'cwd obrigatório e deve apontar para um diretório dentro de $HOME' };
  }
  return { scope, filePath };
}

app.get('/api/claude-settings', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const parsed = parseSandboxScope(req);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const s = loadSettingsFile(parsed.filePath);
  res.json({ scope: parsed.scope, path: parsed.filePath, sandbox: projectSandbox(s.sandbox) });
});

app.patch('/api/claude-settings', (req, res) => {
  const parsed = parseSandboxScope(req);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const body = req.body || {};
  const s = loadSettingsFile(parsed.filePath);
  if (body.sandbox && typeof body.sandbox === 'object') {
    const cur = s.sandbox && typeof s.sandbox === 'object' ? { ...s.sandbox } : {};
    const incoming = body.sandbox;

    for (const key of SANDBOX_BOOL_KEYS) {
      if (typeof incoming[key] === 'boolean') cur[key] = incoming[key];
    }
    for (const key of SANDBOX_STRING_LIST_KEYS) {
      if (Array.isArray(incoming[key])) cur[key] = normalizeStringList(incoming[key]);
    }
    for (const key of SANDBOX_OBJECT_KEYS) {
      if (Object.prototype.hasOwnProperty.call(incoming, key)) {
        const v = incoming[key];
        if (v === null) {
          delete cur[key];
        } else if (typeof v === 'object' && !Array.isArray(v)) {
          cur[key] = v;
        } else {
          return res.status(400).json({ error: `sandbox.${key} deve ser um objeto` });
        }
      }
    }
    if (Object.prototype.hasOwnProperty.call(incoming, 'enabledPlatforms')) {
      if (!Array.isArray(incoming.enabledPlatforms)) {
        return res.status(400).json({ error: 'sandbox.enabledPlatforms deve ser um array' });
      }
      const normalized = normalizePlatforms(incoming.enabledPlatforms);
      if (normalized.length !== incoming.enabledPlatforms.length) {
        return res.status(400).json({
          error: `sandbox.enabledPlatforms aceita apenas: ${SANDBOX_PLATFORMS.join(', ')}`,
        });
      }
      cur.enabledPlatforms = normalized;
    }

    s.sandbox = cur;
  }
  try {
    saveSettingsFile(parsed.filePath, s);
    res.json({ scope: parsed.scope, path: parsed.filePath, sandbox: projectSandbox(s.sandbox) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const GLOBAL_CLAUDE_MD = path.join(os.homedir(), '.claude', 'CLAUDE.md');
const HOME_DIR = os.homedir();
const HOME_DIR_REAL = (() => {
  try { return fs.realpathSync(HOME_DIR); } catch { return HOME_DIR; }
})();

function readMemoryFile(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return { exists: false, content: '', mtime: null };
    return {
      exists: true,
      content: fs.readFileSync(filePath, 'utf8'),
      mtime: stat.mtimeMs,
    };
  } catch (err) {
    if (err && err.code === 'ENOENT') return { exists: false, content: '', mtime: null };
    throw err;
  }
}

function writeMemoryFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  const stat = fs.statSync(filePath);
  return { exists: true, content, mtime: stat.mtimeMs };
}

function deleteMemoryFile(filePath) {
  try { fs.unlinkSync(filePath); } catch (err) {
    if (!err || err.code !== 'ENOENT') throw err;
  }
  return { exists: false, content: '', mtime: null };
}

function isAllowedProjectCwd(rawCwd) {
  if (typeof rawCwd !== 'string' || !rawCwd.trim()) return null;
  let resolved;
  try {
    resolved = path.resolve(rawCwd);
    if (fs.existsSync(resolved)) resolved = fs.realpathSync(resolved);
  } catch {
    return null;
  }
  const within = (resolved + path.sep).startsWith(HOME_DIR_REAL + path.sep) || resolved === HOME_DIR_REAL;
  if (!within) return null;
  return resolved;
}

app.get('/api/memory/global', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const data = readMemoryFile(GLOBAL_CLAUDE_MD);
    res.json({ path: GLOBAL_CLAUDE_MD, ...data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/memory/global', (req, res) => {
  const content = typeof req.body?.content === 'string' ? req.body.content : null;
  if (content == null) return res.status(400).json({ error: 'content obrigatório (string)' });
  try {
    if (content === '') {
      const data = deleteMemoryFile(GLOBAL_CLAUDE_MD);
      return res.json({ path: GLOBAL_CLAUDE_MD, ...data });
    }
    const data = writeMemoryFile(GLOBAL_CLAUDE_MD, content);
    res.json({ path: GLOBAL_CLAUDE_MD, ...data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PROJECT_MEMORY_VARIANTS = { shared: 'CLAUDE.md', local: 'CLAUDE.local.md' };

function projectMemoryFileName(variant) {
  return PROJECT_MEMORY_VARIANTS[variant] || PROJECT_MEMORY_VARIANTS.shared;
}

app.get('/api/memory/project', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const cwd = isAllowedProjectCwd(req.query.cwd);
  if (!cwd) return res.status(400).json({ error: 'cwd inválido ou fora do home' });
  const variant = req.query.variant === 'local' ? 'local' : 'shared';
  const filePath = path.join(cwd, projectMemoryFileName(variant));
  try {
    const data = readMemoryFile(filePath);
    res.json({ path: filePath, variant, ...data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/memory/project', (req, res) => {
  const cwd = isAllowedProjectCwd(req.body?.cwd);
  if (!cwd) return res.status(400).json({ error: 'cwd inválido ou fora do home' });
  const content = typeof req.body?.content === 'string' ? req.body.content : null;
  if (content == null) return res.status(400).json({ error: 'content obrigatório (string)' });
  if (!fs.existsSync(cwd)) return res.status(400).json({ error: 'cwd não existe' });
  const variant = req.body?.variant === 'local' ? 'local' : 'shared';
  const filePath = path.join(cwd, projectMemoryFileName(variant));
  try {
    if (content === '') {
      const data = deleteMemoryFile(filePath);
      return res.json({ path: filePath, variant, ...data });
    }
    const data = writeMemoryFile(filePath, content);
    res.json({ path: filePath, variant, ...data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function statMemoryMeta(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return { exists: false, mtime: null, size: 0 };
    return { exists: true, mtime: stat.mtimeMs, size: stat.size };
  } catch {
    return { exists: false, mtime: null, size: 0 };
  }
}

app.get('/api/memory/hierarchy', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const cwd = isAllowedProjectCwd(req.query.cwd);
  if (!cwd) return res.status(400).json({ error: 'cwd inválido ou fora do home' });

  const entries = [];
  entries.push({
    scope: 'global',
    variant: 'shared',
    dir: path.dirname(GLOBAL_CLAUDE_MD),
    path: GLOBAL_CLAUDE_MD,
    ...statMemoryMeta(GLOBAL_CLAUDE_MD),
  });

  const dirs = [];
  let cur = cwd;
  while (cur && (cur + path.sep).startsWith(HOME_DIR_REAL + path.sep)) {
    dirs.unshift(cur);
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  if (!dirs.includes(HOME_DIR_REAL) && (HOME_DIR_REAL === cwd || cwd.startsWith(HOME_DIR_REAL + path.sep))) {
    dirs.unshift(HOME_DIR_REAL);
  }

  for (const dir of dirs) {
    for (const variant of ['shared', 'local']) {
      const fp = path.join(dir, projectMemoryFileName(variant));
      entries.push({
        scope: dir === cwd ? 'project' : 'ancestor',
        variant,
        dir,
        path: fp,
        ...statMemoryMeta(fp),
      });
    }
  }

  res.json({ cwd, entries });
});

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
    if (inFence) { out.push(line); continue; }

    const m = IMPORT_LINE_RE.exec(line);
    if (!m) { out.push(line); continue; }

    const rawPath = m[2];
    const resolved = resolveImportPath(rawPath, basePath);
    const entry = { raw: rawPath, resolved, basePath, depth, exists: false, error: null };

    if (!resolved) {
      entry.error = 'invalid_path';
      imports.push(entry);
      out.push(line);
      continue;
    }

    const withinHome = (resolved + path.sep).startsWith(HOME_DIR_REAL + path.sep) || resolved === HOME_DIR_REAL;
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
    try { stat = fs.statSync(resolved); }
    catch { stat = null; }
    if (!stat || !stat.isFile()) {
      entry.error = 'not_found';
      imports.push(entry);
      out.push(`<!-- @${rawPath} — arquivo não encontrado -->`);
      continue;
    }

    entry.exists = true;
    let inner;
    try { inner = fs.readFileSync(resolved, 'utf8'); }
    catch (err) {
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

app.post('/api/memory/expand', (req, res) => {
  const content = typeof req.body?.content === 'string' ? req.body.content : null;
  if (content == null) return res.status(400).json({ error: 'content obrigatório (string)' });
  const rawBase = typeof req.body?.basePath === 'string' ? req.body.basePath : '';
  let basePath = path.resolve(rawBase || HOME_DIR_REAL);
  const withinHome = (basePath + path.sep).startsWith(HOME_DIR_REAL + path.sep) || basePath === HOME_DIR_REAL;
  if (!withinHome) return res.status(400).json({ error: 'basePath fora do home' });
  try {
    const result = expandImports(content, basePath);
    res.json({ basePath, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const USER_AGENTS_DIR = path.join(os.homedir(), '.claude', 'agents');
const USER_SKILLS_DIR = path.join(os.homedir(), '.claude', 'skills');
const KNOWN_TOOLS = [
  'Bash','Edit','Glob','Grep','Read','Write','NotebookEdit',
  'WebFetch','WebSearch','TodoWrite','Task','TaskCreate','TaskUpdate',
  'Agent','SlashCommand','BashOutput','KillBash','ExitPlanMode',
];

function isValidName(name) {
  return typeof name === 'string' && NAME_RE.test(name);
}

function parseFrontmatter(text) {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text || '');
  if (!match) return { frontmatter: {}, body: text || '' };
  const yaml = match[1];
  const body = match[2] || '';
  const fm = {};
  for (const rawLine of yaml.split('\n')) {
    const line = rawLine.trimEnd();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf(':');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (!key) continue;
    if (value.startsWith('[') && value.endsWith(']')) {
      const inner = value.slice(1, -1).trim();
      fm[key] = inner ? inner.split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean) : [];
    } else if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      fm[key] = value.slice(1, -1);
    } else {
      fm[key] = value;
    }
  }
  return { frontmatter: fm, body };
}

function escapeYamlString(s) {
  if (s === '' || /[:#\-?&*!|>'"%@`{}\[\],\n\r]/.test(s) || /^\s|\s$/.test(s)) {
    return JSON.stringify(s);
  }
  return s;
}

function buildFrontmatter(fields) {
  const lines = ['---'];
  for (const [key, value] of Object.entries(fields)) {
    if (value == null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      lines.push(`${key}: [${value.map((v) => escapeYamlString(String(v))).join(', ')}]`);
    } else {
      const str = String(value);
      if (str.includes('\n')) {
        lines.push(`${key}: |`);
        for (const seg of str.split('\n')) lines.push(`  ${seg}`);
      } else {
        lines.push(`${key}: ${escapeYamlString(str)}`);
      }
    }
  }
  lines.push('---', '');
  return lines.join('\n');
}

function resolveScopeDir(scope, kind, rawCwd) {
  if (scope === 'user') {
    return kind === 'agent' ? USER_AGENTS_DIR : USER_SKILLS_DIR;
  }
  if (scope === 'project') {
    const cwd = isAllowedProjectCwd(rawCwd);
    if (!cwd) return null;
    return path.join(cwd, '.claude', kind === 'agent' ? 'agents' : 'skills');
  }
  return null;
}

function listAgentsIn(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.md')) continue;
    const fpath = path.join(dir, f);
    let stat;
    try { stat = fs.statSync(fpath); } catch { continue; }
    if (!stat.isFile()) continue;
    const name = f.replace(/\.md$/, '');
    let description = '';
    try {
      const head = fs.readFileSync(fpath, 'utf8').slice(0, 4096);
      const { frontmatter } = parseFrontmatter(head);
      description = typeof frontmatter.description === 'string' ? frontmatter.description : '';
    } catch {}
    entries.push({ name, description, path: fpath, mtime: stat.mtimeMs });
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

function listSkillsIn(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = [];
  for (const f of fs.readdirSync(dir)) {
    const fpath = path.join(dir, f);
    let stat;
    try { stat = fs.statSync(fpath); } catch { continue; }
    if (!stat.isDirectory()) continue;
    const skillFile = path.join(fpath, 'SKILL.md');
    if (!fs.existsSync(skillFile)) continue;
    let description = '';
    try {
      const head = fs.readFileSync(skillFile, 'utf8').slice(0, 4096);
      const { frontmatter } = parseFrontmatter(head);
      description = typeof frontmatter.description === 'string' ? frontmatter.description : '';
    } catch {}
    entries.push({ name: f, description, path: skillFile, dir: fpath, mtime: stat.mtimeMs });
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

function listSkillExtras(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  const walk = (cur, rel) => {
    for (const f of fs.readdirSync(cur)) {
      if (rel === '' && f === 'SKILL.md') continue;
      const fpath = path.join(cur, f);
      const relPath = rel ? `${rel}/${f}` : f;
      let stat;
      try { stat = fs.statSync(fpath); } catch { continue; }
      if (stat.isDirectory()) walk(fpath, relPath);
      else if (stat.isFile()) out.push({ relativePath: relPath, size: stat.size });
    }
  };
  walk(dir, '');
  return out.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

function agentResponse(name, dir) {
  const filePath = path.join(dir, `${name}.md`);
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, 'utf8');
  const { frontmatter, body } = parseFrontmatter(content);
  return {
    name,
    path: filePath,
    description: typeof frontmatter.description === 'string' ? frontmatter.description : '',
    model: typeof frontmatter.model === 'string' ? frontmatter.model : '',
    tools: Array.isArray(frontmatter.tools)
      ? frontmatter.tools
      : (typeof frontmatter.tools === 'string' && frontmatter.tools.trim())
        ? frontmatter.tools.split(',').map((s) => s.trim()).filter(Boolean)
        : [],
    body,
    raw: content,
  };
}

function skillResponse(name, dir) {
  const skillDir = path.join(dir, name);
  const filePath = path.join(skillDir, 'SKILL.md');
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, 'utf8');
  const { frontmatter, body } = parseFrontmatter(content);
  return {
    name,
    path: filePath,
    dir: skillDir,
    description: typeof frontmatter.description === 'string' ? frontmatter.description : '',
    body,
    raw: content,
    extras: listSkillExtras(skillDir),
  };
}

function rmDirRecursive(dir) {
  if (typeof fs.rmSync === 'function') {
    fs.rmSync(dir, { recursive: true, force: true });
  } else {
    fs.rmdirSync(dir, { recursive: true });
  }
}

app.get('/api/agents', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const out = { user: listAgentsIn(USER_AGENTS_DIR), project: [] };
  if (req.query.cwd) {
    const dir = resolveScopeDir('project', 'agent', req.query.cwd);
    if (dir) out.project = listAgentsIn(dir);
  }
  res.json(out);
});

app.get('/api/agents/file', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const scope = req.query.scope;
  const name = req.query.name;
  const dir = resolveScopeDir(scope, 'agent', req.query.cwd);
  if (!dir) return res.status(400).json({ error: 'scope inválido' });
  if (!isValidName(name)) return res.status(400).json({ error: 'nome inválido' });
  const data = agentResponse(String(name), dir);
  if (!data) return res.status(404).json({ error: 'agente não encontrado' });
  res.json(data);
});

app.put('/api/agents/file', (req, res) => {
  const body = req.body || {};
  const dir = resolveScopeDir(body.scope, 'agent', body.cwd);
  if (!dir) return res.status(400).json({ error: 'scope inválido' });
  const name = body.name;
  if (!isValidName(name)) return res.status(400).json({ error: 'nome inválido (use a-z 0-9 -)' });
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  if (!description) return res.status(400).json({ error: 'description obrigatório' });
  const model = typeof body.model === 'string' ? body.model.trim() : '';
  const tools = Array.isArray(body.tools) ? body.tools.filter((t) => typeof t === 'string' && t.trim()) : [];
  const promptBody = typeof body.body === 'string' ? body.body : '';
  const previousName = typeof body.previousName === 'string' && isValidName(body.previousName) ? body.previousName : null;

  const fm = { name, description };
  if (model) fm.model = model;
  if (tools.length > 0) fm.tools = tools;
  const fullContent = buildFrontmatter(fm) + (promptBody.endsWith('\n') || promptBody === '' ? promptBody : promptBody + '\n');

  try {
    fs.mkdirSync(dir, { recursive: true });
    const targetFile = path.join(dir, `${name}.md`);
    if (previousName && previousName !== name) {
      const oldFile = path.join(dir, `${previousName}.md`);
      if (fs.existsSync(targetFile)) {
        return res.status(409).json({ error: `já existe um agente chamado "${name}"` });
      }
      if (fs.existsSync(oldFile)) fs.renameSync(oldFile, targetFile);
    } else if (!previousName && fs.existsSync(targetFile)) {
      return res.status(409).json({ error: `já existe um agente chamado "${name}"` });
    }
    fs.writeFileSync(targetFile, fullContent, 'utf8');
    res.json(agentResponse(name, dir));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/agents/file', (req, res) => {
  const scope = req.query.scope;
  const name = req.query.name;
  const dir = resolveScopeDir(scope, 'agent', req.query.cwd);
  if (!dir) return res.status(400).json({ error: 'scope inválido' });
  if (!isValidName(name)) return res.status(400).json({ error: 'nome inválido' });
  const filePath = path.join(dir, `${name}.md`);
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/skills', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const out = { user: listSkillsIn(USER_SKILLS_DIR), project: [] };
  if (req.query.cwd) {
    const dir = resolveScopeDir('project', 'skill', req.query.cwd);
    if (dir) out.project = listSkillsIn(dir);
  }
  res.json(out);
});

app.get('/api/skills/file', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const scope = req.query.scope;
  const name = req.query.name;
  const dir = resolveScopeDir(scope, 'skill', req.query.cwd);
  if (!dir) return res.status(400).json({ error: 'scope inválido' });
  if (!isValidName(name)) return res.status(400).json({ error: 'nome inválido' });
  const data = skillResponse(String(name), dir);
  if (!data) return res.status(404).json({ error: 'skill não encontrada' });
  res.json(data);
});

app.put('/api/skills/file', (req, res) => {
  const body = req.body || {};
  const dir = resolveScopeDir(body.scope, 'skill', body.cwd);
  if (!dir) return res.status(400).json({ error: 'scope inválido' });
  const name = body.name;
  if (!isValidName(name)) return res.status(400).json({ error: 'nome inválido (use a-z 0-9 -)' });
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  if (!description) return res.status(400).json({ error: 'description obrigatório' });
  const promptBody = typeof body.body === 'string' ? body.body : '';
  const previousName = typeof body.previousName === 'string' && isValidName(body.previousName) ? body.previousName : null;

  const fullContent = buildFrontmatter({ name, description }) + (promptBody.endsWith('\n') || promptBody === '' ? promptBody : promptBody + '\n');

  try {
    fs.mkdirSync(dir, { recursive: true });
    const targetDir = path.join(dir, name);
    if (previousName && previousName !== name) {
      const oldDir = path.join(dir, previousName);
      if (fs.existsSync(targetDir)) {
        return res.status(409).json({ error: `já existe uma skill chamada "${name}"` });
      }
      if (fs.existsSync(oldDir)) fs.renameSync(oldDir, targetDir);
    } else if (!previousName && fs.existsSync(targetDir)) {
      return res.status(409).json({ error: `já existe uma skill chamada "${name}"` });
    }
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(targetDir, 'SKILL.md'), fullContent, 'utf8');
    res.json(skillResponse(name, dir));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/skills/file', (req, res) => {
  const scope = req.query.scope;
  const name = req.query.name;
  const dir = resolveScopeDir(scope, 'skill', req.query.cwd);
  if (!dir) return res.status(400).json({ error: 'scope inválido' });
  if (!isValidName(name)) return res.status(400).json({ error: 'nome inválido' });
  const skillDir = path.join(dir, String(name));
  try {
    if (fs.existsSync(skillDir)) rmDirRecursive(skillDir);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/known-tools', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ tools: KNOWN_TOOLS });
});

app.post('/api/sessions/:id/archive', (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id) return res.status(400).json({ error: 'id obrigatório' });
  appState.archived.add(id);
  saveState(appState);
  broadcastInvalidate();
  res.json({ ok: true, archived: true });
});

app.post('/api/sessions/:id/unarchive', (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id) return res.status(400).json({ error: 'id obrigatório' });
  appState.archived.delete(id);
  saveState(appState);
  broadcastInvalidate();
  res.json({ ok: true, archived: false });
});

app.get('/api/prefs', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(appState.prefs);
});

app.put('/api/prefs', (req, res) => {
  appState.prefs = sanitizePrefs(req.body);
  saveState(appState);
  res.json(appState.prefs);
});

app.delete('/api/sessions/:id', (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id) return res.status(400).json({ error: 'id obrigatório' });
  const fpath = findSessionFile(id);
  if (!fpath) return res.status(404).json({ error: 'sessão não encontrada' });
  try {
    fs.unlinkSync(fpath);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
  removeFooterCacheFor(id);
  if (appState.archived.delete(id)) saveState(appState);
  broadcastInvalidate();
  res.json({ ok: true, deleted: true });
});

const FOOTER_ID_RE = /^[A-Za-z0-9._-]{1,128}$/;

function removeFooterCacheFor(id) {
  if (!FOOTER_ID_RE.test(id)) return;
  try { fs.unlinkSync(path.join(STATUSLINE_CACHE_DIR, `${id}.json`)); } catch {}
}

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function gitInfo(cwd) {
  if (!cwd) return { branch: null, dirty: false };
  try {
    const branch = execSync('git --no-optional-locks symbolic-ref --short HEAD', {
      cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim() || null;
    const status = execSync('git --no-optional-locks status --porcelain', {
      cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    });
    return { branch, dirty: status.length > 0 };
  } catch {
    return { branch: null, dirty: false };
  }
}

function parseNumstat(raw) {
  let added = 0;
  let removed = 0;
  for (const line of raw.split('\n')) {
    if (!line) continue;
    const [a, r] = line.split('\t');
    if (a === '-' || r === '-') continue;
    const ai = parseInt(a, 10);
    const ri = parseInt(r, 10);
    if (Number.isFinite(ai)) added += ai;
    if (Number.isFinite(ri)) removed += ri;
  }
  return { added, removed };
}

function countTextLines(s) {
  if (!s) return 0;
  let n = 0;
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 10) n++;
  if (s.charCodeAt(s.length - 1) !== 10) n++;
  return n;
}

const UNTRACKED_MAX_BYTES = 2 * 1024 * 1024;

function uncommittedLineStats(cwd) {
  if (!cwd || !fs.existsSync(cwd)) return { added: null, removed: null };
  const tracked = parseNumstat(runGit(cwd, 'diff --numstat HEAD'));
  let added = tracked.added;
  let removed = tracked.removed;
  const untrackedRaw = runGit(cwd, 'ls-files --others --exclude-standard');
  for (const rel of untrackedRaw.split('\n').map((s) => s.trim()).filter(Boolean)) {
    try {
      const p = path.join(cwd, rel);
      const st = fs.statSync(p);
      if (!st.isFile() || st.size > UNTRACKED_MAX_BYTES) continue;
      const content = fs.readFileSync(p, 'utf8');
      if (content.indexOf('\0') !== -1) continue;
      added += countTextLines(content);
    } catch {}
  }
  return { added, removed };
}

function buildFooterPayload(id) {
  const cache = readJsonSafe(path.join(STATUSLINE_CACHE_DIR, `${id}.json`));
  const global = readJsonSafe(STATUSLINE_GLOBAL_META);
  const cwd = cache?.workspace?.current_dir || cache?.cwd || null;
  const { branch, dirty } = gitInfo(cwd);
  const { added: linesAdded, removed: linesRemoved } = uncommittedLineStats(cwd);

  const ctxPct = cache?.context_window?.used_percentage;
  const exceeds200k = cache?.exceeds_200k_tokens === true;

  const five = cache?.rate_limits?.five_hour || global?.rate_limits?.five_hour || null;
  const seven = cache?.rate_limits?.seven_day || global?.rate_limits?.seven_day || null;

  return {
    hasCache: !!cache,
    cwd,
    dirLabel: cwd ? (cwd === os.homedir() ? '~' : path.basename(cwd)) : null,
    branch,
    dirty,
    model: cache?.model?.display_name || null,
    contextPct: typeof ctxPct === 'number' ? ctxPct : null,
    exceeds200k,
    linesAdded,
    linesRemoved,
    costUsd: cache?.cost?.total_cost_usd ?? null,
    fiveHourPct: typeof five?.used_percentage === 'number' ? five.used_percentage : null,
    fiveHourResetsAt: typeof five?.resets_at === 'number' ? five.resets_at : null,
    sevenDayPct: typeof seven?.used_percentage === 'number' ? seven.used_percentage : null,
    sevenDayResetsAt: typeof seven?.resets_at === 'number' ? seven.resets_at : null,
    cacheUpdatedAt: cache ? (() => {
      try { return fs.statSync(path.join(STATUSLINE_CACHE_DIR, `${id}.json`)).mtimeMs; } catch { return null; }
    })() : null,
    globalUpdatedAt: global?.at ? global.at * 1000 : null,
  };
}

function resolveSessionCwd(id) {
  const fpath = findSessionFile(id);
  if (!fpath) return null;
  const meta = readSessionMeta(fpath);
  if (meta.cwd) return meta.cwd;
  const slug = path.basename(path.dirname(fpath));
  return fallbackSlugToCwd(slug);
}

function runGit(cwd, args) {
  try {
    return execSync(`git --no-optional-locks ${args}`, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch {
    return '';
  }
}

app.get('/api/sessions/:id/diff', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const id = String(req.params.id || '').trim();
  if (!FOOTER_ID_RE.test(id)) return res.status(400).json({ error: 'id inválido' });
  const cwd = resolveSessionCwd(id);
  if (!cwd || !fs.existsSync(cwd)) {
    return res.json({ cwd: null, branch: null, unstaged: '', staged: '', untracked: [] });
  }
  const branch = runGit(cwd, 'symbolic-ref --short HEAD').trim() || null;
  const unstaged = runGit(cwd, 'diff --no-color');
  const staged = runGit(cwd, 'diff --no-color --staged');
  const untrackedRaw = runGit(cwd, 'ls-files --others --exclude-standard');
  const untracked = untrackedRaw.split('\n').map((s) => s.trim()).filter(Boolean);
  res.json({ cwd, branch, unstaged, staged, untracked });
});

function scanJsonlLines(filePath, onLine) {
  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split('\n')) {
    if (!line) continue;
    let obj;
    try { obj = JSON.parse(line); } catch { continue; }
    onLine(obj);
  }
}

function findLastToolUse(sessionFile, toolName) {
  let last = null;
  try {
    scanJsonlLines(sessionFile, (obj) => {
      const content = obj?.message?.content;
      if (!Array.isArray(content)) return;
      for (const part of content) {
        if (part && part.type === 'tool_use' && part.name === toolName) {
          last = { input: part.input, timestamp: obj.timestamp || null };
        }
      }
    });
  } catch {}
  return last;
}

app.get('/api/sessions/:id/tasks', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const id = String(req.params.id || '').trim();
  if (!FOOTER_ID_RE.test(id)) return res.status(400).json({ error: 'id inválido' });
  const fpath = findSessionFile(id);
  if (!fpath) return res.json({ todos: [], updatedAt: null });
  const last = findLastToolUse(fpath, 'TodoWrite');
  const todos = Array.isArray(last?.input?.todos) ? last.input.todos : [];
  res.json({ todos, updatedAt: last?.timestamp || null });
});

app.get('/api/sessions/:id/plan', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const id = String(req.params.id || '').trim();
  if (!FOOTER_ID_RE.test(id)) return res.status(400).json({ error: 'id inválido' });
  const fpath = findSessionFile(id);
  if (!fpath) return res.json({ plan: null, updatedAt: null });
  const last = findLastToolUse(fpath, 'ExitPlanMode');
  const plan = typeof last?.input?.plan === 'string' ? last.input.plan : null;
  res.json({ plan, updatedAt: last?.timestamp || null });
});

app.get('/api/sessions/:id/footer', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const id = String(req.params.id || '').trim();
  if (!FOOTER_ID_RE.test(id)) return res.status(400).json({ error: 'id inválido' });
  res.json(buildFooterPayload(id));
});

app.post('/api/sessions/:key/close', async (req, res) => {
  const key = String(req.params.key || '').trim();
  const entry = liveSessions.get(key);
  if (!entry) return res.status(404).json({ error: 'session not live' });
  try { entry.pty.kill(); } catch {}
  const timeout = new Promise((resolve) => setTimeout(resolve, 3000));
  await Promise.race([entry.exited, timeout]);
  res.json({ ok: true });
});

app.get('/api/defaults', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  const defaults = { model: null, effort: null, permissionMode: 'default' };
  const files = ['settings.json', 'settings.local.json'];
  for (const name of files) {
    const p = path.join(os.homedir(), '.claude', name);
    try {
      const s = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (typeof s.model === 'string') defaults.model = s.model;
      if (typeof s.effortLevel === 'string') defaults.effort = s.effortLevel;
      if (typeof s.permissionMode === 'string') defaults.permissionMode = s.permissionMode;
    } catch {}
  }
  res.json(defaults);
});

app.get('/api/browse', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const requested = req.query.path ? String(req.query.path) : os.homedir();
  const showHidden = req.query.hidden === '1';
  try {
    const abs = path.resolve(requested);
    const st = fs.statSync(abs);
    if (!st.isDirectory()) return res.status(400).json({ error: 'not a directory' });
    const entries = fs.readdirSync(abs, { withFileTypes: true })
      .filter(e => e.isDirectory() && (showHidden || !e.name.startsWith('.')))
      .map(e => ({ name: e.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    res.json({
      path: abs,
      parent: path.dirname(abs) === abs ? null : path.dirname(abs),
      home: os.homedir(),
      entries,
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

const VALID_EFFORT = new Set(['low', 'medium', 'high', 'xhigh', 'max']);
const VALID_PERMISSION_MODE = new Set(['default', 'acceptEdits', 'plan', 'auto', 'dontAsk', 'bypassPermissions']);
const VALID_MODEL_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,64}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STATUSLINE_TAP = path.join(__dirname, 'scripts', 'statusline-tap.sh');
const STATUSLINE_CACHE_DIR = path.join(os.homedir(), '.claude-code-studio', 'statusline-cache');
const STATUSLINE_GLOBAL_META = path.join(os.homedir(), '.claude-code-studio', 'global-meta.json');

function buildStatusLineSettingsArg() {
  try {
    if (!fs.existsSync(STATUSLINE_TAP)) return null;
  } catch {
    return null;
  }
  return JSON.stringify({
    statusLine: { type: 'command', command: STATUSLINE_TAP },
  });
}

function buildPtyArgs({ resume, sessionId, model, effort, permissionMode }) {
  const args = [];
  const tapSettings = buildStatusLineSettingsArg();
  if (tapSettings) args.push('--settings', tapSettings);
  if (resume) {
    args.push('--resume', resume);
  } else {
    if (sessionId && UUID_RE.test(sessionId)) args.push('--session-id', sessionId);
    if (model && VALID_MODEL_RE.test(model)) args.push('--model', model);
    if (effort && VALID_EFFORT.has(effort)) args.push('--effort', effort);
    if (permissionMode && VALID_PERMISSION_MODE.has(permissionMode)) {
      args.push('--permission-mode', permissionMode);
    }
  }
  return args;
}

function buildChildEnv() {
  const env = { ...process.env };
  const claudeDir = path.dirname(CLAUDE_BIN);
  if (!env.PATH || !env.PATH.split(':').includes(claudeDir)) {
    env.PATH = `${claudeDir}:${env.PATH || ''}`;
  }
  return env;
}

function spawnClaudePty({ cwd, args }) {
  const targetCwd = cwd && fs.existsSync(cwd) ? cwd : os.homedir();
  console.log(`[pty] spawn: claude ${args.join(' ')}  (cwd=${targetCwd})`);
  return pty.spawn(CLAUDE_BIN, args, {
    name: 'xterm-256color',
    cols: 80,
    rows: 30,
    cwd: targetCwd,
    env: buildChildEnv(),
  });
}

function safeSend(ws, obj) {
  if (ws.readyState === ws.OPEN) {
    try { ws.send(JSON.stringify(obj)); } catch {}
  }
}

const liveSessions = new Map();
const ACTIVE_OUTPUT_WINDOW_MS = 600;
const TAIL_BUFFER_SIZE = 4096;

const ANSI_RE = /\x1b\[[0-9;?]*[A-Za-z]|\x1b\][^\x07]*\x07|\x1b[=>]|\r/g;

function stripAnsi(s) {
  return s.replace(ANSI_RE, '');
}

const APPROVAL_PATTERNS = [
  /❯\s*\d+\.\s+(Yes|No|Approve|Allow|Accept|Always|Skip|Don't)/i,
  /Do you want to (proceed|allow|approve|continue)/i,
  /Would you like to (proceed|allow|continue)/i,
];

function needsApproval(tail) {
  const s = stripAnsi(tail);
  return APPROVAL_PATTERNS.some((re) => re.test(s));
}

const DEFAULT_CONFIG = Object.freeze({
  standbyTimeoutMs: 10 * 60 * 1000,
});

const CONFIG_DIR = path.join(os.homedir(), '.claude-code-studio');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const MIN_STANDBY_MS = 60 * 1000;
const MAX_STANDBY_MS = 24 * 60 * 60 * 1000;

function validateConfig(partial) {
  const out = {};
  if (partial.standbyTimeoutMs !== undefined) {
    const v = Number(partial.standbyTimeoutMs);
    if (!Number.isFinite(v) || v < MIN_STANDBY_MS || v > MAX_STANDBY_MS) {
      throw new Error(`standbyTimeoutMs must be between ${MIN_STANDBY_MS} and ${MAX_STANDBY_MS}`);
    }
    out.standbyTimeoutMs = Math.round(v);
  }
  return out;
}

function loadConfig() {
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    const validated = validateConfig(raw);
    return { ...DEFAULT_CONFIG, ...validated };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function saveConfig(cfg) {
  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
  } catch (err) {
    console.warn(`[config] save failed: ${err.message}`);
  }
}

let currentConfig = loadConfig();

function getConfig() {
  return currentConfig;
}

const STATE_FILE = path.join(CONFIG_DIR, 'state.json');

function defaultPrefs() {
  return { sections: {}, expanded: [], projectOrder: [] };
}

function sanitizePrefs(raw) {
  if (!raw || typeof raw !== 'object') return defaultPrefs();
  const sectionsRaw = raw.sections && typeof raw.sections === 'object' ? raw.sections : {};
  const sections = {};
  for (const [name, value] of Object.entries(sectionsRaw)) {
    if (!value || typeof value !== 'object') continue;
    sections[name] = {
      groupByProject: typeof value.groupByProject === 'boolean' ? value.groupByProject : true,
      sortBy:
        value.sortBy === 'createdAt' || value.sortBy === 'lastResponse'
          ? value.sortBy
          : 'lastResponse',
    };
  }
  const expanded = Array.isArray(raw.expanded)
    ? raw.expanded.filter(x => typeof x === 'string')
    : [];
  const projectOrder = Array.isArray(raw.projectOrder)
    ? raw.projectOrder.filter(x => typeof x === 'string')
    : [];
  return { sections, expanded, projectOrder };
}

const STATE_VERSION = 1;

function migrateState(raw) {
  // v0 (no `version` field) has the same shape as v1 — no transform needed.
  // Add future steps here: if (raw.version === 1) raw = migrateV1toV2(raw); etc.
  return raw;
}

function loadState() {
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    const migrated = migrateState(raw);
    const archived = Array.isArray(migrated.archived)
      ? migrated.archived.filter(x => typeof x === 'string')
      : [];
    return { archived: new Set(archived), prefs: sanitizePrefs(migrated.prefs) };
  } catch {
    return { archived: new Set(), prefs: defaultPrefs() };
  }
}

function saveState(state) {
  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    const payload = {
      version: STATE_VERSION,
      archived: [...state.archived],
      prefs: state.prefs,
    };
    const tmp = `${STATE_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(payload, null, 2));
    fs.renameSync(tmp, STATE_FILE);
  } catch (err) {
    console.warn(`[state] save failed: ${err.message}`);
  }
}

const appState = loadState();

function findSessionFile(id) {
  if (!fs.existsSync(CLAUDE_PROJECTS)) return null;
  const safeId = String(id).replace(/[^A-Za-z0-9._-]/g, '');
  if (!safeId || safeId !== String(id)) return null;
  for (const slug of fs.readdirSync(CLAUDE_PROJECTS)) {
    const fpath = path.join(CLAUDE_PROJECTS, slug, `${safeId}.jsonl`);
    if (fs.existsSync(fpath)) return fpath;
  }
  return null;
}

const IDLE_SWEEP_INTERVAL_MS = 30 * 1000;

setInterval(() => {
  const now = Date.now();
  const timeout = getConfig().standbyTimeoutMs;
  for (const [key, entry] of liveSessions) {
    if (computeState(entry) !== 'standby') continue;
    if (entry.idleSince !== null && now - entry.idleSince >= timeout) {
      console.log(`[pty] auto-kill ${key} after ${Math.round((now - entry.idleSince) / 1000)}s standby`);
      try { entry.pty.kill(); } catch {}
    }
  }
}, IDLE_SWEEP_INTERVAL_MS).unref();

function computeState(entry) {
  if (!entry) return 'finalizado';
  if (entry.focusedWs && entry.focusedWs.size > 0) return 'ativo';
  if (needsApproval(entry.tail)) return 'aguardando';
  if (Date.now() - entry.lastOutputAt < ACTIVE_OUTPUT_WINDOW_MS) return 'ativo';
  return 'standby';
}

function maybeBroadcastStateChange(entry) {
  const current = computeState(entry);
  if (current !== entry.cachedState) {
    entry.cachedState = current;
    broadcastActivity();
  }
}

function scheduleStandbyRecheck(entry) {
  if (entry.standbyRecheckTimer) clearTimeout(entry.standbyRecheckTimer);
  entry.standbyRecheckTimer = setTimeout(() => {
    entry.standbyRecheckTimer = null;
    if (liveSessions.get(entry.sessionKey) === entry) maybeBroadcastStateChange(entry);
  }, ACTIVE_OUTPUT_WINDOW_MS + 100);
}

function getOrCreateLiveSession(sessionKey, { cwd, args }) {
  const existing = liveSessions.get(sessionKey);
  if (existing) return existing;

  const term = spawnClaudePty({ cwd, args });
  let resolveExit;
  const exited = new Promise((resolve) => { resolveExit = resolve; });
  const entry = {
    sessionKey,
    pty: term,
    cwd,
    args,
    subscribers: new Set(),
    focusedWs: new Set(),
    lastOutputAt: Date.now(),
    idleSince: Date.now(),
    tail: '',
    cachedState: 'ativo',
    exited,
  };

  term.onData(data => {
    entry.lastOutputAt = Date.now();
    entry.tail += data;
    if (entry.tail.length > TAIL_BUFFER_SIZE) {
      entry.tail = entry.tail.slice(-TAIL_BUFFER_SIZE);
    }
    for (const ws of entry.subscribers) safeSend(ws, { type: 'data', data });
    maybeBroadcastStateChange(entry);
    scheduleStandbyRecheck(entry);
  });

  term.onExit(({ exitCode }) => {
    if (entry.standbyRecheckTimer) clearTimeout(entry.standbyRecheckTimer);
    for (const ws of entry.subscribers) {
      safeSend(ws, { type: 'exit', exitCode });
      try { ws.close(); } catch {}
    }
    entry.subscribers.clear();
    liveSessions.delete(sessionKey);
    broadcastActivity();
    resolveExit();
  });

  liveSessions.set(sessionKey, entry);
  broadcastActivity();
  scheduleStandbyRecheck(entry);
  return entry;
}

app.ws('/pty', (ws, req) => {
  const sessionKey = req.query.sessionKey ? String(req.query.sessionKey).trim() : '';
  if (!sessionKey) {
    safeSend(ws, { type: 'error', message: 'sessionKey obrigatório' });
    try { ws.close(); } catch {}
    return;
  }

  const args = buildPtyArgs({ ...req.query, sessionId: sessionKey });
  let entry;
  try {
    entry = getOrCreateLiveSession(sessionKey, { cwd: req.query.cwd, args });
  } catch (err) {
    safeSend(ws, { type: 'error', message: `Failed to spawn claude: ${err.message}` });
    try { ws.close(); } catch {}
    return;
  }

  entry.subscribers.add(ws);
  entry.idleSince = null;
  maybeBroadcastStateChange(entry);

  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (msg.type === 'input') {
      try { entry.pty.write(msg.data); } catch {}
    } else if (msg.type === 'resize') {
      try { entry.pty.resize(msg.cols, msg.rows); } catch {}
    } else if (msg.type === 'focus') {
      if (msg.active) entry.focusedWs.add(ws);
      else entry.focusedWs.delete(ws);
      maybeBroadcastStateChange(entry);
    }
  });

  ws.on('close', () => {
    entry.subscribers.delete(ws);
    entry.focusedWs.delete(ws);
    if (entry.subscribers.size === 0) {
      entry.idleSince = Date.now();
    }
    maybeBroadcastStateChange(entry);
  });
});

app.ws('/pty/shell', (ws, req) => {
  const rawCwd = req.query.cwd ? String(req.query.cwd) : '';
  const targetCwd = rawCwd && fs.existsSync(rawCwd) ? rawCwd : os.homedir();
  let term;
  try {
    term = pty.spawn(USER_SHELL, ['-l'], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: targetCwd,
      env: { ...process.env, TERM: 'xterm-256color' },
    });
  } catch (err) {
    safeSend(ws, { type: 'error', message: `shell spawn falhou: ${err.message}` });
    try { ws.close(); } catch {}
    return;
  }

  term.onData((data) => safeSend(ws, { type: 'data', data }));
  term.onExit(({ exitCode }) => {
    safeSend(ws, { type: 'exit', exitCode });
    try { ws.close(); } catch {}
  });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (msg.type === 'input') {
      try { term.write(msg.data); } catch {}
    } else if (msg.type === 'resize') {
      try { term.resize(msg.cols, msg.rows); } catch {}
    }
  });

  ws.on('close', () => {
    try { term.kill(); } catch {}
  });
});

if (fs.existsSync(WEB_DIST)) {
  app.get(/^\/(?!api|pty).*/, (_req, res) => {
    res.sendFile(path.join(WEB_DIST, 'index.html'));
  });
}

app.listen(PORT, HOST, () => {
  console.log(`Claude Code Studio rodando em http://${HOST}:${PORT}`);
});
