import mongoose, { Schema } from 'mongoose';

const UserSchema = new Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['admin', 'teacher', 'student'], required: true, index: true },
    accountStatus: { type: String, enum: ['active', 'inactive', 'suspended'], default: 'active', index: true },
    emailVerified: { type: Boolean, default: true },
    department: { type: String },
    group: { type: String, index: true },
    rollNumber: { type: String },
    bio: { type: String },
    tokenVersion: { type: Number, default: 0 },
    passwordResetTokenHash: { type: String },
    passwordResetExpiresAt: { type: String },
  },
  { timestamps: true }
);

const ExamSchema = new Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    subject: { type: String, required: true, index: true },
    category: { type: String, default: 'General', index: true },
    createdBy: { type: String, required: true, index: true },
    assignedGroups: [{ type: String, index: true }],
    assignedStudentIds: [{ type: String }],
    questionIds: [{ type: String }],
    duration: { type: Number, required: true, min: 1 },
    totalMarks: { type: Number, required: true, min: 1 },
    passingMarks: { type: Number, required: true, min: 0 },
    startTime: { type: String, required: true, index: true },
    endTime: { type: String, required: true, index: true },
    instructions: { type: String, default: '' },
    status: {
      type: String,
      enum: ['draft', 'scheduled', 'active', 'completed', 'published', 'cancelled'],
      default: 'draft',
      index: true,
    },
    settings: {
      randomizeQuestions: { type: Boolean, default: false },
      randomizeOptions: { type: Boolean, default: false },
      negativeMarking: { type: Boolean, default: false },
      maxAttempts: { type: Number, default: 1, min: 1 },
      publishResultsImmediately: { type: Boolean, default: false },
      allowAnswerReview: { type: Boolean, default: true },
      tabSwitchMonitoring: { type: Boolean, default: true },
    },
  },
  { timestamps: true }
);

const QuestionSchema = new Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    createdBy: { type: String, required: true, index: true },
    questionText: { type: String, required: true },
    questionType: {
      type: String,
      enum: ['mcq', 'multi_select', 'true_false', 'short_answer', 'long_answer'],
      required: true,
      index: true,
    },
    subject: { type: String, required: true, index: true },
    topic: { type: String, default: '' },
    category: { type: String, default: 'General' },
    difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium', index: true },
    options: [{ id: String, text: String }],
    correctAnswer: { type: Schema.Types.Mixed, required: true },
    marks: { type: Number, required: true, min: 0.5 },
    negativeMarks: { type: Number, default: 0, min: 0 },
    explanation: { type: String, default: '' },
    imageUrl: { type: String },
  },
  { timestamps: true }
);

const ExamAttemptSchema = new Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    studentId: { type: String, required: true, index: true },
    examId: { type: String, required: true, index: true },
    attemptNumber: { type: Number, required: true, min: 1 },
    questionOrder: [{ type: String }],
    optionOrders: { type: Schema.Types.Mixed, default: {} },
    answers: { type: Schema.Types.Mixed, default: {} },
    startedAt: { type: String, required: true },
    submittedAt: { type: String },
    deadline: { type: String, required: true },
    score: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['in_progress', 'submitted', 'auto_submitted', 'evaluated'],
      default: 'in_progress',
      index: true,
    },
    integritySignals: [
      {
        type: { type: String },
        timestamp: String,
        details: String,
      },
    ],
  },
  { timestamps: true }
);
ExamAttemptSchema.index({ studentId: 1, examId: 1, attemptNumber: 1 }, { unique: true });

const ResultSchema = new Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    studentId: { type: String, required: true, index: true },
    examId: { type: String, required: true, index: true },
    attemptId: { type: String, required: true, unique: true, index: true },
    totalMarks: { type: Number, required: true },
    obtainedMarks: { type: Number, required: true },
    percentage: { type: Number, required: true },
    correctCount: { type: Number, required: true },
    incorrectCount: { type: Number, required: true },
    unattemptedCount: { type: Number, required: true },
    subjectivePendingCount: { type: Number, default: 0 },
    passed: { type: Boolean, required: true },
    timeTakenSeconds: { type: Number, required: true },
    resultStatus: {
      type: String,
      enum: ['pending_evaluation', 'evaluated', 'published'],
      default: 'evaluated',
      index: true,
    },
    overallFeedback: { type: String },
    publishedAt: { type: String },
  },
  { timestamps: true }
);

const NotificationSchema = new Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: { type: String, required: true },
    link: { type: String },
    read: { type: Boolean, default: false, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

const AuditLogSchema = new Schema({
  id: { type: String, required: true, unique: true, index: true },
  actorId: { type: String, required: true, index: true },
  actorEmail: { type: String, required: true },
  actorRole: { type: String, required: true },
  action: { type: String, required: true, index: true },
  resourceType: { type: String, required: true },
  resourceId: { type: String, required: true },
  timestamp: { type: String, required: true, index: true },
  metadata: { type: Schema.Types.Mixed },
});

const IncidentReportSchema = new Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    reportedBy: { type: String, required: true },
    examId: { type: String },
    studentId: { type: String },
    title: { type: String, required: true },
    description: { type: String, required: true },
    severity: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    status: { type: String, enum: ['open', 'investigating', 'resolved'], default: 'open', index: true },
    resolutionNote: { type: String },
  },
  { timestamps: true }
);

const PlatformSettingsSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    institutionName: { type: String, required: true },
    supportEmail: { type: String, required: true },
    ownerName: { type: String, required: true },
    ownerEmail: { type: String, required: true },
    allowSelfRegistration: { type: Boolean, default: true },
    defaultExamDuration: { type: Number, default: 60 },
    subjects: [{ type: String }],
    categories: [{ type: String }],
    studentGroups: [{ type: String }],
    emailNotificationsEnabled: { type: Boolean, default: false },
    tabSwitchWarningThreshold: { type: Number, default: 3 },
  },
  { timestamps: true }
);

const RefreshTokenSchema = new Schema({
  id: { type: String, required: true, unique: true, index: true },
  tokenHash: { type: String, required: true, unique: true, index: true },
  userId: { type: String, required: true, index: true },
  expiresAt: { type: String, required: true },
  revoked: { type: Boolean, default: false, index: true },
  createdAt: { type: String, required: true },
});

export const UserModel = mongoose.models.User || mongoose.model('User', UserSchema);
export const ExamModel = mongoose.models.Exam || mongoose.model('Exam', ExamSchema);
export const QuestionModel = mongoose.models.Question || mongoose.model('Question', QuestionSchema);
export const ExamAttemptModel = mongoose.models.ExamAttempt || mongoose.model('ExamAttempt', ExamAttemptSchema);
export const ResultModel = mongoose.models.Result || mongoose.model('Result', ResultSchema);
export const NotificationModel = mongoose.models.Notification || mongoose.model('Notification', NotificationSchema);
export const AuditLogModel = mongoose.models.AuditLog || mongoose.model('AuditLog', AuditLogSchema);
export const IncidentReportModel = mongoose.models.IncidentReport || mongoose.model('IncidentReport', IncidentReportSchema);
export const PlatformSettingsModel = mongoose.models.PlatformSettings || mongoose.model('PlatformSettings', PlatformSettingsSchema);
export const RefreshTokenModel = mongoose.models.RefreshToken || mongoose.model('RefreshToken', RefreshTokenSchema);
