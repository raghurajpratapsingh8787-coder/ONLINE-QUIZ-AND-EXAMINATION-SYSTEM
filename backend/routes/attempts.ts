import crypto from 'node:crypto';
import { Router, type Response } from 'express';
import { requireAuth, requireRole, type AuthenticatedRequest } from '../middleware/auth';
import { logAudit } from '../middleware/security';
import { store } from '../repositories/store';
import {
  checkExamEligibility,
  computeAttemptDeadline,
  evaluateExamSubmission,
  sanitizeQuestionForStudentExam,
  shuffleArray,
} from '../services/grading';
import { notifyUser } from '../services/realtime';
import type { AttemptAnswer, ExamAttemptRecord, QuestionRecord, ResultRecord } from '../types';
import { evaluateSubjectiveSchema, integritySignalSchema, saveAnswerSchema } from '../validators/schemas';

const router = Router();
router.use(requireAuth);

function finalizeAttemptSubmission(
  attempt: ExamAttemptRecord,
  mode: 'submitted' | 'auto_submitted'
): { attempt: ExamAttemptRecord; result: ResultRecord } {
  const exam = store.findExamById(attempt.examId)!;
  const questions = attempt.questionOrder
    .map((qid) => store.findQuestionById(qid))
    .filter(Boolean) as QuestionRecord[];

  const nowIso = new Date().toISOString();
  const submittedMs = new Date(nowIso).getTime();
  const startedMs = new Date(attempt.startedAt).getTime();
  const timeTakenSeconds = Math.max(1, Math.round((submittedMs - startedMs) / 1000));

  const evaluation = evaluateExamSubmission({
    exam,
    questions,
    answers: attempt.answers,
  });

  const hasPendingSubjective = evaluation.subjectivePendingCount > 0;
  const shouldPublishNow = !hasPendingSubjective && exam.settings.publishResultsImmediately;

  const updatedAttempt = store.saveAttempt({
    ...attempt,
    submittedAt: nowIso,
    score: evaluation.obtainedMarks,
    status: hasPendingSubjective ? mode : 'evaluated',
    updatedAt: nowIso,
  });

  const result: ResultRecord = store.saveResult({
    id: `res-${crypto.randomUUID().slice(0, 10)}`,
    studentId: attempt.studentId,
    examId: attempt.examId,
    attemptId: attempt.id,
    totalMarks: evaluation.totalMarks,
    obtainedMarks: evaluation.obtainedMarks,
    percentage: evaluation.percentage,
    correctCount: evaluation.correctCount,
    incorrectCount: evaluation.incorrectCount,
    unattemptedCount: evaluation.unattemptedCount,
    subjectivePendingCount: evaluation.subjectivePendingCount,
    passed: evaluation.passed,
    timeTakenSeconds,
    resultStatus: hasPendingSubjective
      ? 'pending_evaluation'
      : shouldPublishNow
      ? 'published'
      : 'evaluated',
    publishedAt: shouldPublishNow ? nowIso : undefined,
    createdAt: nowIso,
    updatedAt: nowIso,
  });

  // Notify teacher if subjective questions need manual evaluation
  if (hasPendingSubjective) {
    const student = store.findUserById(attempt.studentId);
    void notifyUser({
      userId: exam.createdBy,
      title: `Submission Awaiting Grading: ${exam.title}`,
      message: `${student?.name || 'A student'} submitted ${evaluation.subjectivePendingCount} subjective response(s).`,
      type: 'exam_completed',
      link: '/submissions',
    });
  }

  // Notify student
  void notifyUser({
    userId: attempt.studentId,
    title: shouldPublishNow ? `Result Published: ${exam.title}` : `Examination Submitted: ${exam.title}`,
    message: shouldPublishNow
      ? `You scored ${result.obtainedMarks}/${result.totalMarks} (${result.percentage}%).`
      : hasPendingSubjective
      ? 'Your submission has been received and is awaiting subjective faculty evaluation.'
      : 'Your submission has been recorded. Results will be visible once published.',
    type: shouldPublishNow ? 'result_published' : 'exam_completed',
    link: shouldPublishNow ? '/results' : '/dashboard',
    sendEmail: shouldPublishNow,
  });

  return { attempt: updatedAttempt, result };
}

