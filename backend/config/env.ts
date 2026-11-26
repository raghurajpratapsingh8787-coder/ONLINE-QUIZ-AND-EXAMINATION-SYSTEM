import crypto from 'node:crypto';
import dotenv from 'dotenv';

dotenv.config();

// Generate ephemeral cryptographic secrets at runtime if env vars are unset in preview
const runtimeAccessSecret = crypto.randomBytes(32).toString('hex');
const runtimeRefreshSecret = crypto.randomBytes(32).toString('hex');

export const env = {
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  mongodbUri: process.env.MONGODB_URI?.trim() || '',
  jwtSecret: process.env.JWT_SECRET?.trim() || runtimeAccessSecret,
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET?.trim() || runtimeRefreshSecret,
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  smtp: {
    host: process.env.SMTP_HOST?.trim() || '',
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER?.trim() || '',
    pass: process.env.SMTP_PASS?.trim() || '',
    from: process.env.SMTP_FROM?.trim() || 'ExamVault Assessments <no-reply@examvault.edu>',
  },
  demoPasswords: {
    admin: process.env.DEMO_ADMIN_PASSWORD?.trim() || 'Admin@ExamVault2026',
    teacher: process.env.DEMO_TEACHER_PASSWORD?.trim() || 'Teacher@ExamVault2026',
    student: process.env.DEMO_STUDENT_PASSWORD?.trim() || 'Student@ExamVault2026',
  },
};
