const { execSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { isAllowedProjectCwd } = require('../paths');

function resolveVSCodeBin() {
  try {
    const out = execSync('which code', { encoding: 'utf8', env: process.env }).trim();
    if (out && fs.existsSync(out)) return fs.realpathSync(out);
  } catch {}
  const candidates = [
    '/opt/homebrew/bin/code',
    '/usr/local/bin/code',
    '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code',
    path.join(os.homedir(), '.local/bin/code'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return fs.realpathSync(c);
  }
  return null;
}

function register(app) {
  app.post('/api/open/vscode', (req, res) => {
    const rawPath = typeof req.body?.path === 'string' ? req.body.path : '';
    const target = isAllowedProjectCwd(rawPath);
    if (!target) return res.status(400).json({ error: 'path inválido' });
    try {
      const st = fs.statSync(target);
      if (!st.isDirectory()) return res.status(400).json({ error: 'path não é um diretório' });
    } catch {
      return res.status(404).json({ error: 'path não encontrado' });
    }
    const bin = resolveVSCodeBin();
    if (!bin) {
      return res.status(500).json({
        error:
          'binário `code` do VS Code não encontrado — instale via "Shell Command: Install \'code\' command in PATH"',
      });
    }
    try {
      const child = spawn(bin, [target], { detached: true, stdio: 'ignore' });
      child.on('error', () => {});
      child.unref();
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
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
      const entries = fs
        .readdirSync(abs, { withFileTypes: true })
        .filter((e) => e.isDirectory() && (showHidden || !e.name.startsWith('.')))
        .map((e) => ({ name: e.name }))
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
}

module.exports = { register };