// Start or resume an eligible examination attempt (Student only, concurrency-locked)
router.post('/start/:examId', requireRole('student'), (req: AuthenticatedRequest, res: Response) => {
  const student = req.user!;
  const exam = store.findExamById(req.params.examId);
  if (!exam) {
    res.status(404).json({ error: 'Examination not found.' });
    return;
  }

  const lockKey = `start:${student.id}:${exam.id}`;
  if (!store.acquireLock(lockKey)) {
    res.status(409).json({ error: 'An examination session start is already in progress.' });
    return;
  }

  try {
    const nowMs = Date.now();
    const existingAttempts = store
      .getAttempts()
      .filter((a) => a.examId === exam.id && a.studentId === student.id);

    // Check if an in-progress attempt exists and is still valid
    const activeAttempt = existingAttempts.find((a) => a.status === 'in_progress');
    if (activeAttempt) {
      const deadlineMs = new Date(activeAttempt.deadline).getTime();
      if (nowMs > deadlineMs) {
        // Automatically close expired attempt
        finalizeAttemptSubmission(activeAttempt, 'auto_submitted');
      } else {
        const questions = activeAttempt.questionOrder
          .map((qid) => store.findQuestionById(qid))
          .filter(Boolean)
          .map((q) => sanitizeQuestionForStudentExam(q!, activeAttempt.optionOrders[q!.id]));

        res.json({
          attempt: activeAttempt,
          exam: {
            id: exam.id,
            title: exam.title,
            subject: exam.subject,
            duration: exam.duration,
            totalMarks: exam.totalMarks,
            passingMarks: exam.passingMarks,
            instructions: exam.instructions,
            settings: exam.settings,
          },
          questions,
          remainingSeconds: Math.max(0, Math.floor((deadlineMs - nowMs) / 1000)),
          serverTime: new Date(nowMs).toISOString(),
        });
        return;
      }
    }

    // Re-fetch attempts after potential auto-submission above
    const refreshedAttempts = store
      .getAttempts()
      .filter((a) => a.examId === exam.id && a.studentId === student.id);

    const eligibility = checkExamEligibility({
      exam,
      student,
      existingAttempts: refreshedAttempts,
      nowMs,
    });

    if (!eligibility.eligible) {
      res.status(403).json({ error: eligibility.reason || 'You are not eligible to start this examination.' });
      return;
    }

    const validQuestions = exam.questionIds
      .map((qid) => store.findQuestionById(qid))
      .filter(Boolean) as QuestionRecord[];

    const orderedQuestions = exam.settings.randomizeQuestions
      ? shuffleArray(validQuestions)
      : validQuestions;
    const questionOrder = orderedQuestions.map((q) => q.id);

    const optionOrders: Record<string, string[]> = {};
    for (const q of orderedQuestions) {
      if (q.options.length > 0) {
        optionOrders[q.id] = exam.settings.randomizeOptions
          ? shuffleArray(q.options.map((o) => o.id))
          : q.options.map((o) => o.id);
      }
    }

    const nowIso = new Date(nowMs).toISOString();
    const deadline = computeAttemptDeadline(nowMs, exam.duration, exam.endTime);

    const initialAnswers: Record<string, AttemptAnswer> = {};
    if (questionOrder[0]) {
      initialAnswers[questionOrder[0]] = {
        questionId: questionOrder[0],
        markedForReview: false,
        visited: true,
        updatedAt: nowIso,
      };
    }

    const attempt = store.saveAttempt({
      id: `att-${crypto.randomUUID().slice(0, 10)}`,
      studentId: student.id,
      examId: exam.id,
      attemptNumber: refreshedAttempts.length + 1,
      questionOrder,
      optionOrders,
      answers: initialAnswers,
      startedAt: nowIso,
      deadline,
      score: 0,
      status: 'in_progress',
      integritySignals: [],
      createdAt: nowIso,
      updatedAt: nowIso,
    });

    logAudit({
      actor: student,
      action: 'EXAM_ATTEMPT_STARTED',
      resourceType: 'ExamAttempt',
      resourceId: attempt.id,
      metadata: { examId: exam.id, attemptNumber: attempt.attemptNumber },
    });

    const sanitizedQuestions = orderedQuestions.map((q) =>
      sanitizeQuestionForStudentExam(q, optionOrders[q.id])
    );

    res.status(201).json({
      attempt,
      exam: {
        id: exam.id,
        title: exam.title,
        subject: exam.subject,
        duration: exam.duration,
        totalMarks: exam.totalMarks,
        passingMarks: exam.passingMarks,
        instructions: exam.instructions,
        settings: exam.settings,
      },
      questions: sanitizedQuestions,
      remainingSeconds: Math.max(0, Math.floor((new Date(deadline).getTime() - nowMs) / 1000)),
      serverTime: nowIso,
    });
  } finally {
    store.releaseLock(lockKey);
  }
});

