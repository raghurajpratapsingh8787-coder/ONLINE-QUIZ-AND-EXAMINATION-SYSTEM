import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Router, type Response } from 'express';
import { env } from '../config/env';
import {
  clearAuthCookies,
  extractTokenFromRequest,
  hashToken,
  REFRESH_COOKIE,
  requireAuth,
  sanitizeUser,
  setAuthCookies,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  type AuthenticatedRequest,
} from '../middleware/auth';
import { authRateLimiter, logAudit } from '../middleware/security';
import { store } from '../repositories/store';
import { sendEmailNotification } from '../services/email';
import { notifyUser } from '../services/realtime';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  updateProfileSchema,
} from '../validators/schemas';

const router = Router();

router.post('/register', authRateLimiter, async (req, res: Response, next) => {
  try {
    const settings = store.getSettings();
    if (settings && !settings.allowSelfRegistration) {
      res.status(403).json({ error: 'Self-registration is currently disabled by administrator.' });
      return;
    }

    const data = registerSchema.parse(req.body);
    const normalizedEmail = data.email.toLowerCase();

    if (store.findUserByEmail(normalizedEmail)) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    const passwordHash = await bcrypt.hash(data.password, 10);
    const now = new Date().toISOString();
    // Self-registration always assigns least-privilege student role; teachers/admins are provisioned by Admins
    const assignedRole = 'student' as const;

    const user = store.saveUser({
      id: `usr-${crypto.randomUUID().slice(0, 10)}`,
      name: data.name,
      email: normalizedEmail,
      passwordHash,
      role: assignedRole,
      accountStatus: 'active',
      emailVerified: true,
      department: data.department || 'Computer Science & Engineering',
      group: data.group || 'CS-2026',
      rollNumber: data.rollNumber || `STU-${Math.floor(1000 + Math.random() * 9000)}`,
      tokenVersion: 0,
      createdAt: now,
      updatedAt: now,
    });

    const accessToken = signAccessToken(user);
    const { raw: refreshToken } = signRefreshToken(user);
    setAuthCookies(req, res, accessToken, refreshToken);

    logAudit({
      actor: user,
      action: 'USER_REGISTERED',
      resourceType: 'User',
      resourceId: user.id,
      metadata: { role: user.role },
    });

    void notifyUser({
      userId: user.id,
      title: 'Welcome to ExamVault',
      message: `Your ${user.role} account is active. Explore your dashboard to get started.`,
      type: 'account_alert',
      link: '/dashboard',
    });

    res.status(201).json({ user: sanitizeUser(user), accessToken });
  } catch (err) {
    next(err);
  }
});

