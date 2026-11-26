export type UserRole = 'admin' | 'teacher' | 'student';
export type AccountStatus = 'active' | 'inactive' | 'suspended';

export interface UserRecord {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  accountStatus: AccountStatus;
  emailVerified: boolean;
  department?: string;
  group?: string; // e.g., CS-2026, EE-2026
  rollNumber?: string;
  bio?: string;
  tokenVersion: number;
  passwordResetTokenHash?: string;
  passwordResetExpiresAt?: string;
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

export interface ExamRecord {
  id: string;
  title: string;
  description: string;
  subject: string;
  category: string;
  createdBy: string;
  assignedGroups: string[];
  assignedStudentIds: string[];
  questionIds: string[];
  duration: number; // minutes
  totalMarks: number;
  passingMarks: number;
  startTime: string; // ISO
  endTime: string; // ISO
  instructions: string;
  status: ExamStatus;
  settings: ExamSettings;
  createdAt: string;
  updatedAt: string;
}

export type QuestionType = 'mcq' | 'multi_select' | 'true_false' | 'short_answer' | 'long_answer';
export type DifficultyLevel = 'easy' | 'medium' | 'hard';

export interface QuestionOption {
  id: string;
  text: string;
}

export interface QuestionRecord {
  id: string;
  createdBy: string;
  questionText: string;
  questionType: QuestionType;
  subject: string;
  topic: string;
  category: string;
  difficulty: DifficultyLevel;
  options: QuestionOption[];
  correctAnswer: string | string[]; // optionId(s) or model answer text
  marks: number;
  negativeMarks: number;
  explanation: string;
  imageUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export type AttemptStatus = 'in_progress' | 'submitted' | 'auto_submitted' | 'evaluated';

export interface AttemptAnswer {
  questionId: string;
  selectedOptions?: string[];
  textAnswer?: string;
  markedForReview: boolean;
  visited: boolean;
  updatedAt: string;
  // Teacher subjective grading
  awardedMarks?: number;
  teacherFeedback?: string;
  isGraded?: boolean;
}

export interface IntegritySignal {
  type: 'tab_switch' | 'window_blur' | 'late_submission_attempt' | 'duplicate_submit_blocked';
  timestamp: string;
  details?: string;
}

export interface ExamAttemptRecord {
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
  status: AttemptStatus;
  integritySignals: IntegritySignal[];
  createdAt: string;
  updatedAt: string;
}

export type ResultStatus = 'pending_evaluation' | 'evaluated' | 'published';

export interface ResultRecord {
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
  resultStatus: ResultStatus;
  overallFeedback?: string;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type NotificationType =
  | 'exam_announced'
  | 'exam_reminder'
  | 'exam_starting'
  | 'exam_completed'
  | 'result_published'
  | 'teacher_feedback'
  | 'account_alert';

export interface NotificationRecord {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: NotificationType;
  link?: string;
  read: boolean;
  createdAt: string;
}

export interface AuditLogRecord {
  id: string;
  actorId: string;
  actorEmail: string;
  actorRole: UserRole | 'system';
  action: string;
  resourceType: string;
  resourceId: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface IncidentReportRecord {
  id: string;
  reportedBy: string;
  examId?: string;
  studentId?: string;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  status: 'open' | 'investigating' | 'resolved';
  resolutionNote?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformSettingsRecord {
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

export interface RefreshTokenRecord {
  id: string;
  tokenHash: string;
  userId: string;
  expiresAt: string;
  revoked: boolean;
  createdAt: string;
}
