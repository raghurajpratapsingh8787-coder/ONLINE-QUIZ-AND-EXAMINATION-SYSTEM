export type UserRole = 'admin' | 'teacher' | 'student';
export type AccountStatus = 'active' | 'inactive' | 'suspended';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  accountStatus: AccountStatus;
  emailVerified: boolean;
  department: string;
  group: string;
  rollNumber: string;
  bio: string;
  createdAt: string;
  updatedAt: string;
}

export type ExamStatus = 'draft' | 'scheduled' | 'active' | 'completed' | 'published' | 'cancelled';

export interface ExamSettings {
  randomizeQuestions: boolean;
  randomizeOptions: boolean;
  negativeMarking: boolean;
  maxAttempts: number;
  publishResultsImmediately: boolean;
  allowAnswerReview: boolean;
  tabSwitchMonitoring: boolean;
}

export interface Exam {
  id: string;
  title: string;
  description: string;
  subject: string;
  category: string;
  createdBy: string;
  creatorName?: string;
  assignedGroups: string[];
  assignedStudentIds: string[];
  questionIds: string[];
  questionCount?: number;
  submissionCount?: number;
  duration: number;
  totalMarks: number;
  passingMarks: number;
  startTime: string;
  endTime: string;
  instructions: string;
  status: ExamStatus;
  settings: ExamSettings;
  createdAt: string;
  updatedAt: string;
  eligibility?: { eligible: boolean; reason?: string };
  attemptsUsed?: number;
  inProgressAttemptId?: string | null;
  hasPublishedResult?: boolean;
  publishedResultId?: string | null;
}

export type QuestionType = 'mcq' | 'multi_select' | 'true_false' | 'short_answer' | 'long_answer';
export type DifficultyLevel = 'easy' | 'medium' | 'hard';

export interface QuestionOption {
  id: string;
  text: string;
}

export interface Question {
  id: string;
  createdBy?: string;
  questionText: string;
  questionType: QuestionType;
  subject: string;
  topic: string;
  category?: string;
  difficulty: DifficultyLevel;
  options: QuestionOption[];
  correctAnswer?: string | string[];
  marks: number;
  negativeMarks: number;
  explanation?: string;
  imageUrl?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AttemptAnswer {
  questionId: string;
  selectedOptions?: string[];
  textAnswer?: string;
  markedForReview: boolean;
  visited: boolean;
  updatedAt: string;
  awardedMarks?: number;
  teacherFeedback?: string;
  isGraded?: boolean;
}

export interface ExamAttempt {
  id: string;
  studentId: string;
  examId: string;
  attemptNumber: number;
  questionOrder: string[];
  optionOrders: Record<string, string[]>;
  answers: Record<string, AttemptAnswer>;
  startedAt: string;
  submittedAt?: string;
  deadline: string;
  score: number;
  status: 'in_progress' | 'submitted' | 'auto_submitted' | 'evaluated';
  integritySignals: Array<{ type: string; timestamp: string; details?: string }>;
}

export interface ResultItem {
  id: string;
  studentId: string;
  examId: string;
  attemptId: string;
  totalMarks: number;
  obtainedMarks: number;
  percentage: number;
  correctCount: number;
  incorrectCount: number;
  unattemptedCount: number;
  subjectivePendingCount: number;
  passed: boolean;
  timeTakenSeconds: number;
  resultStatus: 'pending_evaluation' | 'evaluated' | 'published';
  overallFeedback?: string;
  publishedAt?: string;
  createdAt: string;
  examTitle?: string;
  subject?: string;
  category?: string;
  passingMarks?: number;
  allowAnswerReview?: boolean;
  studentName?: string;
  studentEmail?: string;
  rollNumber?: string;
  group?: string;
}

export interface NotificationItem {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: string;
  link?: string;
  read: boolean;
  createdAt: string;
}

export interface PlatformSettings {
  id: string;
  institutionName: string;
  supportEmail: string;
  ownerName: string;
  ownerEmail: string;
  allowSelfRegistration: boolean;
  defaultExamDuration: number;
  subjects: string[];
  categories: string[];
  studentGroups: string[];
  emailNotificationsEnabled: boolean;
  tabSwitchWarningThreshold: number;
  updatedAt: string;
}

export interface IncidentReport {
  id: string;
  reportedBy: string;
  reporterName?: string;
  examId?: string;
  examTitle?: string;
  studentId?: string;
  studentName?: string;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  status: 'open' | 'investigating' | 'resolved';
  resolutionNote?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLogItem {
  id: string;
  actorId: string;
  actorEmail: string;
  actorRole: string;
  action: string;
  resourceType: string;
  resourceId: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}
