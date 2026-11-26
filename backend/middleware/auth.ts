import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { store } from '../repositories/store';
import type { UserRecord, UserRole } from '../types';

export interface AuthJwtPayload {
  sub: string;
  role: UserRole;
  email: string;
  tv: number;
}

export interface AuthenticatedRequest extends Request {
  user?: UserRecord;
}

export const ACCESS_COOKIE = 'ev_access_token';
export const REFRESH_COOKIE = 'ev_refresh_token';

export function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export function signAccessToken(user: UserRecord): string {
  const payload: AuthJwtPayload = {
    sub: user.id,
    role: user.role,
    email: user.email,
    tv: user.tokenVersion,
  };
  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.jwtAccessExpiresIn as jwt.SignOptions['expiresIn'],
  });
}

export function signRefreshToken(user: UserRecord): { raw: string; expiresAt: string } {
  const raw = jwt.sign(
    { sub: user.id, tv: user.tokenVersion, jti: crypto.randomUUID() },
    env.jwtRefreshSecret,
    { expiresIn: env.jwtRefreshExpiresIn as jwt.SignOptions['expiresIn'] }
  );
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  store.saveRefreshToken({
    id: `rt-${crypto.randomUUID().slice(0, 10)}`,
    tokenHash: hashToken(raw),
    userId: user.id,
    expiresAt,
    revoked: false,
    createdAt: new Date().toISOString(),
  });
  return { raw, expiresAt };
}

export function verifyAccessToken(token: string): AuthJwtPayload | null {
  try {
    return jwt.verify(token, env.jwtSecret) as AuthJwtPayload;
  } catch {
    return null;
  }
}

export function setAuthCookies(req: Request, res: Response, accessToken: string, refreshToken: string): void {
  const isSecureContext =
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https' ||
    env.isProduction;

  const sameSite: 'none' | 'lax' = isSecureContext ? 'none' : 'lax';

  const buildCookie = (name: string, val: string, maxAgeSec: number, cookiePath: string) => {
    const parts = [
      `${name}=${encodeURIComponent(val)}`,
      `Path=${cookiePath}`,
      `Max-Age=${maxAgeSec}`,
      'HttpOnly',
      `SameSite=${sameSite === 'none' ? 'None' : 'Lax'}`,
    ];
    if (isSecureContext) {
      parts.push('Secure');
      parts.push('Partitioned');
    }
    return parts.join('; ');
  };

  res.setHeader('Set-Cookie', [
    buildCookie(ACCESS_COOKIE, accessToken, 15 * 60, '/'),
    buildCookie(REFRESH_COOKIE, refreshToken, 7 * 24 * 60 * 60, '/api/auth'),
  ]);
}

export function clearAuthCookies(req: Request, res: Response): void {
  const isSecureContext =
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https' ||
    env.isProduction;
  const sameSite = isSecureContext ? 'None' : 'Lax';
  const extra = isSecureContext ? '; Secure; Partitioned' : '';
  res.setHeader('Set-Cookie', [
    `${ACCESS_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=${sameSite}${extra}`,
    `${REFRESH_COOKIE}=; Path=/api/auth; Max-Age=0; HttpOnly; SameSite=${sameSite}${extra}`,
  ]);
}

export function sanitizeUser(user: UserRecord) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    accountStatus: user.accountStatus,
    emailVerified: user.emailVerified,
    department: user.department || '',
    group: user.group || '',
    rollNumber: user.rollNumber || '',
    bio: user.bio || '',
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export function extractTokenFromRequest(req: Request): string | null {
  const cookieToken = req.cookies?.[ACCESS_COOKIE];
  if (typeof cookieToken === 'string' && cookieToken.length > 0) {
    return cookieToken;
  }
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  return null;
}

/**
 * Verifies CSRF protection on cookie-authenticated state-changing requests.
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  const method = req.method.toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    next();
    return;
  }

  // Require custom X-Requested-With header or matching Origin/Host on state-changing requests
  const xrw = req.headers['x-requested-with'];
  if (xrw === 'XMLHttpRequest' || xrw === 'ExamVaultSPA') {
    next();
    return;
  }

  const origin = req.headers.origin;
  const host = (req.headers['x-forwarded-host'] || req.headers.host || '') as string;
  if (origin && host) {
    try {
      const originHost = new URL(origin).host;
      if (originHost === host) {
        next();
        return;
      }
    } catch {
      // fall through
    }
  }

  // Allow Bearer-only API clients that don't rely on cookies
  if (!req.cookies?.[ACCESS_COOKIE] && !req.cookies?.[REFRESH_COOKIE] && req.headers.authorization?.startsWith('Bearer ')) {
    next();
    return;
  }

  res.status(403).json({ error: 'CSRF validation failed. Include X-Requested-With header.' });
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const token = extractTokenFromRequest(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }

  const payload = verifyAccessToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Session expired or invalid token.' });
    return;
  }

  const user = store.findUserById(payload.sub);
  if (!user) {
    res.status(401).json({ error: 'User account not found.' });
    return;
  }
  if (user.accountStatus !== 'active') {
    res.status(403).json({ error: 'Your account has been deactivated. Contact an administrator.' });
    return;
  }
  if (user.tokenVersion !== payload.tv) {
    res.status(401).json({ error: 'Session invalidated. Please sign in again.' });
    return;
  }

  req.user = user;
  next();
}

export function requireRole(...roles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions for this resource.' });
      return;
    }
    next();
  };
}
