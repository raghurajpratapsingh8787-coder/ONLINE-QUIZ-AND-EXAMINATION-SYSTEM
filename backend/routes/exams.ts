import crypto from 'node:crypto';
import { Router, type Response } from 'express';
import { requireAuth, requireRole, type AuthenticatedRequest } from '../middleware/auth';
import { logAudit } from '../middleware/security';
import { store } from '../repositories/store';
import { checkExamEligibility } from '../services/grading';
import { notifyUser } from '../services/realtime';
import type { ExamRecord } from '../types';
import { examSchema } from '../validators/schemas';

const router = Router();
router.use(requireAuth);

function computeEffectiveStatus(exam: ExamRecord, nowMs: number): ExamRecord['status'] {
  if (exam.status === 'draft' || exam.status === 'cancelled' || exam.status === 'published') {
    return exam.status;
  }
  const startMs = new Date(exam.startTime).getTime();
  const endMs = new Date(exam.endTime).getTime();
  if (nowMs < startMs) return 'scheduled';
  if (nowMs >= startMs && nowMs <= endMs) return 'active';
  return 'completed';
}

router.get('/', (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const nowMs = Date.now();
  const statusFilter = typeof req.query.status === 'string' ? req.query.status : '';
  const subjectFilter = typeof req.query.subject === 'string' ? req.query.subject : '';
  const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';

  let exams = store.getExams().map((e) => ({
    ...e,
    effectiveStatus: computeEffectiveStatus(e, nowMs),
  }));

  if (user.role === 'teacher') {
    exams = exams.filter((e) => e.createdBy === user.id);
  } else if (user.role === 'student') {
    exams = exams.filter((e) => {
      if (e.status === 'draft' || e.status === 'cancelled') return false;
      const restricted = e.assignedGroups.length > 0 || e.assignedStudentIds.length > 0;
      if (!restricted) return true;
      return Boolean(
        (user.group && e.assignedGroups.includes(user.group)) ||
          e.assignedStudentIds.includes(user.id)
      );
    });
  }

  if (statusFilter) exams = exams.filter((e) => e.effectiveStatus === statusFilter || e.status === statusFilter);
  if (subjectFilter) exams = exams.filter((e) => e.subject === subjectFilter);
  if (search) {
    exams = exams.filter(
      (e) =>
        e.title.toLowerCase().includes(search) ||
        e.subject.toLowerCase().includes(search) ||
        e.description.toLowerCase().includes(search)
    );
  }

  const usersMap = new Map(store.getUsers().map((u) => [u.id, u.name]));
  const allAttempts = store.getAttempts();
  const allResults = store.getResults();

  const enriched = exams
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((exam) => {
      const examAttempts = allAttempts.filter((a) => a.examId === exam.id);
      const studentAttempts =
        user.role === 'student' ? examAttempts.filter((a) => a.studentId === user.id) : [];
      const eligibility =
        user.role === 'student'
          ? checkExamEligibility({ exam, student: user, existingAttempts: studentAttempts, nowMs })
          : undefined;
      const inProgressAttempt = studentAttempts.find(
        (a) => a.status === 'in_progress' && new Date(a.deadline).getTime() > nowMs
      );
      const studentPublishedResult =
        user.role === 'student'
          ? allResults.find(
              (r) => r.examId === exam.id && r.studentId === user.id && r.resultStatus === 'published'
            )
          : undefined;

      return {
        ...exam,
        status: exam.effectiveStatus,
        creatorName: usersMap.get(exam.createdBy) || 'Faculty',
        questionCount: exam.questionIds.length,
        submissionCount: examAttempts.filter((a) => a.status !== 'in_progress').length,
        ...(user.role === 'student'
          ? {
              eligibility,
              attemptsUsed: studentAttempts.filter((a) => a.status !== 'in_progress').length,
              inProgressAttemptId: inProgressAttempt?.id || null,
              hasPublishedResult: Boolean(studentPublishedResult),
              publishedResultId: studentPublishedResult?.id || null,
            }
          : {}),
      };
    });

  res.json({ exams: enriched, serverTime: new Date(nowMs).toISOString() });
});

router.get('/:id', (req: AuthenticatedRequest, res: Response) => {
  const exam = store.findExamById(req.params.id);
  if (!exam) {
    res.status(404).json({ error: 'Examination not found.' });
    return;
  }

  const user = req.user!;
  if (user.role === 'teacher' && exam.createdBy !== user.id) {
    res.status(403).json({ error: 'You do not have permission to view this examination.' });
    return;
  }

  if (user.role === 'student') {
    if (exam.status === 'draft' || exam.status === 'cancelled') {
      res.status(403).json({ error: 'Examination is unavailable.' });
      return;
    }
    const restricted = exam.assignedGroups.length > 0 || exam.assignedStudentIds.length > 0;
    const allowed =
      !restricted ||
      (user.group && exam.assignedGroups.includes(user.group)) ||
      exam.assignedStudentIds.includes(user.id);
    if (!allowed) {
      res.status(403).json({ error: 'You are not assigned to this examination.' });
      return;
    }
  }

  const nowMs = Date.now();
  const studentAttempts =
    user.role === 'student'
      ? store.getAttempts().filter((a) => a.examId === exam.id && a.studentId === user.id)
      : [];

  res.json({
    exam: {
      ...exam,
      status: computeEffectiveStatus(exam, nowMs),
      questionCount: exam.questionIds.length,
    },
    eligibility:
      user.role === 'student'
        ? checkExamEligibility({ exam, student: user, existingAttempts: studentAttempts, nowMs })
        : undefined,
    serverTime: new Date(nowMs).toISOString(),
  });
});

