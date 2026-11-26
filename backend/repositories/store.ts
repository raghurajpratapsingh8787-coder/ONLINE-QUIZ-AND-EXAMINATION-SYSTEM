import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { env } from '../config/env';
import {
  AuditLogModel,
  ExamAttemptModel,
  ExamModel,
  IncidentReportModel,
  NotificationModel,
  PlatformSettingsModel,
  QuestionModel,
  RefreshTokenModel,
  ResultModel,
  UserModel,
} from '../models/mongooseModels';
import type {
  AuditLogRecord,
  ExamAttemptRecord,
  ExamRecord,
  IncidentReportRecord,
  NotificationRecord,
  PlatformSettingsRecord,
  QuestionRecord,
  RefreshTokenRecord,
  ResultRecord,
  UserRecord,
} from '../types';

export interface DatabaseState {
  users: UserRecord[];
  exams: ExamRecord[];
  questions: QuestionRecord[];
  attempts: ExamAttemptRecord[];
  results: ResultRecord[];
  notifications: NotificationRecord[];
  auditLogs: AuditLogRecord[];
  incidents: IncidentReportRecord[];
  settings: PlatformSettingsRecord | null;
  refreshTokens: RefreshTokenRecord[];
}

const DATA_DIR = path.resolve(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'examvault-store.json');

const emptyState = (): DatabaseState => ({
  users: [],
  exams: [],
  questions: [],
  attempts: [],
  results: [],
  notifications: [],
  auditLogs: [],
  incidents: [],
  settings: null,
  refreshTokens: [],
});

class DataStore {
  public mode: 'mongodb' | 'local' = 'local';
  private state: DatabaseState = emptyState();
  private initialized = false;
  // Concurrency locks to prevent duplicate simultaneous submissions
  private submissionLocks = new Set<string>();