// Get active attempt state (for page refresh recovery)
router.get('/:attemptId', requireRole('student'), (req: AuthenticatedRequest, res: Response) => {
  const attempt = store.findAttemptById(req.params.attemptId);
  if (!attempt) {
    res.status(404).json({ error: 'Attempt not found.' });
    return;
  }
  if (attempt.studentId !== req.user!.id) {
    res.status(403).json({ error: 'You cannot access another student’s examination attempt.' });
    return;
  }

  const exam = store.findExamById(attempt.examId);
  if (!exam) {
    res.status(404).json({ error: 'Examination not found.' });
    return;
  }

  const nowMs = Date.now();
  const deadlineMs = new Date(attempt.deadline).getTime();

  if (attempt.status === 'in_progress' && nowMs > deadlineMs) {
    const finalized = finalizeAttemptSubmission(attempt, 'auto_submitted');
    res.json({
      attempt: finalized.attempt,
      autoSubmitted: true,
      resultPublished: finalized.result.resultStatus === 'published',
      resultId: finalized.result.resultStatus === 'published' ? finalized.result.id : null,
    });
    return;
  }

  const questions = attempt.questionOrder
    .map((qid) => store.findQuestionById(qid))
    .filter(Boolean)
    .map((q) => sanitizeQuestionForStudentExam(q!, attempt.optionOrders[q!.id]));

  res.json({
    attempt,
    exam: {
      id: exam.id,
      title: exam.title,
      subject: exam.subject,
      duration: exam.duration,
      totalMarks: exam.totalMarks,
      passingMarks: exam.passingMarks,
      instructions: exam.instructions,
      settings: exam.settings,
    },
    questions,
    remainingSeconds: Math.max(0, Math.floor((deadlineMs - nowMs) / 1000)),
    serverTime: new Date(nowMs).toISOString(),
  });
});

