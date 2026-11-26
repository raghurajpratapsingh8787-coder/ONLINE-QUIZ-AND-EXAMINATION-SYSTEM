import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env';

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!env.smtp.host || !env.smtp.user || !env.smtp.pass) {
    return null;
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.port === 465,
      auth: {
        user: env.smtp.user,
        pass: env.smtp.pass,
      },
    });
  }
  return transporter;
}

export async function sendEmailNotification(params: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<{ delivered: boolean; mode: 'smtp' | 'simulated' }> {
  const mailer = getTransporter();
  if (!mailer) {
    // Graceful no-op when SMTP credentials are not configured in environment
    return { delivered: false, mode: 'simulated' };
  }
  try {
    await mailer.sendMail({
      from: env.smtp.from,
      to: params.to,
      subject: params.subject,
      text: params.text,
      html: params.html,
    });
    return { delivered: true, mode: 'smtp' };
  } catch (err) {
    console.warn('[Email] SMTP dispatch failed:', (err as Error).message);
    return { delivered: false, mode: 'simulated' };
  }
}