  async init(): Promise<void> {
    if (this.initialized) return;

    if (env.mongodbUri) {
      try {
        await mongoose.connect(env.mongodbUri, { serverSelectionTimeoutMS: 5000 });
        this.mode = 'mongodb';
        await this.hydrateFromMongo();
        this.initialized = true;
        console.log('[DB] Connected to MongoDB Atlas via Mongoose');
        return;
      } catch (err) {
        console.warn('[DB] MongoDB Atlas connection failed; falling back to local persistent repository:', (err as Error).message);
      }
    }

    this.mode = 'local';
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DATA_FILE)) {
      try {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        const parsed = JSON.parse(raw) as Partial<DatabaseState>;
        this.state = {
          ...emptyState(),
          ...parsed,
        };
      } catch {
        this.state = emptyState();
      }
    }
    this.initialized = true;
  }

  private async hydrateFromMongo(): Promise<void> {
    const [
      users,
      exams,
      questions,
      attempts,
      results,
      notifications,
      auditLogs,
      incidents,
      settingsDoc,
      refreshTokens,
    ] = await Promise.all([
      UserModel.find().lean(),
      ExamModel.find().lean(),
      QuestionModel.find().lean(),
      ExamAttemptModel.find().lean(),
      ResultModel.find().lean(),
      NotificationModel.find().lean(),
      AuditLogModel.find().lean(),
      IncidentReportModel.find().lean(),
      PlatformSettingsModel.findOne().lean(),
      RefreshTokenModel.find().lean(),
    ]);

    const clean = <T>(docs: unknown[]): T[] =>
      docs.map((d) => {
        const obj = { ...(d as Record<string, unknown>) };
        delete obj._id;
        delete obj.__v;
        return obj as T;
      });

    this.state = {
      users: clean<UserRecord>(users),
      exams: clean<ExamRecord>(exams),
      questions: clean<QuestionRecord>(questions),
      attempts: clean<ExamAttemptRecord>(attempts),
      results: clean<ResultRecord>(results),
      notifications: clean<NotificationRecord>(notifications),
      auditLogs: clean<AuditLogRecord>(auditLogs),
      incidents: clean<IncidentReportRecord>(incidents),
      settings: settingsDoc ? clean<PlatformSettingsRecord>([settingsDoc])[0] : null,
      refreshTokens: clean<RefreshTokenRecord>(refreshTokens),
    };
  }

  private persistLocal(): void {
    if (this.mode !== 'local') return;
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tmpFile = `${DATA_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(this.state, null, 2), 'utf-8');
    fs.renameSync(tmpFile, DATA_FILE);
  }

  private syncMongo(op: () => Promise<unknown>): void {
    if (this.mode !== 'mongodb') return;
    op().catch((err) => {
      console.error('[DB] MongoDB sync error:', (err as Error).message);
    });
  }

  acquireLock(key: string): boolean {
    if (this.submissionLocks.has(key)) return false;
    this.submissionLocks.add(key);
    return true;
  }

  releaseLock(key: string): void {
    this.submissionLocks.delete(key);
  }

  get snapshot(): DatabaseState {
    return this.state;
  }

  // ---- Users ----
  getUsers(): UserRecord[] {
    return this.state.users;
  }
  findUserById(id: string): UserRecord | undefined {
    return this.state.users.find((u) => u.id === id);
  }
  findUserByEmail(email: string): UserRecord | undefined {
    const norm = email.trim().toLowerCase();
    return this.state.users.find((u) => u.email.toLowerCase() === norm);
  }
  saveUser(user: UserRecord): UserRecord {
    const idx = this.state.users.findIndex((u) => u.id === user.id);
    if (idx >= 0) this.state.users[idx] = user;
    else this.state.users.push(user);
    this.persistLocal();
    this.syncMongo(() => UserModel.updateOne({ id: user.id }, { $set: user }, { upsert: true }));
    return user;
  }
  deleteUser(id: string): boolean {
    const before = this.state.users.length;
    this.state.users = this.state.users.filter((u) => u.id !== id);
    if (this.state.users.length !== before) {
      this.persistLocal();
      this.syncMongo(() => UserModel.deleteOne({ id }));
      return true;
    }
    return false;
  }

  // ---- Exams ----
  getExams(): ExamRecord[] {
    return this.state.exams;
  }
  findExamById(id: string): ExamRecord | undefined {
    return this.state.exams.find((e) => e.id === id);
  }
  saveExam(exam: ExamRecord): ExamRecord {
    const idx = this.state.exams.findIndex((e) => e.id === exam.id);
    if (idx >= 0) this.state.exams[idx] = exam;
    else this.state.exams.push(exam);
    this.persistLocal();
    this.syncMongo(() => ExamModel.updateOne({ id: exam.id }, { $set: exam }, { upsert: true }));
    return exam;
  }
  deleteExam(id: string): boolean {
    const before = this.state.exams.length;
    this.state.exams = this.state.exams.filter((e) => e.id !== id);
    if (this.state.exams.length !== before) {
      this.persistLocal();
      this.syncMongo(() => ExamModel.deleteOne({ id }));
      return true;
    }
    return false;
  }

  // ---- Questions ----
  getQuestions(): QuestionRecord[] {
    return this.state.questions;
  }
  findQuestionById(id: string): QuestionRecord | undefined {
    return this.state.questions.find((q) => q.id === id);
  }
  saveQuestion(question: QuestionRecord): QuestionRecord {
    const idx = this.state.questions.findIndex((q) => q.id === question.id);
    if (idx >= 0) this.state.questions[idx] = question;
    else this.state.questions.push(question);
    this.persistLocal();
    this.syncMongo(() => QuestionModel.updateOne({ id: question.id }, { $set: question }, { upsert: true }));
    return question;
  }
  deleteQuestion(id: string): boolean {
    const before = this.state.questions.length;
    this.state.questions = this.state.questions.filter((q) => q.id !== id);
    if (this.state.questions.length !== before) {
      this.persistLocal();
      this.syncMongo(() => QuestionModel.deleteOne({ id }));
      return true;
    }
    return false;
  }

  // ---- Attempts ----
  getAttempts(): ExamAttemptRecord[] {
    return this.state.attempts;
  }
  findAttemptById(id: string): ExamAttemptRecord | undefined {
    return this.state.attempts.find((a) => a.id === id);
  }
  saveAttempt(attempt: ExamAttemptRecord): ExamAttemptRecord {
    const idx = this.state.attempts.findIndex((a) => a.id === attempt.id);
    if (idx >= 0) this.state.attempts[idx] = attempt;
    else this.state.attempts.push(attempt);
    this.persistLocal();
    this.syncMongo(() => ExamAttemptModel.updateOne({ id: attempt.id }, { $set: attempt }, { upsert: true }));
    return attempt;
  }

  // ---- Results ----
  getResults(): ResultRecord[] {
    return this.state.results;
  }
  findResultById(id: string): ResultRecord | undefined {
    return this.state.results.find((r) => r.id === id);
  }
  findResultByAttemptId(attemptId: string): ResultRecord | undefined {
    return this.state.results.find((r) => r.attemptId === attemptId);
  }
  saveResult(result: ResultRecord): ResultRecord {
    const idx = this.state.results.findIndex((r) => r.id === result.id);
    if (idx >= 0) this.state.results[idx] = result;
    else this.state.results.push(result);
    this.persistLocal();
    this.syncMongo(() => ResultModel.updateOne({ id: result.id }, { $set: result }, { upsert: true }));
    return result;
  }

  // ---- Notifications ----
  getNotifications(userId?: string): NotificationRecord[] {
    const list = userId
      ? this.state.notifications.filter((n) => n.userId === userId)
      : this.state.notifications;
    return [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  saveNotification(notification: NotificationRecord): NotificationRecord {
    const idx = this.state.notifications.findIndex((n) => n.id === notification.id);
    if (idx >= 0) this.state.notifications[idx] = notification;
    else this.state.notifications.push(notification);
    this.persistLocal();
    this.syncMongo(() =>
      NotificationModel.updateOne({ id: notification.id }, { $set: notification }, { upsert: true })
    );
    return notification;
  }
  markAllNotificationsRead(userId: string): void {
    this.state.notifications.forEach((n) => {
      if (n.userId === userId) n.read = true;
    });
    this.persistLocal();
    this.syncMongo(() => NotificationModel.updateMany({ userId }, { $set: { read: true } }));
  }

  // ---- Audit Logs ----
  getAuditLogs(): AuditLogRecord[] {
    return [...this.state.auditLogs].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }
  addAuditLog(log: AuditLogRecord): AuditLogRecord {
    this.state.auditLogs.push(log);
    if (this.state.auditLogs.length > 1000) {
      this.state.auditLogs = this.state.auditLogs.slice(-1000);
    }
    this.persistLocal();
    this.syncMongo(() => AuditLogModel.create(log));
    return log;
  }

  // ---- Incidents ----
  getIncidents(): IncidentReportRecord[] {
    return [...this.state.incidents].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  saveIncident(incident: IncidentReportRecord): IncidentReportRecord {
    const idx = this.state.incidents.findIndex((i) => i.id === incident.id);
    if (idx >= 0) this.state.incidents[idx] = incident;
    else this.state.incidents.push(incident);
    this.persistLocal();
    this.syncMongo(() =>
      IncidentReportModel.updateOne({ id: incident.id }, { $set: incident }, { upsert: true })
    );
    return incident;
  }

  // ---- Settings ----
  getSettings(): PlatformSettingsRecord | null {
    return this.state.settings;
  }
  saveSettings(settings: PlatformSettingsRecord): PlatformSettingsRecord {
    this.state.settings = settings;
    this.persistLocal();
    this.syncMongo(() =>
      PlatformSettingsModel.updateOne({ id: settings.id }, { $set: settings }, { upsert: true })
    );
    return settings;
  }

  // ---- Refresh Tokens ----
  findRefreshToken(tokenHash: string): RefreshTokenRecord | undefined {
    return this.state.refreshTokens.find((t) => t.tokenHash === tokenHash);
  }
  saveRefreshToken(token: RefreshTokenRecord): void {
    const idx = this.state.refreshTokens.findIndex((t) => t.id === token.id);
    if (idx >= 0) this.state.refreshTokens[idx] = token;
    else this.state.refreshTokens.push(token);
    this.persistLocal();
    this.syncMongo(() =>
      RefreshTokenModel.updateOne({ id: token.id }, { $set: token }, { upsert: true })
    );
  }
  revokeUserRefreshTokens(userId: string): void {
    this.state.refreshTokens.forEach((t) => {
      if (t.userId === userId) t.revoked = true;
    });
    this.persistLocal();
    this.syncMongo(() => RefreshTokenModel.updateMany({ userId }, { $set: { revoked: true } }));
  }

  // ---- Full Replace (used by seed script) ----
  async resetAndSeed(seed: DatabaseState): Promise<void> {
    this.state = seed;
    this.persistLocal();
    if (this.mode === 'mongodb') {
      await Promise.all([
        UserModel.deleteMany({}),
        ExamModel.deleteMany({}),
        QuestionModel.deleteMany({}),
        ExamAttemptModel.deleteMany({}),
        ResultModel.deleteMany({}),
        NotificationModel.deleteMany({}),
        AuditLogModel.deleteMany({}),
        IncidentReportModel.deleteMany({}),
        PlatformSettingsModel.deleteMany({}),
        RefreshTokenModel.deleteMany({}),
      ]);
      if (seed.users.length) await UserModel.insertMany(seed.users);
      if (seed.exams.length) await ExamModel.insertMany(seed.exams);
      if (seed.questions.length) await QuestionModel.insertMany(seed.questions);
      if (seed.attempts.length) await ExamAttemptModel.insertMany(seed.attempts);
      if (seed.results.length) await ResultModel.insertMany(seed.results);
      if (seed.notifications.length) await NotificationModel.insertMany(seed.notifications);
      if (seed.auditLogs.length) await AuditLogModel.insertMany(seed.auditLogs);
      if (seed.incidents.length) await IncidentReportModel.insertMany(seed.incidents);
      if (seed.settings) await PlatformSettingsModel.create(seed.settings);
    }
  }
}

export const store = new DataStore();
