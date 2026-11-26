import { Router, type Response } from 'express';
import { requireAuth, requireRole, type AuthenticatedRequest } from '../middleware/auth';
import { logAudit } from '../middleware/security';
import { store } from '../repositories/store';
import { buildResultsCsv } from '../services/grading';
import { notifyUser } from '../services/realtime';
import type { QuestionRecord } from '../types';

const router = Router();
router.use(requireAuth);

router.get('/', (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const examIdFilter = typeof req.query.examId === 'string' ? req.query.examId : '';
  const subjectFilter = typeof req.query.subject === 'string' ? req.query.subject : '';

  const examsMap = new Map(store.getExams().map((e) => [e.id, e]));
  const usersMap = new Map(store.getUsers().map((u) => [u.id, u]));

  let results = store.getResults();

  if (user.role === 'student') {
    // Students can ONLY see their OWN PUBLISHED results
    results = results.filter((r) => r.studentId === user.id && r.resultStatus === 'published');
  } else if (user.role === 'teacher') {
    const ownedExamIds = new Set(
      store
        .getExams()
        .filter((e) => e.createdBy === user.id)
        .map((e) => e.id)
    );
    results = results.filter((r) => ownedExamIds.has(r.examId));
  }

  if (examIdFilter) results = results.filter((r) => r.examId === examIdFilter);
  if (subjectFilter) {
    results = results.filter((r) => examsMap.get(r.examId)?.subject === subjectFilter);
  }

  const enriched = results
    .map((r) => {
      const exam = examsMap.get(r.examId);
      const stu = usersMap.get(r.studentId);
      return {
        ...r,
        examTitle: exam?.title || 'Examination',
        subject: exam?.subject || 'General',
        category: exam?.category || 'General',
        passingMarks: exam?.passingMarks ?? 0,
        allowAnswerReview: exam?.settings.allowAnswerReview ?? false,
        studentName: stu?.name || 'Student',
        studentEmail: stu?.email || '',
        rollNumber: stu?.rollNumber || '',
        group: stu?.group || '',
      };
    })
    .sort((a, b) => (b.publishedAt || b.createdAt).localeCompare(a.publishedAt || a.createdAt));

  res.json({ results: enriched });
});

// Download CSV report (Teachers for their exams, Admin for all, Student for their own published)
router.get('/export/csv', (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const examIdFilter = typeof req.query.examId === 'string' ? req.query.examId : '';

  const examsMap = new Map(store.getExams().map((e) => [e.id, e]));
  const usersMap = new Map(store.getUsers().map((u) => [u.id, u]));

  let results = store.getResults();
  if (user.role === 'student') {
    results = results.filter((r) => r.studentId === user.id && r.resultStatus === 'published');
  } else if (user.role === 'teacher') {
    const owned = new Set(store.getExams().filter((e) => e.createdBy === user.id).map((e) => e.id));
    results = results.filter((r) => owned.has(r.examId));
  }
  if (examIdFilter) results = results.filter((r) => r.examId === examIdFilter);

  const csv = buildResultsCsv(
    results.map((result) => {
      const stu = usersMap.get(result.studentId);
      const exam = examsMap.get(result.examId);
      return {
        studentName: stu?.name || 'Student',
        studentEmail: stu?.email || '',
        rollNumber: stu?.rollNumber || '',
        examTitle: exam?.title || 'Exam',
        subject: exam?.subject || 'General',
        result,
      };
    })
  );

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="examvault-results-report.csv"');
  res.send(csv);
});

