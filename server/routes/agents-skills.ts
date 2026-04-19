import fs from 'node:fs';
import path from 'node:path';
import type {
  AgentDetail,
  AgentScope,
  AgentSummary,
  SkillDetail,
  SkillExtra,
  SkillScope,
  SkillSummary,
} from '@shared/types';
import type { Express, Request, Response } from 'express';
import { buildFrontmatter, parseFrontmatter } from '../frontmatter';
import { ERR, sendError, sendInternalError } from '../errors';
import { isAllowedProjectCwd, USER_AGENTS_DIR, USER_SKILLS_DIR } from '../paths';
import { isValidName } from '../validators';

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

type Kind = 'agent' | 'skill';
type Scope = AgentScope | SkillScope;

function resolveScopeDir(scope: unknown, kind: Kind, rawCwd: unknown): string | null {
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

function listAgentsIn(dir: string): AgentSummary[] {
  if (!fs.existsSync(dir)) return [];
  const entries: AgentSummary[] = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.md')) continue;
    const fpath = path.join(dir, f);
    let stat: fs.Stats;
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
    } catch {
      // Unreadable or malformed frontmatter — list the agent without description.
    }
    entries.push({ name, description, path: fpath, mtime: stat.mtimeMs });
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

function listSkillsIn(dir: string): SkillSummary[] {
  if (!fs.existsSync(dir)) return [];
  const entries: SkillSummary[] = [];
  for (const f of fs.readdirSync(dir)) {
    const fpath = path.join(dir, f);
    let stat: fs.Stats;
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
    } catch {
      // Unreadable or malformed frontmatter — list the skill without description.
    }
    entries.push({ name: f, description, path: skillFile, dir: fpath, mtime: stat.mtimeMs });
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

function listSkillExtras(dir: string): SkillExtra[] {
  if (!fs.existsSync(dir)) return [];
  const out: SkillExtra[] = [];
  const walk = (cur: string, rel: string) => {
    for (const f of fs.readdirSync(cur)) {
      if (rel === '' && f === 'SKILL.md') continue;
      const fpath = path.join(cur, f);
      const relPath = rel ? `${rel}/${f}` : f;
      let stat: fs.Stats;
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

function agentResponse(name: string, dir: string): AgentDetail | null {
  const filePath = path.join(dir, `${name}.md`);
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, 'utf8');
  const { frontmatter, body } = parseFrontmatter(content);
  const toolsField = frontmatter.tools;
  return {
    name,
    path: filePath,
    description: typeof frontmatter.description === 'string' ? frontmatter.description : '',
    model: typeof frontmatter.model === 'string' ? frontmatter.model : '',
    tools: Array.isArray(toolsField)
      ? toolsField
      : typeof toolsField === 'string' && toolsField.trim()
        ? toolsField
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
    body,
    raw: content,
  };
}

function skillResponse(name: string, dir: string): SkillDetail | null {
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

function rmDirRecursive(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

export function register(app: Express): void {
  app.get('/api/agents', (req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store');
    const out = { user: listAgentsIn(USER_AGENTS_DIR), project: [] as AgentSummary[] };
    if (req.query.cwd) {
      const dir = resolveScopeDir('project' satisfies Scope, 'agent', req.query.cwd);
      if (dir) out.project = listAgentsIn(dir);
    }
    res.json(out);
  });

  app.get('/api/agents/file', (req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store');
    const { scope, name } = req.query;
    const dir = resolveScopeDir(scope, 'agent', req.query.cwd);
    if (!dir) return sendError(res, 400, ERR.SCOPE_INVALID, 'invalid scope');
    if (!isValidName(name)) return sendError(res, 400, ERR.NAME_INVALID, 'invalid name');
    const data = agentResponse(name, dir);
    if (!data) return sendError(res, 404, ERR.AGENT_NOT_FOUND, 'agent not found');
    res.json(data);
  });

  app.put('/api/agents/file', (req: Request, res: Response) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const dir = resolveScopeDir(body.scope, 'agent', body.cwd);
    if (!dir) return sendError(res, 400, ERR.SCOPE_INVALID, 'invalid scope');
    const name = body.name;
    if (!isValidName(name))
      return sendError(res, 400, ERR.NAME_INVALID, 'invalid name (use a-z 0-9 -)');
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    if (!description)
      return sendError(res, 400, ERR.DESCRIPTION_REQUIRED, 'description is required');
    const model = typeof body.model === 'string' ? body.model.trim() : '';
    const tools = Array.isArray(body.tools)
      ? (body.tools as unknown[]).filter(
          (t): t is string => typeof t === 'string' && t.trim() !== '',
        )
      : [];
    const promptBody = typeof body.body === 'string' ? body.body : '';
    const previousName =
      typeof body.previousName === 'string' && isValidName(body.previousName)
        ? body.previousName
        : null;

    const fm: Record<string, string | string[]> = { name, description };
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
          return sendError(
            res,
            409,
            ERR.AGENT_ALREADY_EXISTS,
            `an agent named "${name}" already exists`,
            { name },
          );
        }
        if (fs.existsSync(oldFile)) fs.renameSync(oldFile, targetFile);
      } else if (!previousName && fs.existsSync(targetFile)) {
        return sendError(
          res,
          409,
          ERR.AGENT_ALREADY_EXISTS,
          `an agent named "${name}" already exists`,
          { name },
        );
      }
      fs.writeFileSync(targetFile, fullContent, 'utf8');
      res.json(agentResponse(name, dir));
    } catch (err) {
      sendInternalError(res, err);
    }
  });

  app.delete('/api/agents/file', (req: Request, res: Response) => {
    const { scope, name } = req.query;
    const dir = resolveScopeDir(scope, 'agent', req.query.cwd);
    if (!dir) return sendError(res, 400, ERR.SCOPE_INVALID, 'invalid scope');
    if (!isValidName(name)) return sendError(res, 400, ERR.NAME_INVALID, 'invalid name');
    const filePath = path.join(dir, `${name}.md`);
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      res.json({ ok: true });
    } catch (err) {
      sendInternalError(res, err);
    }
  });

  app.get('/api/skills', (req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store');
    const out = { user: listSkillsIn(USER_SKILLS_DIR), project: [] as SkillSummary[] };
    if (req.query.cwd) {
      const dir = resolveScopeDir('project' satisfies Scope, 'skill', req.query.cwd);
      if (dir) out.project = listSkillsIn(dir);
    }
    res.json(out);
  });

  app.get('/api/skills/file', (req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store');
    const { scope, name } = req.query;
    const dir = resolveScopeDir(scope, 'skill', req.query.cwd);
    if (!dir) return sendError(res, 400, ERR.SCOPE_INVALID, 'invalid scope');
    if (!isValidName(name)) return sendError(res, 400, ERR.NAME_INVALID, 'invalid name');
    const data = skillResponse(name, dir);
    if (!data) return sendError(res, 404, ERR.SKILL_NOT_FOUND, 'skill not found');
    res.json(data);
  });

  app.put('/api/skills/file', (req: Request, res: Response) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const dir = resolveScopeDir(body.scope, 'skill', body.cwd);
    if (!dir) return sendError(res, 400, ERR.SCOPE_INVALID, 'invalid scope');
    const name = body.name;
    if (!isValidName(name))
      return sendError(res, 400, ERR.NAME_INVALID, 'invalid name (use a-z 0-9 -)');
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    if (!description)
      return sendError(res, 400, ERR.DESCRIPTION_REQUIRED, 'description is required');
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
          return sendError(
            res,
            409,
            ERR.SKILL_ALREADY_EXISTS,
            `a skill named "${name}" already exists`,
            { name },
          );
        }
        if (fs.existsSync(oldDir)) fs.renameSync(oldDir, targetDir);
      } else if (!previousName && fs.existsSync(targetDir)) {
        return sendError(
          res,
          409,
          ERR.SKILL_ALREADY_EXISTS,
          `a skill named "${name}" already exists`,
          { name },
        );
      }
      fs.mkdirSync(targetDir, { recursive: true });
      fs.writeFileSync(path.join(targetDir, 'SKILL.md'), fullContent, 'utf8');
      res.json(skillResponse(name, dir));
    } catch (err) {
      sendInternalError(res, err);
    }
  });

  app.delete('/api/skills/file', (req: Request, res: Response) => {
    const { scope, name } = req.query;
    const dir = resolveScopeDir(scope, 'skill', req.query.cwd);
    if (!dir) return sendError(res, 400, ERR.SCOPE_INVALID, 'invalid scope');
    if (!isValidName(name)) return sendError(res, 400, ERR.NAME_INVALID, 'invalid name');
    const skillDir = path.join(dir, name);
    try {
      if (fs.existsSync(skillDir)) rmDirRecursive(skillDir);
      res.json({ ok: true });
    } catch (err) {
      sendInternalError(res, err);
    }
  });

  app.get('/api/known-tools', (_req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store');
    res.json({ tools: KNOWN_TOOLS });
  });
}
