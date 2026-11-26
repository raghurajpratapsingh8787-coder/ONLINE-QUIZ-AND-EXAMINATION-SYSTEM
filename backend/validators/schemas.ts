import { z } from 'zod';

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  email: z.string().trim().email('Valid email address required').max(120),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72)
    .regex(/[A-Z]/, 'Include at least one uppercase letter')
    .regex(/[0-9]/, 'Include at least one number'),
  department: z.string().trim().max(80).optional(),
  group: z.string().trim().max(40).optional(),
  rollNumber: z.string().trim().max(40).optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().email('Valid email required'),
  password: z.string().min(1, 'Password is required'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email('Valid email required'),
});

export const resetPasswordSchema = z.object({
  token: z.string().trim().min(10, 'Invalid reset token'),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72)
    .regex(/[A-Z]/, 'Include at least one uppercase letter')
    .regex(/[0-9]/, 'Include at least one number'),
});

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(80),
  department: z.string().trim().max(80).optional(),
  group: z.string().trim().max(40).optional(),
  rollNumber: z.string().trim().max(40).optional(),
  bio: z.string().trim().max(300).optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z
    .string()
    .min(8, 'New password must be at least 8 characters')
    .max(72)
    .regex(/[A-Z]/, 'Include at least one uppercase letter')
    .regex(/[0-9]/, 'Include at least one number'),
});

export const adminCreateUserSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(120),
  password: z.string().min(8).max(72),
  role: z.enum(['admin', 'teacher', 'student']),
  accountStatus: z.enum(['active', 'inactive', 'suspended']).default('active'),
  department: z.string().trim().max(80).optional(),
  group: z.string().trim().max(40).optional(),
  rollNumber: z.string().trim().max(40).optional(),
});

export const adminUpdateUserSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  role: z.enum(['admin', 'teacher', 'student']).optional(),
  accountStatus: z.enum(['active', 'inactive', 'suspended']).optional(),
  department: z.string().trim().max(80).optional(),
  group: z.string().trim().max(40).optional(),
  rollNumber: z.string().trim().max(40).optional(),
});

export const questionSchema = z.object({
  questionText: z.string().trim().min(5, 'Question text is required').max(2000),
  questionType: z.enum(['mcq', 'multi_select', 'true_false', 'short_answer', 'long_answer']),
  subject: z.string().trim().min(2).max(80),
  topic: z.string().trim().max(80).default('General'),
  category: z.string().trim().max(80).default('General'),
  difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
  options: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(32),
        text: z.string().trim().min(1).max(500),
      })
    )
    .default([]),
  correctAnswer: z.union([z.string().trim().min(1), z.array(z.string().trim().min(1)).min(1)]),
  marks: z.number().min(0.5).max(100),
  negativeMarks: z.number().min(0).max(50).default(0),
  explanation: z.string().trim().max(1500).default(''),
  imageUrl: z
    .string()
    .trim()
    .max(400)
    .refine(
      (val) => {
        if (!val) return true;
        if (/^\/api\/questions\/image\/qimg-[a-zA-Z0-9-]+\.(png|jpg|webp|gif)$/.test(val)) return true;
        try {
          const parsed = new URL(val);
          return parsed.protocol === 'https:' || parsed.protocol === 'http:';
        } catch {
          return false;
        }
      },
      { message: 'Image URL must be an uploaded question image or a valid http(s) URL' }
    )
    .optional(),
});

export const bulkImportQuestionsSchema = z.object({
  questions: z.array(questionSchema).min(1).max(100),
});

export const examSchema = z.object({
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(160),
  description: z.string().trim().max(1000).default(''),
  subject: z.string().trim().min(2).max(80),
  category: z.string().trim().min(2).max(80).default('Midterm'),
  assignedGroups: z.array(z.string().trim().min(1)).default([]),
  assignedStudentIds: z.array(z.string().trim().min(1)).default([]),
  questionIds: z.array(z.string().trim().min(1)).min(1, 'Select at least one question'),
  duration: z.number().int().min(5).max(360),
  totalMarks: z.number().min(1).max(1000),
  passingMarks: z.number().min(0).max(1000),
  startTime: z.string().datetime({ offset: true }).or(z.string().min(10)),
  endTime: z.string().datetime({ offset: true }).or(z.string().min(10)),
  instructions: z.string().trim().max(3000).default('Read all questions carefully before answering.'),
  status: z.enum(['draft', 'scheduled', 'active', 'completed', 'published', 'cancelled']).default('scheduled'),
  settings: z.object({
    randomizeQuestions: z.boolean().default(false),
    randomizeOptions: z.boolean().default(false),
    negativeMarking: z.boolean().default(false),
    maxAttempts: z.number().int().min(1).max(10).default(1),
    publishResultsImmediately: z.boolean().default(false),
    allowAnswerReview: z.boolean().default(true),
    tabSwitchMonitoring: z.boolean().default(true),
  }),
});

export const saveAnswerSchema = z.object({
  questionId: z.string().trim().min(1),
  selectedOptions: z.array(z.string().trim()).optional(),
  textAnswer: z.string().max(10000).optional(),
  markedForReview: z.boolean().optional(),
  visited: z.boolean().optional(),
});

export const integritySignalSchema = z.object({
  type: z.enum(['tab_switch', 'window_blur']),
  details: z.string().trim().max(300).optional(),
});

export const evaluateSubjectiveSchema = z.object({
  grades: z.array(
    z.object({
      questionId: z.string().trim().min(1),
      awardedMarks: z.number().min(0).max(100),
      teacherFeedback: z.string().trim().max(1000).optional(),
    })
  ),
  overallFeedback: z.string().trim().max(1500).optional(),
  publishNow: z.boolean().optional(),
});

export const incidentSchema = z.object({
  examId: z.string().trim().optional(),
  studentId: z.string().trim().optional(),
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().min(5).max(2000),
  severity: z.enum(['low', 'medium', 'high']).default('medium'),
});

export const updateIncidentSchema = z.object({
  status: z.enum(['open', 'investigating', 'resolved']),
  resolutionNote: z.string().trim().max(1000).optional(),
});

export const platformSettingsSchema = z.object({
  institutionName: z.string().trim().min(2).max(120),
  supportEmail: z.string().trim().email(),
  ownerName: z.string().trim().min(2).max(80),
  ownerEmail: z.string().trim().email(),
  allowSelfRegistration: z.boolean(),
  defaultExamDuration: z.number().int().min(5).max(360),
  subjects: z.array(z.string().trim().min(1)).min(1),
  categories: z.array(z.string().trim().min(1)).min(1),
  studentGroups: z.array(z.string().trim().min(1)).min(1),
  emailNotificationsEnabled: z.boolean(),
  tabSwitchWarningThreshold: z.number().int().min(1).max(20),
});
