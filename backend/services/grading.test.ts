import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildResultsCsv,
  checkExamEligibility,
  computeAttemptDeadline,
  escapeCsvCell,
  evaluateExamSubmission,
  sanitizeQuestionForStudentExam,
} from './grading';
import type { ExamAttemptRecord, ExamRecord, QuestionRecord, UserRecord } from '../types';

const baseStudent: UserRecord = {
  id: 'stu-1',
  name: 'Aarav Sharma',
  email: 'aarav@examvault.edu',
  passwordHash: 'hash',
  role: 'student',
  accountStatus: 'active',
  emailVerified: true,
  group: 'CS-2026',
  tokenVersion: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const baseExam: ExamRecord = {
  id: 'exam-1',
  title: 'Algorithms Midterm',
  description: 'Core algorithms',
  subject: 'Computer Science',
  category: 'Midterm',
  createdBy: 'teach-1',
  assignedGroups: ['CS-2026'],
  assignedStudentIds: [],
  questionIds: ['q1', 'q2', 'q3', 'q4'],
  duration: 45,
  totalMarks: 20,
  passingMarks: 10,
  startTime: '2026-11-26T08:00:00.000Z',
  endTime: '2026-11-26T12:00:00.000Z',
  instructions: 'No external help.',
  status: 'active',
  settings: {
    randomizeQuestions: true,
    randomizeOptions: true,
    negativeMarking: true,
    maxAttempts: 1,
    publishResultsImmediately: false,
    allowAnswerReview: true,
    tabSwitchMonitoring: true,
  },
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
};

const sampleQuestions: QuestionRecord[] = [
  {
    id: 'q1',
    createdBy: 'teach-1',
    questionText: 'What is the time complexity of binary search?',
    questionType: 'mcq',
    subject: 'Computer Science',
    topic: 'Searching',
    category: 'Algorithms',
    difficulty: 'easy',
    options: [
      { id: 'a', text: 'O(log n)' },
      { id: 'b', text: 'O(n)' },
    ],
    correctAnswer: 'a',
    marks: 4,
    negativeMarks: 1,
    explanation: 'Divides search space in half each step.',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'q2',
    createdBy: 'teach-1',
    questionText: 'Select all stable sorting algorithms.',
    questionType: 'multi_select',
    subject: 'Computer Science',
    topic: 'Sorting',
    category: 'Algorithms',
    difficulty: 'medium',
    options: [
      { id: 'a', text: 'Merge Sort' },
      { id: 'b', text: 'Quick Sort' },
      { id: 'c', text: 'Insertion Sort' },
    ],
    correctAnswer: ['a', 'c'],
    marks: 6,
    negativeMarks: 2,
    explanation: 'Merge sort and insertion sort preserve relative order.',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'q3',
    createdBy: 'teach-1',
    questionText: 'Dijkstra works with negative edge weights.',
    questionType: 'true_false',
    subject: 'Computer Science',
    topic: 'Graphs',
    category: 'Algorithms',
    difficulty: 'easy',
    options: [
      { id: 'true', text: 'True' },
      { id: 'false', text: 'False' },
    ],
    correctAnswer: 'false',
    marks: 2,
    negativeMarks: 0.5,
    explanation: 'Use Bellman-Ford for negative edges.',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'q4',
    createdBy: 'teach-1',
    questionText: 'Explain dynamic programming memoization.',
    questionType: 'long_answer',
    subject: 'Computer Science',
    topic: 'DP',
    category: 'Algorithms',
    difficulty: 'hard',
    options: [],
    correctAnswer: 'Caching overlapping subproblems.',
    marks: 8,
    negativeMarks: 0,
    explanation: 'Top-down DP stores subproblem results.',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

test('checkExamEligibility blocks before start, after end, wrong group, and exceeded attempts', () => {
  const beforeStart = new Date('2026-11-26T07:59:00.000Z').getTime();
  assert.equal(
    checkExamEligibility({ exam: baseExam, student: baseStudent, existingAttempts: [], nowMs: beforeStart }).eligible,
    false
  );

  const duringWindow = new Date('2026-11-26T09:00:00.000Z').getTime();
  assert.equal(
    checkExamEligibility({ exam: baseExam, student: baseStudent, existingAttempts: [], nowMs: duringWindow }).eligible,
    true
  );

  const afterEnd = new Date('2026-11-26T12:01:00.000Z').getTime();
  assert.equal(
    checkExamEligibility({ exam: baseExam, student: baseStudent, existingAttempts: [], nowMs: afterEnd }).eligible,
    false
  );

  const wrongGroupStudent: UserRecord = { ...baseStudent, group: 'EE-2026' };
  assert.equal(
    checkExamEligibility({ exam: baseExam, student: wrongGroupStudent, existingAttempts: [], nowMs: duringWindow }).eligible,
    false
  );

  const submittedAttempt: ExamAttemptRecord = {
    id: 'att-1',
    studentId: 'stu-1',
    examId: 'exam-1',
    attemptNumber: 1,
    questionOrder: ['q1'],
    optionOrders: {},
    answers: {},
    startedAt: '2026-11-26T08:10:00.000Z',
    submittedAt: '2026-11-26T08:40:00.000Z',
    deadline: '2026-11-26T08:55:00.000Z',
    score: 10,
    status: 'submitted',
    integritySignals: [],
    createdAt: '2026-11-26T08:10:00.000Z',
    updatedAt: '2026-11-26T08:40:00.000Z',
  };
  assert.equal(
    checkExamEligibility({
      exam: baseExam,
      student: baseStudent,
      existingAttempts: [submittedAttempt],
      nowMs: duringWindow,
    }).eligible,
    false
  );
});

test('computeAttemptDeadline caps duration by exam endTime', () => {
  const started = new Date('2026-11-26T11:40:00.000Z').getTime();
  const deadline = computeAttemptDeadline(started, 45, '2026-11-26T12:00:00.000Z');
  assert.equal(deadline, '2026-11-26T12:00:00.000Z');
});

test('evaluateExamSubmission handles MCQ, multi-select, negative marking, and pending subjective answers', () => {
  const result = evaluateExamSubmission({
    exam: baseExam,
    questions: sampleQuestions,
    answers: {
      q1: { questionId: 'q1', selectedOptions: ['a'], markedForReview: false, visited: true, updatedAt: '' }, // +4
      q2: { questionId: 'q2', selectedOptions: ['c', 'a'], markedForReview: false, visited: true, updatedAt: '' }, // +6 (order-independent)
      q3: { questionId: 'q3', selectedOptions: ['true'], markedForReview: false, visited: true, updatedAt: '' }, // -0.5
      q4: { questionId: 'q4', textAnswer: 'Memoization caches calls.', markedForReview: false, visited: true, updatedAt: '' }, // pending
    },
  });

  assert.equal(result.totalMarks, 20);
  assert.equal(result.obtainedMarks, 9.5);
  assert.equal(result.correctCount, 2);
  assert.equal(result.incorrectCount, 1);
  assert.equal(result.unattemptedCount, 0);
  assert.equal(result.subjectivePendingCount, 1);
  assert.equal(result.passed, false);

  // After teacher grades q4 with 6/8
  const graded = evaluateExamSubmission({
    exam: baseExam,
    questions: sampleQuestions,
    answers: {
      q1: { questionId: 'q1', selectedOptions: ['a'], markedForReview: false, visited: true, updatedAt: '' },
      q2: { questionId: 'q2', selectedOptions: ['a', 'c'], markedForReview: false, visited: true, updatedAt: '' },
      q3: { questionId: 'q3', selectedOptions: ['true'], markedForReview: false, visited: true, updatedAt: '' },
      q4: {
        questionId: 'q4',
        textAnswer: 'Memoization caches calls.',
        markedForReview: false,
        visited: true,
        updatedAt: '',
        isGraded: true,
        awardedMarks: 6,
      },
    },
  });

  assert.equal(graded.obtainedMarks, 15.5);
  assert.equal(graded.percentage, 77.5);
  assert.equal(graded.subjectivePendingCount, 0);
  assert.equal(graded.passed, true);
});

test('sanitizeQuestionForStudentExam never leaks correctAnswer or explanation', () => {
  const sanitized = sanitizeQuestionForStudentExam(sampleQuestions[0], ['b', 'a']) as Record<string, unknown>;
  assert.equal('correctAnswer' in sanitized, false);
  assert.equal('explanation' in sanitized, false);
  assert.deepEqual((sanitized.options as Array<{ id: string }>).map((o) => o.id), ['b', 'a']);
});

test('escapeCsvCell neutralizes formula injection and buildResultsCsv formats properly', () => {
  assert.equal(escapeCsvCell('=CMD()'), "'=CMD()");
  const csv = buildResultsCsv([
    {
      studentName: 'Aarav, Jr.',
      studentEmail: 'aarav@examvault.edu',
      rollNumber: 'CS101',
      examTitle: 'Midterm',
      subject: 'CS',
      result: {
        id: 'r1',
        studentId: 'stu-1',
        examId: 'exam-1',
        attemptId: 'att-1',
        totalMarks: 20,
        obtainedMarks: 16,
        percentage: 80,
        correctCount: 3,
        incorrectCount: 1,
        unattemptedCount: 0,
        subjectivePendingCount: 0,
        passed: true,
        timeTakenSeconds: 1800,
        resultStatus: 'published',
        publishedAt: '2026-11-26T10:00:00.000Z',
        createdAt: '2026-11-26T10:00:00.000Z',
        updatedAt: '2026-11-26T10:00:00.000Z',
      },
    },
  ]);
  assert.ok(csv.includes('"Aarav, Jr."'));
  assert.ok(csv.includes('PASS'));
});

test('sanitizeObject strips nested MongoDB operators and prototype pollution keys', async () => {
  const { sanitizeObject } = await import('../middleware/security');
  const malicious = JSON.parse(
    '{"email":{"$ne":""},"safe":"ok","__proto__":{"isAdmin":true},"nested":{"constructor":{"x":1},"a.b":2,"valid":3}}'
  );
  const cleaned = sanitizeObject(malicious) as Record<string, unknown>;
  assert.deepEqual(cleaned.email, {});
  assert.equal(cleaned.safe, 'ok');
  assert.equal(Object.prototype.hasOwnProperty.call(cleaned, '__proto__'), false);
  assert.deepEqual(cleaned.nested, { valid: 3 });
});

test('questionSchema blocks javascript: and data: imageUrl schemes while allowing safe uploaded paths', async () => {
  const { questionSchema } = await import('../validators/schemas');
  const basePayload = {
    questionText: 'Which data structure uses LIFO ordering?',
    questionType: 'mcq' as const,
    subject: 'Computer Science',
    options: [
      { id: 'a', text: 'Stack' },
      { id: 'b', text: 'Queue' },
    ],
    correctAnswer: 'a',
    marks: 2,
  };

  assert.throws(() =>
    questionSchema.parse({ ...basePayload, imageUrl: 'javascript:alert(1)' })
  );
  assert.throws(() =>
    questionSchema.parse({ ...basePayload, imageUrl: 'data:text/html,<script>alert(1)</script>' })
  );
  assert.doesNotThrow(() =>
    questionSchema.parse({
      ...basePayload,
      imageUrl: '/api/questions/image/qimg-123e4567-e89b-12d3-a456-426614174000.png',
    })
  );
  assert.doesNotThrow(() =>
    questionSchema.parse({
      ...basePayload,
      imageUrl: 'https://cdn.examvault.edu/diagrams/stack.png',
    })
  );
});

