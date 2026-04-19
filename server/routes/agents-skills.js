const fs = require('node:fs');
const path = require('node:path');
const { USER_AGENTS_DIR, USER_SKILLS_DIR, isAllowedProjectCwd } = require('../paths');
const { isValidName } = require('../validators');
const { parseFrontmatter, buildFrontmatter } = require('../frontmatter');

const KNOWN_TOOLS = [
  'Bash',
  'Edit',
  'Glob',
  'Grep',
  'Read',
  'Write',
  'NotebookEdit',
  'WebFetch',
  'WebSearch',
  'TodoWrite',
  'Task',
  'TaskCreate',
  'TaskUpdate',
  'Agent',
  'SlashCommand',
  'BashOutput',
  'KillBash',
  'ExitPlanMode',
];

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
    try {
      stat = fs.statSync(fpath);
    } catch {
      continue;
    }
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
    try {
      stat = fs.statSync(fpath);
    } catch {
      continue;
    }
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
      try {
        stat = fs.statSync(fpath);
      } catch {
        continue;
      }
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
      : typeof frontmatter.tools === 'string' && frontmatter.tools.trim()
        ? frontmatter.tools
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
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

function register(app) {
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
    const tools = Array.isArray(body.tools)
      ? body.tools.filter((t) => typeof t === 'string' && t.trim())
      : [];
    const promptBody = typeof body.body === 'string' ? body.body : '';
    const previousName =
      typeof body.previousName === 'string' && isValidName(body.previousName)
        ? body.previousName
        : null;

    const fm = { name, description };
    if (model) fm.model = model;
    if (tools.length > 0) fm.tools = tools;
    const fullContent =
      buildFrontmatter(fm) +
      (promptBody.endsWith('\n') || promptBody === '' ? promptBody : `${promptBody}\n`);

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
    const previousName =
      typeof body.previousName === 'string' && isValidName(body.previousName)
        ? body.previousName
        : null;

    const fullContent =
      buildFrontmatter({ name, description }) +
      (promptBody.endsWith('\n') || promptBody === '' ? promptBody : `${promptBody}\n`);

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
}

module.exports = { register };
