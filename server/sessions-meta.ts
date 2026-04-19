import fs from 'node:fs';
import path from 'node:path';
import { CLAUDE_PROJECTS } from './paths';

export const SYSTEM_TAG_RE =
  /^\s*<(command-[\w-]+|local-command-[\w-]+|system-reminder|user-prompt-submit-hook|bash-stdout|bash-stderr)\b/;

export function isSystemText(s: string | null | undefined): boolean {
  return !s || SYSTEM_TAG_RE.test(s);
}

export function fallbackSlugToCwd(slug: string): string {
  return `/${slug.replace(/^-/, '').replace(/-/g, '/')}`;
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
  if (meta.cwd) return meta.cwd;
  const slug = path.basename(path.dirname(fpath));
  return fallbackSlugToCwd(slug);
}
