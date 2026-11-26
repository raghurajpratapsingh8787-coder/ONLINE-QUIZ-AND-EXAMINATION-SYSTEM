import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { ZodError } from 'zod';
import { store } from '../repositories/store';
import type { UserRecord, UserRole } from '../types';

const BLOCKED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Recursively strips MongoDB operator keys ($...), dotted keys, and prototype-pollution keys.
 */
export function sanitizeObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeObject);
  }
  if (value && typeof value === 'object') {
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k.startsWith('$') || k.includes('.') || BLOCKED_KEYS.has(k)) {
        continue;
      }
      clean[k] = sanitizeObject(v);
    }
    return clean;
  }
  return value;
}

export function noSqlSanitizer(req: Request, _res: Response, next: NextFunction): void {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }
  if (req.query && typeof req.query === 'object') {
    const sanitizedQuery = sanitizeObject(req.query) as Record<string, unknown>;
    for (const key of Object.keys(req.query)) {
      delete req.query[key];
    }
    Object.assign(req.query, sanitizedQuery);
  }
  next();
}

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Please try again later.' },
});

export const apiRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Rate limit exceeded. Please slow down.' },
});

// Controlled Multer file upload directory for question image attachments
export const UPLOAD_DIR = path.resolve(process.cwd(), '.data', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const ALLOWED_IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const MIME_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

/**
 * Verifies image file magic bytes to prevent spoofed Content-Type uploads.
 */
export function verifyImageMagicBytes(filePath: string): boolean {
  try {
    const fd = fs.openSync(filePath, 'r');
    const header = Buffer.alloc(12);
    const bytesRead = fs.readSync(fd, header, 0, 12, 0);
    fs.closeSync(fd);
    if (bytesRead < 4) return false;

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    const isPng =
      bytesRead >= 8 &&
      header[0] === 0x89 &&
      header[1] === 0x50 &&
      header[2] === 0x4e &&
      header[3] === 0x47 &&
      header[4] === 0x0d &&
      header[5] === 0x0a &&
      header[6] === 0x1a &&
      header[7] === 0x0a;
    // JPEG: FF D8 FF
    const isJpeg = header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
    // GIF: 47 49 46 38 (GIF8)
    const isGif = header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x38;
    // WEBP: RIFF....WEBP
    const isWebp =
      bytesRead >= 12 &&
      header.toString('ascii', 0, 4) === 'RIFF' &&
      header.toString('ascii', 8, 12) === 'WEBP';

    return isPng || isJpeg || isGif || isWebp;
  } catch {
    return false;
  }
}

export const questionImageUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const ext = MIME_EXT[file.mimetype] || '.bin';
      cb(null, `qimg-${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB max
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_IMAGE_MIMES.has(file.mimetype)) {
      cb(new Error('Only PNG, JPEG, WEBP, or GIF images up to 2MB are permitted.'));
      return;
    }
    cb(null, true);
  },
});

export function logAudit(params: {
  actor?: UserRecord | null;
  actorEmail?: string;
  actorRole?: UserRole | 'system';
  action: string;
  resourceType: string;
  resourceId: string;
  metadata?: Record<string, unknown>;
}): void {
  store.addAuditLog({
    id: `audit-${crypto.randomUUID().slice(0, 10)}`,
    actorId: params.actor?.id || 'system',
    actorEmail: params.actor?.email || params.actorEmail || 'system',
    actorRole: params.actor?.role || params.actorRole || 'system',
    action: params.action,
    resourceType: params.resourceType,
    resourceId: params.resourceId,
    timestamp: new Date().toISOString(),
    metadata: params.metadata,
  });
}

export function centralizedErrorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Validation failed',
      details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
    return;
  }

  if (err instanceof multer.MulterError) {
    res.status(400).json({ error: `File upload error: ${err.message}` });
    return;
  }

  const message = err instanceof Error ? err.message : 'Unexpected server error';
  const status = (err as { status?: number })?.status || 500;
  if (status >= 500) {
    console.error('[API Error]', err);
  }
  res.status(status).json({
    error: status >= 500 ? 'An internal server error occurred.' : message,
  });
}
