import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  ATTACHMENT_ALLOWED_MIME,
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MAX_PER_SESSION,
  type Attachment,
  type AttachmentKind,
} from '@shared/types';
import type { Express, Request, Response } from 'express';
import multer from 'multer';
import { ERR, sendError, sendInternalError } from '../errors';
import { liveSessions } from '../live-sessions';
import { ATTACHMENTS_DIR } from '../paths';
import { UUID_RE } from '../validators';

const SAFE_NAME_RE = /[^A-Za-z0-9._-]+/g;
const MAX_NAME_LEN = 128;

function ensureSessionDir(sessionKey: string): string {
  const dir = path.join(ATTACHMENTS_DIR, sessionKey);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

function sanitizeFilename(raw: string): string {
  const base = path.basename(raw || '').replace(/\0/g, '');
  const cleaned = base.replace(SAFE_NAME_RE, '_').replace(/^\.+/, '').slice(0, MAX_NAME_LEN);
  return cleaned || 'attachment';
}

function kindFor(mime: string): AttachmentKind {
  if (mime.startsWith('image/')) return 'image';
  if (mime === 'application/pdf') return 'pdf';
  return 'text';
}

function isSessionKeyValid(sessionKey: string): boolean {
  if (!sessionKey) return false;
  if (!UUID_RE.test(sessionKey)) return false;
  return liveSessions.has(sessionKey);
}

function resolveWithin(base: string, candidate: string): string | null {
  const resolved = path.resolve(base, candidate);
  if (resolved !== base && !resolved.startsWith(base + path.sep)) return null;
  return resolved;
}

export function register(app: Express): void {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: ATTACHMENT_MAX_BYTES, files: 1 },
    fileFilter: (_req, file, cb) => {
      if (!ATTACHMENT_ALLOWED_MIME.includes(file.mimetype)) {
        cb(null, false);
        return;
      }
      cb(null, true);
    },
  });

  app.post(
    '/api/sessions/:sessionKey/attachments',
    (req: Request, res: Response, next) => {
      const sessionKey = String(req.params.sessionKey || '').trim();
      if (!isSessionKeyValid(sessionKey)) {
        return sendError(res, 404, ERR.SESSION_NOT_LIVE, 'session is not live');
      }
      upload.single('file')(req, res, (err) => {
        if (err) {
          if ((err as { code?: string }).code === 'LIMIT_FILE_SIZE') {
            return sendError(res, 413, ERR.ATTACHMENT_TOO_LARGE, 'file too large', {
              max: ATTACHMENT_MAX_BYTES,
            });
          }
          return sendInternalError(res, err);
        }
        next();
      });
    },
    (req: Request, res: Response) => {
      const sessionKey = String(req.params.sessionKey || '').trim();
      const file = req.file;
      if (!file) {
        return sendError(res, 415, ERR.ATTACHMENT_TYPE_UNSUPPORTED, 'unsupported file type');
      }

      const dir = ensureSessionDir(sessionKey);
      const existing = fs.readdirSync(dir).length;
      if (existing >= ATTACHMENT_MAX_PER_SESSION) {
        return sendError(res, 429, ERR.ATTACHMENT_LIMIT_REACHED, 'attachment limit reached', {
          max: ATTACHMENT_MAX_PER_SESSION,
        });
      }

      const id = crypto.randomBytes(8).toString('hex');
      const name = sanitizeFilename(file.originalname);
      const filename = `${id}-${name}`;
      const target = resolveWithin(dir, filename);
      if (!target) {
        return sendError(res, 400, ERR.PATH_INVALID, 'invalid filename');
      }

      try {
        fs.writeFileSync(target, file.buffer, { mode: 0o600 });
      } catch (writeErr) {
        return sendInternalError(res, writeErr);
      }

      const attachment: Attachment = {
        id,
        path: target,
        name,
        size: file.size,
        mime: file.mimetype,
        kind: kindFor(file.mimetype),
      };
      res.json(attachment);
    },
  );

  app.delete('/api/sessions/:sessionKey/attachments/:id', (req: Request, res: Response) => {
    const sessionKey = String(req.params.sessionKey || '').trim();
    const id = String(req.params.id || '').trim();
    if (!UUID_RE.test(sessionKey)) {
      return sendError(res, 400, ERR.SESSION_ID_INVALID, 'invalid session id');
    }
    if (!/^[a-f0-9]{16}$/.test(id)) {
      return sendError(res, 400, ERR.INVALID_REQUEST, 'invalid attachment id');
    }
    const dir = path.join(ATTACHMENTS_DIR, sessionKey);
    let entries: string[] = [];
    try {
      entries = fs.readdirSync(dir);
    } catch {
      return res.status(204).end();
    }
    const match = entries.find((entry) => entry.startsWith(`${id}-`));
    if (!match) return res.status(204).end();
    const target = resolveWithin(dir, match);
    if (!target) return sendError(res, 400, ERR.PATH_INVALID, 'invalid attachment path');
    try {
      fs.unlinkSync(target);
    } catch {
      // Already gone — treat as success.
    }
    res.status(204).end();
  });
}

export function cleanupAttachmentsForSession(sessionKey: string): void {
  const dir = path.join(ATTACHMENTS_DIR, sessionKey);
  fs.rm(dir, { recursive: true, force: true }, () => {});
}

export function cleanupOrphanAttachments(activeKeys: Set<string>): void {
  let entries: string[];
  try {
    entries = fs.readdirSync(ATTACHMENTS_DIR);
  } catch {
    return;
  }
  const maxAgeMs = 24 * 60 * 60 * 1000;
  const now = Date.now();
  for (const name of entries) {
    if (activeKeys.has(name)) continue;
    const full = path.join(ATTACHMENTS_DIR, name);
    try {
      const st = fs.statSync(full);
      if (!st.isDirectory()) continue;
      if (now - st.mtimeMs < maxAgeMs) continue;
    } catch {
      continue;
    }
    fs.rm(full, { recursive: true, force: true }, () => {});
  }
}
