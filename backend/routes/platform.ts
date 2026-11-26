import crypto from 'node:crypto';
import { Router, type Response } from 'express';
import { requireAuth, requireRole, type AuthenticatedRequest } from '../middleware/auth';
import { logAudit } from '../middleware/security';
import { store } from '../repositories/store';
import { incidentSchema, platformSettingsSchema, updateIncidentSchema } from '../validators/schemas';

const router = Router();
router.use(requireAuth);

// Any authenticated user can read non-sensitive platform taxonomy (subjects, categories, groups, institution info)
router.get('/settings', (_req: AuthenticatedRequest, res: Response) => {
  const settings = store.getSettings();
  res.json({ settings });
});

router.put('/settings', requireRole('admin'), (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const data = platformSettingsSchema.parse(req.body);
    const current = store.getSettings();
    const updated = store.saveSettings({
      id: current?.id || 'settings-main',
      ...data,
      updatedAt: new Date().toISOString(),
    });

    logAudit({
      actor: req.user,
      action: 'PLATFORM_SETTINGS_UPDATED',
      resourceType: 'PlatformSettings',
      resourceId: updated.id,
    });

    res.json({ settings: updated });
  } catch (err) {
    next(err);
  }
});

// Incident reports: Teachers & Admins can report; Admins review/resolve
router.get('/incidents', requireRole('admin', 'teacher'), (req: AuthenticatedRequest, res: Response) => {
  const usersMap = new Map(store.getUsers().map((u) => [u.id, u.name]));
  const examsMap = new Map(store.getExams().map((e) => [e.id, e.title]));

  let incidents = store.getIncidents();
  if (req.user!.role === 'teacher') {
    incidents = incidents.filter((i) => i.reportedBy === req.user!.id);
  }

  res.json({
    incidents: incidents.map((i) => ({
      ...i,
      reporterName: usersMap.get(i.reportedBy) || 'User',
      studentName: i.studentId ? usersMap.get(i.studentId) || '' : '',
      examTitle: i.examId ? examsMap.get(i.examId) || '' : '',
    })),
  });
});

router.post('/incidents', requireRole('admin', 'teacher', 'student'), (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const data = incidentSchema.parse(req.body);
    const now = new Date().toISOString();
    const created = store.saveIncident({
      id: `inc-${crypto.randomUUID().slice(0, 10)}`,
      reportedBy: req.user!.id,
      ...data,
      status: 'open',
      createdAt: now,
      updatedAt: now,
    });

    logAudit({
      actor: req.user,
      action: 'INCIDENT_REPORTED',
      resourceType: 'IncidentReport',
      resourceId: created.id,
      metadata: { severity: created.severity },
    });

    res.status(201).json({ incident: created });
  } catch (err) {
    next(err);
  }
});

router.patch('/incidents/:id', requireRole('admin'), (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const data = updateIncidentSchema.parse(req.body);
    const existing = store.getIncidents().find((i) => i.id === req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Incident report not found.' });
      return;
    }

    const updated = store.saveIncident({
      ...existing,
      status: data.status,
      resolutionNote: data.resolutionNote ?? existing.resolutionNote,
      updatedAt: new Date().toISOString(),
    });

    logAudit({
      actor: req.user,
      action: 'INCIDENT_UPDATED',
      resourceType: 'IncidentReport',
      resourceId: updated.id,
      metadata: { status: updated.status },
    });

    res.json({ incident: updated });
  } catch (err) {
    next(err);
  }
});

// Audit logs (Admin only)
router.get('/audit-logs', requireRole('admin'), (_req: AuthenticatedRequest, res: Response) => {
  res.json({ logs: store.getAuditLogs().slice(0, 100) });
});

export default router;
