import type {
  AttemptAnswer,
  ExamAttemptRecord,
  ExamRecord,
  QuestionRecord,
  ResultRecord,
  UserRecord,
} from '../types';

export interface EligibilityCheck {
  eligible: boolean;
  reason?: string;
}

/**
 * Pure server-side exam eligibility check using authoritative server timestamp.
 */
export function checkExamEligibility(params: {
  exam: ExamRecord;
  student: UserRecord;
  existingAttempts: ExamAttemptRecord[];
  nowMs: number;
}): EligibilityCheck {
  const { exam, student, existingAttempts, nowMs } = params;

  if (student.role !== 'student') {
    return { eligible: false, reason: 'Only student accounts can attempt examinations.' };
  }
  if (student.accountStatus !== 'active') {
    return { eligible: false, reason: 'Your account is currently inactive.' };
  }
  if (exam.status === 'draft' || exam.status === 'cancelled') {
    return { eligible: false, reason: 'This examination is not open for attempts.' };
  }

  // Group or explicit student assignment check
  const hasGroupRestrictions = exam.assignedGroups.length > 0 || exam.assignedStudentIds.length > 0;
  if (hasGroupRestrictions) {
    const inGroup = Boolean(student.group && exam.assignedGroups.includes(student.group));
    const explicitlyAssigned = exam.assignedStudentIds.includes(student.id);
    if (!inGroup && !explicitlyAssigned) {
      return { eligible: false, reason: 'You are not assigned to this examination.' };
    }
  }

  // If student already has an in_progress attempt, let them resume if within deadline
  const activeAttempt = existingAttempts.find((a) => a.status === 'in_progress');
  if (activeAttempt) {
    const deadlineMs = new Date(activeAttempt.deadline).getTime();
    if (nowMs <= deadlineMs) {
      return { eligible: true };
    }
  }

  const startMs = new Date(exam.startTime).getTime();
  const endMs = new Date(exam.endTime).getTime();

  if (nowMs < startMs) {
    return { eligible: false, reason: 'This examination has not started yet.' };
  }
  if (nowMs > endMs) {
    return { eligible: false, reason: 'This examination window has expired.' };
  }

  const completedAttempts = existingAttempts.filter((a) => a.status !== 'in_progress').length;
  if (completedAttempts >= exam.settings.maxAttempts) {
    return {
      eligible: false,
      reason: `Maximum attempt limit (${exam.settings.maxAttempts}) reached.`,
    };
  }

  return { eligible: true };
}

/**
 * Computes authoritative deadline for an exam attempt (never later than exam endTime).
 */
export function computeAttemptDeadline(startedAtMs: number, durationMinutes: number, examEndTimeIso: string): string {
  const byDuration = startedAtMs + durationMinutes * 60 * 1000;
  const byWindow = new Date(examEndTimeIso).getTime();
  return new Date(Math.min(byDuration, byWindow)).toISOString();
}

/**
 * Fisher-Yates deterministic/standard shuffle helper.
 */
export function shuffleArray<T>(items: T[], rng: () => number = Math.random): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export interface EvaluationSummary {
  totalMarks: number;
  obtainedMarks: number;
  percentage: number;
  correctCount: number;
  incorrectCount: number;
  unattemptedCount: number;
  subjectivePendingCount: number;
  passed: boolean;
}

/**
 * Pure server-side evaluation engine for objective + graded subjective questions.
 * Applies negative marking only when enabled on the exam and question.
 */