router.post('/login', authRateLimiter, async (req, res: Response, next) => {
  try {
    const data = loginSchema.parse(req.body);
    const user = store.findUserByEmail(data.email);

    if (!user) {
      // Constant-time dummy comparison to avoid timing-based email enumeration
      await bcrypt.compare(data.password, '$2b$10$CwTycUXWue0Thq9StjUM0uJ8l4F3vY0/8W5K7V8m8h2u4a1d5e6fG');
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    if (user.accountStatus !== 'active') {
      res.status(403).json({ error: 'Account is deactivated or suspended. Contact administrator.' });
      return;
    }

    const valid = await bcrypt.compare(data.password, user.passwordHash);
    if (!valid) {
      logAudit({
        actorEmail: data.email,
        actorRole: user.role,
        action: 'LOGIN_FAILED',
        resourceType: 'Auth',
        resourceId: user.id,
      });
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const accessToken = signAccessToken(user);
    const { raw: refreshToken } = signRefreshToken(user);
    setAuthCookies(req, res, accessToken, refreshToken);

    logAudit({
      actor: user,
      action: 'LOGIN_SUCCESS',
      resourceType: 'Auth',
      resourceId: user.id,
    });

    res.json({ user: sanitizeUser(user), accessToken });
  } catch (err) {
    next(err);
  }
});

router.post('/refresh', authRateLimiter, (req, res: Response) => {
  const rawToken = req.cookies?.[REFRESH_COOKIE];
  if (!rawToken || typeof rawToken !== 'string') {
    res.status(401).json({ error: 'Refresh token missing.' });
    return;
  }

  try {
    const decoded = jwt.verify(rawToken, env.jwtRefreshSecret) as { sub: string; tv: number };
    const stored = store.findRefreshToken(hashToken(rawToken));
    if (!stored || stored.revoked || new Date(stored.expiresAt).getTime() < Date.now()) {
      clearAuthCookies(req, res);
      res.status(401).json({ error: 'Refresh token revoked or expired.' });
      return;
    }

    const user = store.findUserById(decoded.sub);
    if (!user || user.accountStatus !== 'active' || user.tokenVersion !== decoded.tv) {
      clearAuthCookies(req, res);
      res.status(401).json({ error: 'Account unavailable or session invalidated.' });
      return;
    }

    // Rotate refresh token: revoke old one and issue fresh pair
    stored.revoked = true;
    store.saveRefreshToken(stored);

    const accessToken = signAccessToken(user);
    const { raw: newRefreshToken } = signRefreshToken(user);
    setAuthCookies(req, res, accessToken, newRefreshToken);

    res.json({ user: sanitizeUser(user), accessToken });
  } catch {
    clearAuthCookies(req, res);
    res.status(401).json({ error: 'Invalid refresh token.' });
  }
});

router.post('/logout', (req: AuthenticatedRequest, res: Response) => {
  const rawRefresh = req.cookies?.[REFRESH_COOKIE];
  if (typeof rawRefresh === 'string' && rawRefresh.length > 0) {
    const stored = store.findRefreshToken(hashToken(rawRefresh));
    if (stored) {
      stored.revoked = true;
      store.saveRefreshToken(stored);
    }
  }
  const accessToken = extractTokenFromRequest(req);
  if (accessToken) {
    const payload = verifyAccessToken(accessToken);
    if (payload) {
      const user = store.findUserById(payload.sub);
      if (user) {
        store.saveUser({
          ...user,
          tokenVersion: user.tokenVersion + 1,
          updatedAt: new Date().toISOString(),
        });
        store.revokeUserRefreshTokens(user.id);
      }
    }
  }
  clearAuthCookies(req, res);
  res.json({ message: 'Signed out cleanly.' });
});

router.get('/session', (req: AuthenticatedRequest, res: Response) => {
  const token = extractTokenFromRequest(req);
  if (!token) {
    res.json({ authenticated: false, user: null, serverTime: new Date().toISOString() });
    return;
  }
  const payload = verifyAccessToken(token);
  if (!payload) {
    res.json({ authenticated: false, user: null, serverTime: new Date().toISOString() });
    return;
  }
  const user = store.findUserById(payload.sub);
  if (!user || user.accountStatus !== 'active' || user.tokenVersion !== payload.tv) {
    res.json({ authenticated: false, user: null, serverTime: new Date().toISOString() });
    return;
  }
  res.json({ authenticated: true, user: sanitizeUser(user), serverTime: new Date().toISOString() });
});

router.get('/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  res.json({ user: sanitizeUser(req.user!), serverTime: new Date().toISOString() });
});

router.patch('/profile', requireAuth, (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const data = updateProfileSchema.parse(req.body);
    const user = req.user!;
    const updated = store.saveUser({
      ...user,
      name: data.name,
      department: data.department ?? user.department,
      group: user.role === 'student' ? data.group ?? user.group : user.group,
      rollNumber: user.role === 'student' ? data.rollNumber ?? user.rollNumber : user.rollNumber,
      bio: data.bio ?? user.bio,
      updatedAt: new Date().toISOString(),
    });
    res.json({ user: sanitizeUser(updated) });
  } catch (err) {
    next(err);
  }
});

