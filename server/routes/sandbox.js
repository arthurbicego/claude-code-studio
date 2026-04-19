const fs = require('node:fs');
const path = require('node:path');
const { USER_CLAUDE_DIR, isAllowedProjectCwd } = require('../paths');
const {
  DEFAULT_CONFIG,
  MIN_STANDBY_MS,
  MAX_STANDBY_MS,
  validateConfig,
  getConfig,
  updateConfig,
} = require('../config');

const SANDBOX_SCOPES = ['user', 'user-local', 'project', 'project-local'];

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
  fs.writeFileSync(filePath, `${JSON.stringify(obj, null, 2)}\n`);
}

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
  const raw = req.query?.scope ?? req.body?.scope ?? 'user-local';
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

function register(app) {
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
    const cfg = updateConfig(validated);
    res.json({ config: cfg });
  });

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
        if (Object.hasOwn(incoming, key)) {
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
      if (Object.hasOwn(incoming, 'enabledPlatforms')) {
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
}

module.exports = { register };