export function evaluateExamSubmission(params: {
  exam: ExamRecord;
  questions: QuestionRecord[];
  answers: Record<string, AttemptAnswer>;
}): EvaluationSummary {
  const { exam, questions, answers } = params;

  let totalMarks = 0;
  let obtainedMarks = 0;
  let correctCount = 0;
  let incorrectCount = 0;
  let unattemptedCount = 0;
  let subjectivePendingCount = 0;

  for (const q of questions) {
    totalMarks += q.marks;
    const ans = answers[q.id];

    if (q.questionType === 'mcq' || q.questionType === 'true_false') {
      const selected = ans?.selectedOptions?.[0];
      if (!selected) {
        unattemptedCount++;
        continue;
      }
      const expected = Array.isArray(q.correctAnswer) ? q.correctAnswer[0] : q.correctAnswer;
      if (selected === expected) {
        obtainedMarks += q.marks;
        correctCount++;
      } else {
        incorrectCount++;
        if (exam.settings.negativeMarking && q.negativeMarks > 0) {
          obtainedMarks -= q.negativeMarks;
        }
      }
    } else if (q.questionType === 'multi_select') {
      const selected = [...(ans?.selectedOptions || [])].sort();
      if (selected.length === 0) {
        unattemptedCount++;
        continue;
      }
      const expected = (Array.isArray(q.correctAnswer) ? [...q.correctAnswer] : [q.correctAnswer]).sort();
      const exactMatch =
        selected.length === expected.length && selected.every((val, idx) => val === expected[idx]);

      if (exactMatch) {
        obtainedMarks += q.marks;
        correctCount++;
      } else {
        incorrectCount++;
        if (exam.settings.negativeMarking && q.negativeMarks > 0) {
          obtainedMarks -= q.negativeMarks;
        }
      }
    } else {
      // short_answer or long_answer (subjective)
      const text = (ans?.textAnswer || '').trim();
      if (!text) {
        unattemptedCount++;
        continue;
      }
      if (ans?.isGraded && typeof ans.awardedMarks === 'number') {
        const clamped = Math.max(0, Math.min(q.marks, ans.awardedMarks));
        obtainedMarks += clamped;
        if (clamped >= q.marks * 0.5) {
          correctCount++;
        } else {
          incorrectCount++;
        }
      } else {
        subjectivePendingCount++;
      }
    }
  }

  // Clamp floor at 0 and round cleanly to 2 decimal places
  const normalizedObtained = Math.max(0, Math.round(obtainedMarks * 100) / 100);
  const effectiveTotal = totalMarks > 0 ? totalMarks : exam.totalMarks;
  const percentage =
    effectiveTotal > 0 ? Math.round((normalizedObtained / effectiveTotal) * 10000) / 100 : 0;
  const passed = normalizedObtained >= exam.passingMarks;

  return {
    totalMarks: effectiveTotal,
    obtainedMarks: normalizedObtained,
    percentage,
    correctCount,
    incorrectCount,
    unattemptedCount,
    subjectivePendingCount,
    passed,
  };
}

/**
 * Strips sensitive answer keys & explanations from questions before sending to active exam screen.
 */
export function sanitizeQuestionForStudentExam(question: QuestionRecord, optionOrder?: string[]) {
  let orderedOptions = question.options;
  if (optionOrder && optionOrder.length === question.options.length) {
    const map = new Map(question.options.map((o) => [o.id, o]));
    const reordered = optionOrder.map((id) => map.get(id)).filter(Boolean) as typeof question.options;
    if (reordered.length === question.options.length) {
      orderedOptions = reordered;
    }
  }

  return {
    id: question.id,
    questionText: question.questionText,
    questionType: question.questionType,
    subject: question.subject,
    topic: question.topic,
    difficulty: question.difficulty,
    options: orderedOptions,
    marks: question.marks,
    negativeMarks: question.negativeMarks,
    imageUrl: question.imageUrl,
  };
}

/**
 * Safe CSV cell escaping to prevent CSV formula injection and malformed columns.
 */
export function escapeCsvCell(value: string | number | boolean | null | undefined): string {
  const raw = String(value ?? '');
  const neutralized = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  if (/[",\n\r]/.test(neutralized)) {
    return `"${neutralized.replace(/"/g, '""')}"`;
  }
  return neutralized;
}

export function buildResultsCsv(
  rows: Array<{
    studentName: string;
    studentEmail: string;
    rollNumber: string;
    examTitle: string;
    subject: string;
    result: ResultRecord;
  }>
): string {
  const headers = [
    'Student Name',
    'Student Email',
    'Roll Number',
    'Examination',
    'Subject',
    'Obtained Marks',
    'Total Marks',
    'Percentage (%)',
    'Status',
    'Correct',
    'Incorrect',
    'Unattempted',
    'Time Taken (min)',
    'Published At',
  ];

  const lines = [headers.map(escapeCsvCell).join(',')];
  for (const row of rows) {
    lines.push(
      [
        row.studentName,
        row.studentEmail,
        row.rollNumber || '-',
        row.examTitle,
        row.subject,
        row.result.obtainedMarks,
        row.result.totalMarks,
        row.result.percentage,
        row.result.passed ? 'PASS' : 'FAIL',
        row.result.correctCount,
        row.result.incorrectCount,
        row.result.unattemptedCount,
        Math.round((row.result.timeTakenSeconds / 60) * 10) / 10,
        row.result.publishedAt || 'Pending',
      ]
        .map(escapeCsvCell)
        .join(',')
    );
  }
  return lines.join('\n');
}