router.post('/change-password', requireAuth, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const data = changePasswordSchema.parse(req.body);
    const user = req.user!;
    const valid = await bcrypt.compare(data.currentPassword, user.passwordHash);
    if (!valid) {
      res.status(400).json({ error: 'Current password is incorrect.' });
      return;
    }

    const passwordHash = await bcrypt.hash(data.newPassword, 10);
    const updated = store.saveUser({
      ...user,
      passwordHash,
      tokenVersion: user.tokenVersion + 1,
      updatedAt: new Date().toISOString(),
    });

    // Revoke all previous refresh tokens and issue fresh session
    store.revokeUserRefreshTokens(user.id);
    const accessToken = signAccessToken(updated);
    const { raw: refreshToken } = signRefreshToken(updated);
    setAuthCookies(req, res, accessToken, refreshToken);

    logAudit({
      actor: updated,
      action: 'PASSWORD_CHANGED',
      resourceType: 'User',
      resourceId: updated.id,
    });

    res.json({ message: 'Password updated successfully.', accessToken });
  } catch (err) {
    next(err);
  }
});

router.post('/forgot-password', authRateLimiter, async (req, res: Response, next) => {
  try {
    const { email } = forgotPasswordSchema.parse(req.body);
    const user = store.findUserByEmail(email);

    if (user && user.accountStatus === 'active') {
      const rawResetToken = crypto.randomBytes(24).toString('hex');
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      store.saveUser({
        ...user,
        passwordResetTokenHash: hashToken(rawResetToken),
        passwordResetExpiresAt: expiresAt,
        updatedAt: new Date().toISOString(),
      });

      const emailRes = await sendEmailNotification({
        to: user.email,
        subject: 'ExamVault Password Reset Token',
        text: `Use this single-use reset token within 30 minutes: ${rawResetToken}`,
      });

      if (!emailRes.delivered) {
        console.warn(`[Auth] Password reset requested for ${user.id}, but SMTP delivery is not configured.`);
      }

      logAudit({
        actor: user,
        action: 'PASSWORD_RESET_REQUESTED',
        resourceType: 'Auth',
        resourceId: user.id,
      });
    }

    // Never return reset tokens in the HTTP response; generic message prevents account enumeration
    res.json({
      message:
        'If an active account matches that email and email delivery is configured, a single-use reset token has been sent (valid for 30 minutes).',
    });
  } catch (err) {
    next(err);
  }
});

router.post('/reset-password', authRateLimiter, async (req, res: Response, next) => {
  try {
    const { token, newPassword } = resetPasswordSchema.parse(req.body);
    const tokenHashBuf = Buffer.from(hashToken(token), 'hex');
    const user = store.getUsers().find((u) => {
      if (!u.passwordResetTokenHash || !u.passwordResetExpiresAt) return false;
      if (new Date(u.passwordResetExpiresAt).getTime() <= Date.now()) return false;
      const storedBuf = Buffer.from(u.passwordResetTokenHash, 'hex');
      return storedBuf.length === tokenHashBuf.length && crypto.timingSafeEqual(storedBuf, tokenHashBuf);
    });

    if (!user) {
      res.status(400).json({ error: 'Reset token is invalid or has expired.' });
      return;
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    store.saveUser({
      ...user,
      passwordHash,
      passwordResetTokenHash: undefined,
      passwordResetExpiresAt: undefined,
      tokenVersion: user.tokenVersion + 1,
      updatedAt: new Date().toISOString(),
    });
    store.revokeUserRefreshTokens(user.id);

    logAudit({
      actor: user,
      action: 'PASSWORD_RESET_COMPLETED',
      resourceType: 'Auth',
      resourceId: user.id,
    });

    res.json({ message: 'Password reset successful. You can now sign in with your new password.' });
  } catch (err) {
    next(err);
  }
});

export default router;
