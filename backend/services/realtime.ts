import type { Server as SocketIOServer } from 'socket.io';
import crypto from 'node:crypto';
import { store } from '../repositories/store';
import type { NotificationRecord, NotificationType, UserRole } from '../types';
import { sendEmailNotification } from './email';

let ioInstance: SocketIOServer | null = null;

export function registerSocketIO(io: SocketIOServer): void {
  ioInstance = io;
}

export function emitToUser(userId: string, event: string, payload: unknown): void {
  ioInstance?.to(`user:${userId}`).emit(event, payload);
}

export function emitToRole(role: UserRole, event: string, payload: unknown): void {
  ioInstance?.to(`role:${role}`).emit(event, payload);
}

export async function notifyUser(params: {
  userId: string;
  title: string;
  message: string;
  type: NotificationType;
  link?: string;
  sendEmail?: boolean;
}): Promise<NotificationRecord> {
  const record: NotificationRecord = {
    id: `notif-${crypto.randomUUID().slice(0, 10)}`,
    userId: params.userId,
    title: params.title,
    message: params.message,
    type: params.type,
    link: params.link,
    read: false,
    createdAt: new Date().toISOString(),
  };

  store.saveNotification(record);
  emitToUser(params.userId, 'notification:new', record);

  const settings = store.getSettings();
  if (params.sendEmail && settings?.emailNotificationsEnabled) {
    const user = store.findUserById(params.userId);
    if (user) {
      void sendEmailNotification({
        to: user.email,
        subject: `[ExamVault] ${params.title}`,
        text: params.message,
      });
    }
  }

  return record;
}
