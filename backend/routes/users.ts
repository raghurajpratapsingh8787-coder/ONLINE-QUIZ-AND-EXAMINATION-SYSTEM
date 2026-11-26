import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Router, type Response } from 'express';
import { requireAuth, requireRole, sanitizeUser, type AuthenticatedRequest } from '../middleware/auth';
import { logAudit } from '../middleware/security';
import { store } from '../repositories/store';
import { notifyUser } from '../services/realtime';
import { adminCreateUserSchema, adminUpdateUserSchema } from '../validators/schemas';

const router = Router();

router.use(requireAuth);

// Admin lists all users; teachers can list students to assign exams
router.get('/', requireRole('admin', 'teacher'), (req: AuthenticatedRequest, res: Response) => {
  const roleFilter = typeof req.query.role === 'string' ? req.query.role : '';
  const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
  const statusFilter = typeof req.query.status === 'string' ? req.query.status : '';

  let users = store.getUsers();

  // Teachers can only query active students (never admin/other teachers' private account info)
  if (req.user!.role === 'teacher') {
    users = users.filter((u) => u.role === 'student');
  } else if (roleFilter && ['admin', 'teacher', 'student'].includes(roleFilter)) {
    users = users.filter((u) => u.role === roleFilter);
  }

  if (statusFilter && ['active', 'inactive', 'suspended'].includes(statusFilter)) {
    users = users.filter((u) => u.accountStatus === statusFilter);
  }

  if (search) {
    users = users.filter(
      (u) =>
        u.name.toLowerCase().includes(search) ||
        u.email.toLowerCase().includes(search) ||
        (u.rollNumber || '').toLowerCase().includes(search) ||
        (u.group || '').toLowerCase().includes(search)
    );
  }

  res.json({ users: users.map(sanitizeUser) });
});

router.post('/', requireRole('admin'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const data = adminCreateUserSchema.parse(req.body);
    const normalizedEmail = data.email.toLowerCase();
    if (store.findUserByEmail(normalizedEmail)) {
      res.status(409).json({ error: 'Email is already registered.' });
      return;
    }

    const passwordHash = await bcrypt.hash(data.password, 10);
    const now = new Date().toISOString();
    const created = store.saveUser({
      id: `usr-${crypto.randomUUID().slice(0, 10)}`,
      name: data.name,
      email: normalizedEmail,
      passwordHash,
      role: data.role,
      accountStatus: data.accountStatus,
      emailVerified: true,
      department: data.department,
      group: data.group,
      rollNumber: data.rollNumber,
      tokenVersion: 0,
      createdAt: now,
      updatedAt: now,
    });

    logAudit({
      actor: req.user,
      action: 'USER_CREATED_BY_ADMIN',
      resourceType: 'User',
      resourceId: created.id,
      metadata: { role: created.role, email: created.email },
    });

    res.status(201).json({ user: sanitizeUser(created) });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', requireRole('admin'), (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const data = adminUpdateUserSchema.parse(req.body);
    const target = store.findUserById(req.params.id);
    if (!target) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    // Prevent admin from deactivating or demoting their own active account
    if (target.id === req.user!.id) {
      if (data.accountStatus && data.accountStatus !== 'active') {
        res.status(400).json({ error: 'You cannot deactivate your own administrator account.' });
        return;
      }
      if (data.role && data.role !== 'admin') {
        res.status(400).json({ error: 'You cannot revoke your own administrator role.' });
        return;
      }
    }

    const statusChanged = data.accountStatus && data.accountStatus !== target.accountStatus;
    const roleChanged = data.role && data.role !== target.role;

    const updated = store.saveUser({
      ...target,
      name: data.name ?? target.name,
      role: data.role ?? target.role,
      accountStatus: data.accountStatus ?? target.accountStatus,
      department: data.department ?? target.department,
      group: data.group ?? target.group,
      rollNumber: data.rollNumber ?? target.rollNumber,
      tokenVersion: statusChanged || roleChanged ? target.tokenVersion + 1 : target.tokenVersion,
      updatedAt: new Date().toISOString(),
    });

    if (statusChanged && updated.accountStatus !== 'active') {
      store.revokeUserRefreshTokens(updated.id);
    }

    logAudit({
      actor: req.user,
      action: 'USER_UPDATED_BY_ADMIN',
      resourceType: 'User',
      resourceId: updated.id,
      metadata: { role: updated.role, accountStatus: updated.accountStatus },
    });

    if (statusChanged || roleChanged) {
      void notifyUser({
        userId: updated.id,
        title: 'Account Update',
        message: `Your account role is "${updated.role}" and status is "${updated.accountStatus}".`,
        type: 'account_alert',
      });
    }

    res.json({ user: sanitizeUser(updated) });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireRole('admin'), (req: AuthenticatedRequest, res: Response) => {
  const target = store.findUserById(req.params.id);
  if (!target) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }
  if (target.id === req.user!.id) {
    res.status(400).json({ error: 'You cannot delete your own account.' });
    return;
  }

  store.revokeUserRefreshTokens(target.id);
  store.deleteUser(target.id);

  logAudit({
    actor: req.user,
    action: 'USER_DELETED_BY_ADMIN',
    resourceType: 'User',
    resourceId: target.id,
    metadata: { email: target.email, role: target.role },
  });

  res.json({ message: 'User removed successfully.' });
});

export default router;