// Auto-save an answer during an active exam
router.patch('/:attemptId/answer', requireRole('student'), (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const attempt = store.findAttemptById(req.params.attemptId);
    if (!attempt) {
      res.status(404).json({ error: 'Attempt not found.' });
      return;
    }
    if (attempt.studentId !== req.user!.id) {
      res.status(403).json({ error: 'Unauthorized attempt modification.' });
      return;
    }
    if (attempt.status !== 'in_progress') {
      res.status(409).json({ error: 'This examination has already been submitted.' });
      return;
    }

    const nowMs = Date.now();
    const deadlineMs = new Date(attempt.deadline).getTime();
    // 5-second grace window for in-flight saves
    if (nowMs > deadlineMs + 5000) {
      const finalized = finalizeAttemptSubmission(attempt, 'auto_submitted');
      res.status(410).json({
        error: 'Examination time expired; your answers were automatically submitted.',
        attempt: finalized.attempt,
      });
      return;
    }

    const data = saveAnswerSchema.parse(req.body);
    if (!attempt.questionOrder.includes(data.questionId)) {
      res.status(400).json({ error: 'Question does not belong to this attempt.' });
      return;
    }

    const existing = attempt.answers[data.questionId];
    const nowIso = new Date(nowMs).toISOString();

    attempt.answers[data.questionId] = {
      questionId: data.questionId,
      selectedOptions: data.selectedOptions !== undefined ? data.selectedOptions : existing?.selectedOptions,
      textAnswer: data.textAnswer !== undefined ? data.textAnswer : existing?.textAnswer,
      markedForReview: data.markedForReview !== undefined ? data.markedForReview : existing?.markedForReview ?? false,
      visited: data.visited !== undefined ? data.visited : true,
      updatedAt: nowIso,
    };
    attempt.updatedAt = nowIso;
    store.saveAttempt(attempt);

    res.json({
      saved: true,
      savedAt: nowIso,
      remainingSeconds: Math.max(0, Math.floor((deadlineMs - nowMs) / 1000)),
    });
  } catch (err) {
    next(err);
  }
});

// Transparent integrity signal logging (e.g., tab switch — never treated as proof of misconduct)
router.post('/:attemptId/signal', requireRole('student'), (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const attempt = store.findAttemptById(req.params.attemptId);
    if (!attempt || attempt.studentId !== req.user!.id || attempt.status !== 'in_progress') {
      res.status(404).json({ error: 'Active attempt not found.' });
      return;
    }

    const data = integritySignalSchema.parse(req.body);
    attempt.integritySignals.push({
      type: data.type,
      timestamp: new Date().toISOString(),
      details: data.details,
    });
    store.saveAttempt(attempt);

    res.json({ recorded: true, count: attempt.integritySignals.length });
  } catch (err) {
    next(err);
  }
});

// Submit examination with concurrency lock against simultaneous duplicate requests
router.post('/:attemptId/submit', requireRole('student'), (req: AuthenticatedRequest, res: Response) => {
  const attemptId = req.params.attemptId;
  const lockKey = `submit:${attemptId}`;
  if (!store.acquireLock(lockKey)) {
    res.status(409).json({ error: 'Submission is already being processed.' });
    return;
  }

  try {
    const attempt = store.findAttemptById(attemptId);
    if (!attempt) {
      res.status(404).json({ error: 'Attempt not found.' });
      return;
    }
    if (attempt.studentId !== req.user!.id) {
      res.status(403).json({ error: 'Unauthorized submission.' });
      return;
    }

    if (attempt.status !== 'in_progress') {
      attempt.integritySignals.push({
        type: 'duplicate_submit_blocked',
        timestamp: new Date().toISOString(),
        details: 'Duplicate final submission request blocked.',
      });
      store.saveAttempt(attempt);
      logAudit({
        actor: req.user,
        action: 'DUPLICATE_SUBMISSION_BLOCKED',
        resourceType: 'ExamAttempt',
        resourceId: attempt.id,
      });
      res.status(409).json({ error: 'Examination was already submitted.' });
      return;
    }

    const nowMs = Date.now();
    const deadlineMs = new Date(attempt.deadline).getTime();
    const isAuto = req.body?.auto === true || nowMs > deadlineMs;

    if (nowMs > deadlineMs + 15000) {
      attempt.integritySignals.push({
        type: 'late_submission_attempt',
        timestamp: new Date(nowMs).toISOString(),
        details: `Submitted ${Math.round((nowMs - deadlineMs) / 1000)}s after deadline.`,
      });
    }

    const { attempt: finalizedAttempt, result } = finalizeAttemptSubmission(
      attempt,
      isAuto ? 'auto_submitted' : 'submitted'
    );

    logAudit({
      actor: req.user,
      action: isAuto ? 'EXAM_AUTO_SUBMITTED' : 'EXAM_SUBMITTED',
      resourceType: 'ExamAttempt',
      resourceId: finalizedAttempt.id,
      metadata: { examId: finalizedAttempt.examId, resultStatus: result.resultStatus },
    });

    res.json({
      message: 'Examination submitted successfully.',
      attemptStatus: finalizedAttempt.status,
      resultStatus: result.resultStatus,
      resultPublished: result.resultStatus === 'published',
      resultId: result.resultStatus === 'published' ? result.id : null,
      // Only expose score if exam publishes immediately
      ...(result.resultStatus === 'published'
        ? {
            summary: {
              obtainedMarks: result.obtainedMarks,
              totalMarks: result.totalMarks,
              percentage: result.percentage,
              passed: result.passed,
            },
          }
        : {}),
    });
  } finally {
    store.releaseLock(lockKey);
  }
});

