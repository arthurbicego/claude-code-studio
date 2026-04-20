import fs from 'node:fs';
import path from 'node:path';
import type { Project } from '../shared/types';
import { CLAUDE_PROJECTS } from './paths';

export const SYSTEM_TAG_RE =
  /^\s*<(command-[\w-]+|local-command-[\w-]+|system-reminder|user-prompt-submit-hook|bash-stdout|bash-stderr)\b/;

export function isSystemText(s: string | null | undefined): boolean {
  return !s || SYSTEM_TAG_RE.test(s);
}

export type SessionMetaResult = { cwd: string | null; preview: string | null };

export function readSessionMeta(filePath: string): SessionMetaResult {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(64 * 1024);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    const head = buf.slice(0, n).toString('utf8');

    let cwd: string | null = null;
    let preview: string | null = null;

    for (const line of head.split('\n')) {
      if (!line) continue;
      let obj: Record<string, unknown>;
      try {
        obj = JSON.parse(line);
      } catch {
        continue;
      }

      if (!cwd && typeof obj.cwd === 'string') cwd = obj.cwd;

      if (!preview && obj.type === 'user' && !obj.isSidechain) {
        const msg = obj.message as { content?: unknown } | undefined;
        const content = msg?.content;
        let text: string | null = null;
        if (typeof content === 'string') {
          text = content;
        } else if (Array.isArray(content)) {
          const textPart = content.find(
            (p: unknown): p is { type: string; text: string } =>
              !!p &&
              typeof p === 'object' &&
              (p as { type?: unknown }).type === 'text' &&
              typeof (p as { text?: unknown }).text === 'string',
          );
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

export function findSessionFile(id: string): string | null {
  if (!fs.existsSync(CLAUDE_PROJECTS)) return null;
  const safeId = String(id).replace(/[^A-Za-z0-9._-]/g, '');
  if (!safeId || safeId !== String(id)) return null;
  for (const slug of fs.readdirSync(CLAUDE_PROJECTS)) {
    const fpath = path.join(CLAUDE_PROJECTS, slug, `${safeId}.jsonl`);
    if (fs.existsSync(fpath)) return fpath;
  }
  return null;
}

export function scanJsonlLines(
  filePath: string,
  onLine: (obj: Record<string, unknown>) => void,
): void {
  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split('\n')) {
    if (!line) continue;
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    onLine(obj);
  }
}

export type ToolUseResult = { input: Record<string, unknown>; timestamp: string | null };

export function findLastToolUse(sessionFile: string, toolName: string): ToolUseResult | null {
  let last: ToolUseResult | null = null;
  try {
    scanJsonlLines(sessionFile, (obj) => {
      const msg = obj.message as { content?: unknown } | undefined;
      const content = msg?.content;
      if (!Array.isArray(content)) return;
      for (const part of content) {
        if (
          part &&
          typeof part === 'object' &&
          (part as { type?: unknown }).type === 'tool_use' &&
          (part as { name?: unknown }).name === toolName
        ) {
          const p = part as { input: Record<string, unknown> };
          last = {
            input: p.input,
            timestamp: typeof obj.timestamp === 'string' ? obj.timestamp : null,
          };
        }
      }
    });
  } catch {
    // Session file missing or unreadable — caller treats null as "no tool use".
  }
  return last;
}

export function resolveSessionCwd(id: string): string | null {
  const fpath = findSessionFile(id);
  if (!fpath) return null;
  const meta = readSessionMeta(fpath);
  return meta.cwd;
}

/**
 * Scans a Claude projects root directory and returns only projects that have at least one
 * `.jsonl` session file with a resolvable `cwd`. Projects whose slug exists on disk but carry
 * no sessions (or only legacy UUID subdirectories) are skipped — their cwd can't be inferred
 * reliably from the slug alone, and listing them produces misleading entries in the UI.
 */
export function listProjectsWithSessions(
  projectsRoot: string,
  archived: ReadonlySet<string>,
): Project[] {
  if (!fs.existsSync(projectsRoot)) return [];
  const projects: Project[] = [];
  for (const slug of fs.readdirSync(projectsRoot)) {
    const dir = path.join(projectsRoot, slug);
    let st: fs.Stats;
    try {
      st = fs.statSync(dir);
    } catch {
      continue;
    }
    if (!st.isDirectory()) continue;

    let entries: string[];
    try {
      entries = fs.readdirSync(dir);
    } catch {
      continue;
    }
    const sessionFiles = entries.filter((f) => f.endsWith('.jsonl'));
    if (sessionFiles.length === 0) continue;

    let projectCwd: string | null = null;
    const sessions = sessionFiles
      .map((f) => {
        const id = f.replace(/\.jsonl$/, '');
        const fpath = path.join(dir, f);
        const fst = fs.statSync(fpath);
        const { cwd, preview } = readSessionMeta(fpath);
        if (cwd && !projectCwd) projectCwd = cwd;
        return {
          id,
          mtime: fst.mtimeMs,
          createdAt: fst.birthtimeMs || fst.ctimeMs,
          size: fst.size,
          preview: preview || null,
          archived: archived.has(id),
        };
      })
      .sort((a, b) => b.mtime - a.mtime);

    if (!projectCwd) continue;

    projects.push({
      slug,
      cwd: projectCwd,
      cwdResolved: true,
      sessions,
    });
  }
  return projects.sort((a, b) => (b.sessions[0]?.mtime || 0) - (a.sessions[0]?.mtime || 0));
}
