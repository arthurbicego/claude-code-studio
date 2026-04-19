const fs = require('node:fs');
const path = require('node:path');
const { CLAUDE_PROJECTS } = require('./paths');

const SYSTEM_TAG_RE =
  /^\s*<(command-[\w-]+|local-command-[\w-]+|system-reminder|user-prompt-submit-hook|bash-stdout|bash-stderr)\b/;

function isSystemText(s) {
  return !s || SYSTEM_TAG_RE.test(s);
}

function fallbackSlugToCwd(slug) {
  return `/${slug.replace(/^-/, '').replace(/-/g, '/')}`;
}

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
      try {
        obj = JSON.parse(line);
      } catch {
        continue;
      }

      if (!cwd && typeof obj.cwd === 'string') cwd = obj.cwd;

      if (!preview && obj.type === 'user' && !obj.isSidechain) {
        const content = obj.message?.content;
        let text = null;
        if (typeof content === 'string') {
          text = content;
        } else if (Array.isArray(content)) {
          const textPart = content.find(
            (p) => p && p.type === 'text' && typeof p.text === 'string',
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

function scanJsonlLines(filePath, onLine) {
  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split('\n')) {
    if (!line) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
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

function resolveSessionCwd(id) {
  const fpath = findSessionFile(id);
  if (!fpath) return null;
  const meta = readSessionMeta(fpath);
  if (meta.cwd) return meta.cwd;
  const slug = path.basename(path.dirname(fpath));
  return fallbackSlugToCwd(slug);
}

module.exports = {
  SYSTEM_TAG_RE,
  isSystemText,
  fallbackSlugToCwd,
  readSessionMeta,
  findSessionFile,
  scanJsonlLines,
  findLastToolUse,
  resolveSessionCwd,
};