// Teacher/Admin: list student submissions (scoped by teacher ownership)
router.get('/submissions/list', requireRole('admin', 'teacher'), (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const examIdFilter = typeof req.query.examId === 'string' ? req.query.examId : '';
  const statusFilter = typeof req.query.status === 'string' ? req.query.status : '';

  const allowedExamIds = new Set(
    store
      .getExams()
      .filter((e) => user.role === 'admin' || e.createdBy === user.id)
      .map((e) => e.id)
  );

  const usersMap = new Map(store.getUsers().map((u) => [u.id, u]));
  const examsMap = new Map(store.getExams().map((e) => [e.id, e]));
  const resultsByAttempt = new Map(store.getResults().map((r) => [r.attemptId, r]));

  let attempts = store
    .getAttempts()
    .filter((a) => a.status !== 'in_progress' && allowedExamIds.has(a.examId));

  if (examIdFilter) attempts = attempts.filter((a) => a.examId === examIdFilter);

  const rows = attempts
    .map((a) => {
      const stu = usersMap.get(a.studentId);
      const exam = examsMap.get(a.examId);
      const result = resultsByAttempt.get(a.id);
      return {
        attemptId: a.id,
        examId: a.examId,
        examTitle: exam?.title || 'Unknown Exam',
        subject: exam?.subject || '',
        studentId: a.studentId,
        studentName: stu?.name || 'Student',
        studentEmail: stu?.email || '',
        rollNumber: stu?.rollNumber || '',
        attemptNumber: a.attemptNumber,
        startedAt: a.startedAt,
        submittedAt: a.submittedAt,
        status: a.status,
        integritySignalCount: a.integritySignals.length,
        integritySignals: a.integritySignals,
        result: result || null,
      };
    })
    .filter((row) => {
      if (!statusFilter) return true;
      return row.result?.resultStatus === statusFilter;
    })
    .sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || ''));

  res.json({ submissions: rows });
});

// Teacher/Admin: get detailed submission with questions & student answers for evaluation
router.get('/submissions/:attemptId', requireRole('admin', 'teacher'), (req: AuthenticatedRequest, res: Response) => {
  const attempt = store.findAttemptById(req.params.attemptId);
  if (!attempt) {
    res.status(404).json({ error: 'Submission not found.' });
    return;
  }
  const exam = store.findExamById(attempt.examId);
  if (!exam) {
    res.status(404).json({ error: 'Examination not found.' });
    return;
  }
  if (req.user!.role === 'teacher' && exam.createdBy !== req.user!.id) {
    res.status(403).json({ error: 'You cannot inspect submissions for another teacher’s exam.' });
    return;
  }

  const student = store.findUserById(attempt.studentId);
  const result = store.findResultByAttemptId(attempt.id);
  const questions = attempt.questionOrder
    .map((qid) => store.findQuestionById(qid))
    .filter(Boolean) as QuestionRecord[];

  res.json({
    attempt,
    exam,
    student: student
      ? { id: student.id, name: student.name, email: student.email, rollNumber: student.rollNumber, group: student.group }
      : null,
    result: result || null,
    questions,
  });
});