// Detailed result + permitted answer review & explanations
router.get('/:id', (req: AuthenticatedRequest, res: Response) => {
  const result = store.findResultById(req.params.id);
  if (!result) {
    res.status(404).json({ error: 'Result not found.' });
    return;
  }

  const exam = store.findExamById(result.examId);
  if (!exam) {
    res.status(404).json({ error: 'Associated examination not found.' });
    return;
  }

  const user = req.user!;
  if (user.role === 'student') {
    if (result.studentId !== user.id || result.resultStatus !== 'published') {
      res.status(403).json({ error: 'You are not authorized to access this result.' });
      return;
    }
  } else if (user.role === 'teacher' && exam.createdBy !== user.id) {
    res.status(403).json({ error: 'You can only view results for your own examinations.' });
    return;
  }

  const attempt = store.findAttemptById(result.attemptId);
  const student = store.findUserById(result.studentId);
  const canReviewAnswers = user.role !== 'student' || exam.settings.allowAnswerReview;

  const reviewItems =
    canReviewAnswers && attempt
      ? (attempt.questionOrder
          .map((qid) => store.findQuestionById(qid))
          .filter(Boolean) as QuestionRecord[]
        ).map((q) => {
          const ans = attempt.answers[q.id];
          return {
            questionId: q.id,
            questionText: q.questionText,
            questionType: q.questionType,
            options: q.options,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation,
            marks: q.marks,
            negativeMarks: q.negativeMarks,
            studentSelectedOptions: ans?.selectedOptions || [],
            studentTextAnswer: ans?.textAnswer || '',
            awardedMarks: ans?.awardedMarks,
            teacherFeedback: ans?.teacherFeedback,
          };
        })
      : [];

  res.json({
    result,
    exam: {
      id: exam.id,
      title: exam.title,
      subject: exam.subject,
      category: exam.category,
      totalMarks: exam.totalMarks,
      passingMarks: exam.passingMarks,
      allowAnswerReview: exam.settings.allowAnswerReview,
    },
    student: student
      ? { id: student.id, name: student.name, email: student.email, rollNumber: student.rollNumber, group: student.group }
      : null,
    canReviewAnswers,
    reviewItems,
  });
});

// Publish all evaluated results for an examination
router.post('/publish/exam/:examId', requireRole('admin', 'teacher'), (req: AuthenticatedRequest, res: Response) => {
  const exam = store.findExamById(req.params.examId);
  if (!exam) {
    res.status(404).json({ error: 'Examination not found.' });
    return;
  }
  if (req.user!.role === 'teacher' && exam.createdBy !== req.user!.id) {
    res.status(403).json({ error: 'You can only publish results for your own examinations.' });
    return;
  }

  const examResults = store.getResults().filter((r) => r.examId === exam.id);
  const pendingCount = examResults.filter((r) => r.resultStatus === 'pending_evaluation').length;
  if (pendingCount > 0) {
    res.status(400).json({
      error: `${pendingCount} submission(s) still require subjective grading before publishing all results.`,
    });
    return;
  }

  const nowIso = new Date().toISOString();
  let publishedNow = 0;

  for (const r of examResults) {
    if (r.resultStatus !== 'published') {
      store.saveResult({
        ...r,
        resultStatus: 'published',
        publishedAt: nowIso,
        updatedAt: nowIso,
      });
      publishedNow++;
      void notifyUser({
        userId: r.studentId,
        title: `Results Published: ${exam.title}`,
        message: `You obtained ${r.obtainedMarks}/${r.totalMarks} (${r.percentage}%).`,
        type: 'result_published',
        link: '/results',
        sendEmail: true,
      });
    }
  }

  store.saveExam({
    ...exam,
    status: 'published',
    updatedAt: nowIso,
  });

  logAudit({
    actor: req.user,
    action: 'EXAM_RESULTS_PUBLISHED',
    resourceType: 'Exam',
    resourceId: exam.id,
    metadata: { publishedNow },
  });

  res.json({ message: `Published ${publishedNow} result(s) for ${exam.title}.`, publishedNow });
});

// Publish a single evaluated result
router.post('/:id/publish', requireRole('admin', 'teacher'), (req: AuthenticatedRequest, res: Response) => {
  const result = store.findResultById(req.params.id);
  if (!result) {
    res.status(404).json({ error: 'Result not found.' });
    return;
  }
  const exam = store.findExamById(result.examId);
  if (!exam) {
    res.status(404).json({ error: 'Examination not found.' });
    return;
  }
  if (req.user!.role === 'teacher' && exam.createdBy !== req.user!.id) {
    res.status(403).json({ error: 'Unauthorized.' });
    return;
  }
  if (result.resultStatus === 'pending_evaluation') {
    res.status(400).json({ error: 'Grade all subjective questions before publishing this result.' });
    return;
  }

  const nowIso = new Date().toISOString();
  const updated = store.saveResult({
    ...result,
    resultStatus: 'published',
    publishedAt: nowIso,
    updatedAt: nowIso,
  });

  void notifyUser({
    userId: result.studentId,
    title: `Result Published: ${exam.title}`,
    message: `Your final score is ${updated.obtainedMarks}/${updated.totalMarks} (${updated.percentage}%).`,
    type: 'result_published',
    link: '/results',
    sendEmail: true,
  });

  res.json({ result: updated });
});

export default router;
