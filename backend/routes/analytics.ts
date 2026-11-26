import { Router, type Response } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { store } from '../repositories/store';

const router = Router();
router.use(requireAuth);

router.get('/dashboard', (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const nowMs = Date.now();
  const users = store.getUsers();
  const exams = store.getExams();
  const questions = store.getQuestions();
  const attempts = store.getAttempts();
  const results = store.getResults();

  const resolveStatus = (e: (typeof exams)[number]) => {
    if (e.status === 'draft' || e.status === 'cancelled' || e.status === 'published') return e.status;
    const s = new Date(e.startTime).getTime();
    const en = new Date(e.endTime).getTime();
    if (nowMs < s) return 'scheduled';
    if (nowMs <= en) return 'active';
    return 'completed';
  };

  if (user.role === 'admin') {
    const students = users.filter((u) => u.role === 'student');
    const teachers = users.filter((u) => u.role === 'teacher');

    const examStatuses = exams.map((e) => ({ ...e, effectiveStatus: resolveStatus(e) }));
    const activeExams = examStatuses.filter((e) => e.effectiveStatus === 'active').length;
    const upcomingExams = examStatuses.filter((e) => e.effectiveStatus === 'scheduled').length;
    const completedExams = examStatuses.filter(
      (e) => e.effectiveStatus === 'completed' || e.effectiveStatus === 'published'
    ).length;

    const evaluatedResults = results.filter((r) => r.resultStatus !== 'pending_evaluation');
    const avgScore =
      evaluatedResults.length > 0
        ? Math.round(
            (evaluatedResults.reduce((sum, r) => sum + r.percentage, 0) / evaluatedResults.length) * 10
          ) / 10
        : 0;

    // Student registration growth grouped by month (computed directly from user.createdAt)
    const monthBuckets = new Map<string, number>();
    const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', year: '2-digit' });
    const sortedStudents = [...students].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    let runningTotal = 0;
    for (const s of sortedStudents) {
      const label = monthFormatter.format(new Date(s.createdAt));
      runningTotal++;
      monthBuckets.set(label, runningTotal);
    }
    const registrationGrowth = Array.from(monthBuckets.entries()).map(([month, totalStudents]) => ({
      month,
      totalStudents,
    }));

    // Exam participation & average marks per exam
    const participationData = examStatuses.map((exam) => {
      const examAttempts = attempts.filter((a) => a.examId === exam.id && a.status !== 'in_progress');
      const examResults = results.filter((r) => r.examId === exam.id);
      const examAvg =
        examResults.length > 0
          ? Math.round(
              (examResults.reduce((sum, r) => sum + r.percentage, 0) / examResults.length) * 10
            ) / 10
          : 0;
      const shortCode = exam.title.includes(':')
        ? exam.title.split(':')[0].trim()
        : exam.title.length > 14
        ? `${exam.title.slice(0, 14)}…`
        : exam.title;
      return {
        exam: shortCode,
        fullTitle: exam.title,
        participants: examAttempts.length,
        avgScore: examAvg,
      };
    });

    // Pass vs Fail distribution
    const passedCount = evaluatedResults.filter((r) => r.passed).length;
    const failedCount = evaluatedResults.filter((r) => !r.passed).length;
    const passFailData = [
      { name: 'Passed', value: passedCount },
      { name: 'Failed', value: failedCount },
    ];

    // Subject-wise performance
    const examsMap = new Map(exams.map((e) => [e.id, e]));
    const subjectAgg = new Map<string, { totalPct: number; count: number; passed: number }>();
    for (const r of evaluatedResults) {
      const subj = examsMap.get(r.examId)?.subject || 'General';
      const prev = subjectAgg.get(subj) || { totalPct: 0, count: 0, passed: 0 };
      prev.totalPct += r.percentage;
      prev.count += 1;
      if (r.passed) prev.passed += 1;
      subjectAgg.set(subj, prev);
    }
    const subjectPerformance = Array.from(subjectAgg.entries()).map(([subject, stat]) => ({
      subject,
      averagePercentage: Math.round((stat.totalPct / stat.count) * 10) / 10,
      passRate: Math.round((stat.passed / stat.count) * 100),
      submissions: stat.count,
    }));

    const recentActivity = store.getAuditLogs().slice(0, 10);

    res.json({
      role: 'admin',
      stats: {
        totalStudents: students.length,
        totalTeachers: teachers.length,
        totalExams: exams.length,
        activeExams,
        upcomingExams,
        completedExams,
        totalQuestions: questions.length,
        averageStudentScore: avgScore,
        openIncidents: store.getIncidents().filter((i) => i.status !== 'resolved').length,
      },
      charts: {
        registrationGrowth,
        participationData,
        passFailData,
        subjectPerformance,
      },
      recentActivity,
    });
    return;
  }

  if (user.role === 'teacher') {
    const ownedExams = exams.filter((e) => e.createdBy === user.id);
    const ownedExamIds = new Set(ownedExams.map((e) => e.id));
    const ownedAttempts = attempts.filter((a) => ownedExamIds.has(a.examId) && a.status !== 'in_progress');
    const ownedResults = results.filter((r) => ownedExamIds.has(r.examId));
    const uniqueParticipants = new Set(ownedAttempts.map((a) => a.studentId)).size;
    const pendingEvaluations = ownedResults.filter((r) => r.resultStatus === 'pending_evaluation').length;
    const publishedResults = ownedResults.filter((r) => r.resultStatus === 'published').length;
    const graded = ownedResults.filter((r) => r.resultStatus !== 'pending_evaluation');
    const avgPerformance =
      graded.length > 0
        ? Math.round((graded.reduce((s, r) => s + r.percentage, 0) / graded.length) * 10) / 10
        : 0;

    const examBreakdown = ownedExams.map((e) => {
      const er = ownedResults.filter((r) => r.examId === e.id);
      const avg = er.length ? Math.round((er.reduce((s, r) => s + r.percentage, 0) / er.length) * 10) / 10 : 0;
      return {
        examId: e.id,
        title: e.title.length > 24 ? `${e.title.slice(0, 24)}…` : e.title,
        submissions: er.length,
        averagePercentage: avg,
        status: resolveStatus(e),
      };
    });

    res.json({
      role: 'teacher',
      stats: {
        createdExams: ownedExams.length,
        totalParticipants: uniqueParticipants,
        pendingEvaluations,
        publishedResults,
        averageStudentPerformance: avgPerformance,
        totalQuestions: questions.filter((q) => q.createdBy === user.id).length,
      },
      charts: {
        examBreakdown,
      },
    });
    return;
  }

  // Student dashboard analytics
  const eligibleExams = exams
    .filter((e) => {
      if (e.status === 'draft' || e.status === 'cancelled') return false;
      const restricted = e.assignedGroups.length > 0 || e.assignedStudentIds.length > 0;
      if (!restricted) return true;
      return Boolean(
        (user.group && e.assignedGroups.includes(user.group)) || e.assignedStudentIds.includes(user.id)
      );
    })
    .map((e) => ({ ...e, effectiveStatus: resolveStatus(e) }));

  const myAttempts = attempts.filter((a) => a.studentId === user.id);
  const myPublishedResults = results.filter(
    (r) => r.studentId === user.id && r.resultStatus === 'published'
  );
  const avgPercentage =
    myPublishedResults.length > 0
      ? Math.round(
          (myPublishedResults.reduce((s, r) => s + r.percentage, 0) / myPublishedResults.length) * 10
        ) / 10
      : 0;

  const examsMap = new Map(exams.map((e) => [e.id, e]));
  const performanceHistory = myPublishedResults
    .sort((a, b) => (a.publishedAt || a.createdAt).localeCompare(b.publishedAt || b.createdAt))
    .map((r) => ({
      exam: (examsMap.get(r.examId)?.title || 'Exam').slice(0, 22),
      percentage: r.percentage,
      obtained: r.obtainedMarks,
      total: r.totalMarks,
    }));

  res.json({
    role: 'student',
    stats: {
      activeExams: eligibleExams.filter((e) => e.effectiveStatus === 'active').length,
      upcomingExams: eligibleExams.filter((e) => e.effectiveStatus === 'scheduled').length,
      completedAttempts: myAttempts.filter((a) => a.status !== 'in_progress').length,
      publishedResults: myPublishedResults.length,
      averagePercentage: avgPercentage,
      passedCount: myPublishedResults.filter((r) => r.passed).length,
    },
    charts: {
      performanceHistory,
    },
  });
});

export default router;