// Teacher/Admin: evaluate subjective answers and optionally publish result
router.post('/submissions/:attemptId/evaluate', requireRole('admin', 'teacher'), (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const attempt = store.findAttemptById(req.params.attemptId);
    if (!attempt) {
      res.status(404).json({ error: 'Submission not found.' });
      return;
    }
    const exam = store.findExamById(attempt.examId);
    if (!exam) {
      res.status(404).json({ error: 'Examination not found.' });
      return;
    }
    if (req.user!.role === 'teacher' && exam.createdBy !== req.user!.id) {
      res.status(403).json({ error: 'Unauthorized evaluation request.' });
      return;
    }

    const data = evaluateSubjectiveSchema.parse(req.body);
    const nowIso = new Date().toISOString();

    for (const grade of data.grades) {
      if (!attempt.questionOrder.includes(grade.questionId)) continue;
      const q = store.findQuestionById(grade.questionId);
      if (!q) continue;
      const existing = attempt.answers[grade.questionId] || {
        questionId: grade.questionId,
        markedForReview: false,
        visited: true,
        updatedAt: nowIso,
      };
      attempt.answers[grade.questionId] = {
        ...existing,
        awardedMarks: Math.max(0, Math.min(q.marks, grade.awardedMarks)),
        teacherFeedback: grade.teacherFeedback,
        isGraded: true,
        updatedAt: nowIso,
      };
    }

    const questions = attempt.questionOrder
      .map((qid) => store.findQuestionById(qid))
      .filter(Boolean) as QuestionRecord[];

    const evaluation = evaluateExamSubmission({
      exam,
      questions,
      answers: attempt.answers,
    });

    attempt.score = evaluation.obtainedMarks;
    attempt.status = evaluation.subjectivePendingCount === 0 ? 'evaluated' : attempt.status;
    attempt.updatedAt = nowIso;
    store.saveAttempt(attempt);

    const existingResult = store.findResultByAttemptId(attempt.id);
    const shouldPublish = Boolean(data.publishNow && evaluation.subjectivePendingCount === 0);

    const updatedResult: ResultRecord = store.saveResult({
      id: existingResult?.id || `res-${crypto.randomUUID().slice(0, 10)}`,
      studentId: attempt.studentId,
      examId: attempt.examId,
      attemptId: attempt.id,
      totalMarks: evaluation.totalMarks,
      obtainedMarks: evaluation.obtainedMarks,
      percentage: evaluation.percentage,
      correctCount: evaluation.correctCount,
      incorrectCount: evaluation.incorrectCount,
      unattemptedCount: evaluation.unattemptedCount,
      subjectivePendingCount: evaluation.subjectivePendingCount,
      passed: evaluation.passed,
      timeTakenSeconds: existingResult?.timeTakenSeconds || 0,
      resultStatus:
        evaluation.subjectivePendingCount > 0
          ? 'pending_evaluation'
          : shouldPublish
          ? 'published'
          : existingResult?.resultStatus === 'published'
          ? 'published'
          : 'evaluated',
      overallFeedback: data.overallFeedback ?? existingResult?.overallFeedback,
      publishedAt: shouldPublish ? nowIso : existingResult?.publishedAt,
      createdAt: existingResult?.createdAt || nowIso,
      updatedAt: nowIso,
    });

    logAudit({
      actor: req.user,
      action: 'SUBMISSION_EVALUATED',
      resourceType: 'Result',
      resourceId: updatedResult.id,
      metadata: {
        attemptId: attempt.id,
        obtainedMarks: updatedResult.obtainedMarks,
        published: updatedResult.resultStatus === 'published',
      },
    });

    if (shouldPublish) {
      void notifyUser({
        userId: attempt.studentId,
        title: `Result & Feedback Published: ${exam.title}`,
        message: `Final score: ${updatedResult.obtainedMarks}/${updatedResult.totalMarks} (${updatedResult.percentage}%).`,
        type: 'teacher_feedback',
        link: '/results',
        sendEmail: true,
      });
    }

    res.json({ attempt, result: updatedResult });
  } catch (err) {
    next(err);
  }
});

export default router;