router.post('/', requireRole('admin', 'teacher'), (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const data = examSchema.parse(req.body);

    const startMs = new Date(data.startTime).getTime();
    const endMs = new Date(data.endTime).getTime();
    if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) {
      res.status(400).json({ error: 'End time must be after start time.' });
      return;
    }
    if (data.passingMarks > data.totalMarks) {
      res.status(400).json({ error: 'Passing marks cannot exceed total marks.' });
      return;
    }

    // Verify all selected questions exist and belong to teacher (if teacher)
    const missingIds = data.questionIds.filter((qid) => {
      const q = store.findQuestionById(qid);
      if (!q) return true;
      if (req.user!.role === 'teacher' && q.createdBy !== req.user!.id) return true;
      return false;
    });
    if (missingIds.length > 0) {
      res.status(400).json({ error: 'One or more selected questions are invalid or unauthorized.' });
      return;
    }

    const now = new Date().toISOString();
    const created = store.saveExam({
      id: `exam-${crypto.randomUUID().slice(0, 10)}`,
      createdBy: req.user!.id,
      ...data,
      startTime: new Date(data.startTime).toISOString(),
      endTime: new Date(data.endTime).toISOString(),
      createdAt: now,
      updatedAt: now,
    });

    logAudit({
      actor: req.user,
      action: 'EXAM_CREATED',
      resourceType: 'Exam',
      resourceId: created.id,
      metadata: { title: created.title, status: created.status },
    });

    // Notify assigned students if exam is not draft
    if (created.status !== 'draft' && created.status !== 'cancelled') {
      const targetStudents = store.getUsers().filter((u) => {
        if (u.role !== 'student' || u.accountStatus !== 'active') return false;
        const restricted = created.assignedGroups.length > 0 || created.assignedStudentIds.length > 0;
        if (!restricted) return true;
        return Boolean(
          (u.group && created.assignedGroups.includes(u.group)) ||
            created.assignedStudentIds.includes(u.id)
        );
      });

      for (const stu of targetStudents) {
        void notifyUser({
          userId: stu.id,
          title: `New Examination: ${created.title}`,
          message: `Scheduled for ${created.subject} (${created.duration} mins, ${created.totalMarks} marks).`,
          type: 'exam_announced',
          link: '/exams',
          sendEmail: true,
        });
      }
    }

    res.status(201).json({ exam: created });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', requireRole('admin', 'teacher'), (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const existing = store.findExamById(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Examination not found.' });
      return;
    }
    if (req.user!.role === 'teacher' && existing.createdBy !== req.user!.id) {
      res.status(403).json({ error: 'You can only edit your own examinations.' });
      return;
    }

    const data = examSchema.parse(req.body);
    const startMs = new Date(data.startTime).getTime();
    const endMs = new Date(data.endTime).getTime();
    if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) {
      res.status(400).json({ error: 'End time must be after start time.' });
      return;
    }
    if (data.passingMarks > data.totalMarks) {
      res.status(400).json({ error: 'Passing marks cannot exceed total marks.' });
      return;
    }

    // Verify all selected questions exist and belong to teacher (prevents attaching another teacher's questions)
    const missingOrUnauthorized = data.questionIds.filter((qid) => {
      const q = store.findQuestionById(qid);
      if (!q) return true;
      if (req.user!.role === 'teacher' && q.createdBy !== req.user!.id) return true;
      return false;
    });
    if (missingOrUnauthorized.length > 0) {
      res.status(400).json({ error: 'One or more selected questions are invalid or unauthorized.' });
      return;
    }

    const updated = store.saveExam({
      ...existing,
      ...data,
      startTime: new Date(data.startTime).toISOString(),
      endTime: new Date(data.endTime).toISOString(),
      updatedAt: new Date().toISOString(),
    });

    logAudit({
      actor: req.user,
      action: 'EXAM_UPDATED',
      resourceType: 'Exam',
      resourceId: updated.id,
      metadata: { title: updated.title, status: updated.status },
    });

    res.json({ exam: updated });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireRole('admin', 'teacher'), (req: AuthenticatedRequest, res: Response) => {
  const existing = store.findExamById(req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'Examination not found.' });
    return;
  }
  if (req.user!.role === 'teacher' && existing.createdBy !== req.user!.id) {
    res.status(403).json({ error: 'You can only delete your own examinations.' });
    return;
  }

  const attempts = store.getAttempts().filter((a) => a.examId === existing.id);
  if (attempts.length > 0 && req.user!.role !== 'admin') {
    res.status(400).json({ error: 'Examinations with student submissions cannot be deleted by teachers. Cancel it instead.' });
    return;
  }

  store.deleteExam(existing.id);
  logAudit({
    actor: req.user,
    action: 'EXAM_DELETED',
    resourceType: 'Exam',
    resourceId: existing.id,
    metadata: { title: existing.title },
  });

  res.json({ message: 'Examination deleted successfully.' });
});

export default router;
