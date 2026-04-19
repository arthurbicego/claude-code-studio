const fs = require('node:fs');
const path = require('node:path');
const { GLOBAL_CLAUDE_MD, HOME_DIR_REAL, isAllowedProjectCwd } = require('../paths');
const { expandImports } = require('../memory-expand');

const PROJECT_MEMORY_VARIANTS = { shared: 'CLAUDE.md', local: 'CLAUDE.local.md' };

function projectMemoryFileName(variant) {
  return PROJECT_MEMORY_VARIANTS[variant] || PROJECT_MEMORY_VARIANTS.shared;
}

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
  try {
    fs.unlinkSync(filePath);
  } catch (err) {
    if (!err || err.code !== 'ENOENT') throw err;
  }
  return { exists: false, content: '', mtime: null };
}

function statMemoryMeta(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return { exists: false, mtime: null, size: 0 };
    return { exists: true, mtime: stat.mtimeMs, size: stat.size };
  } catch {
    return { exists: false, mtime: null, size: 0 };
  }
}

function register(app) {
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
    if (
      !dirs.includes(HOME_DIR_REAL) &&
      (HOME_DIR_REAL === cwd || cwd.startsWith(HOME_DIR_REAL + path.sep))
    ) {
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

  app.post('/api/memory/expand', (req, res) => {
    const content = typeof req.body?.content === 'string' ? req.body.content : null;
    if (content == null) return res.status(400).json({ error: 'content obrigatório (string)' });
    const rawBase = typeof req.body?.basePath === 'string' ? req.body.basePath : '';
    const basePath = path.resolve(rawBase || HOME_DIR_REAL);
    const withinHome =
      (basePath + path.sep).startsWith(HOME_DIR_REAL + path.sep) || basePath === HOME_DIR_REAL;
    if (!withinHome) return res.status(400).json({ error: 'basePath fora do home' });
    try {
      const result = expandImports(content, basePath);
      res.json({ basePath, ...result });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

module.exports = { register };
