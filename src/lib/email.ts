import type { Env } from '../types/bindings';

interface SendEmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

async function sendWithResend(env: Env, options: SendEmailOptions) {
  if (!env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY is not configured; skipping email send');
    return;
  }

  const from = env.EMAIL_FROM_ADDRESS ?? 'no-reply@filmweekly.example';

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html ?? undefined,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '<no-response>');
    console.error('Failed to send email via Resend', response.status, errorText);
  }
}

export async function sendOtpEmail(env: Env, to: string, code: string) {
  const subject = 'Your FilmWeekly admin verification code';
  const text = `Your verification code is ${code}. It expires in 5 minutes.`;
  const html = `<p>Your verification code is <strong>${code}</strong>. It expires in 5 minutes.</p>`;

  await sendWithResend(env, { to, subject, text, html });
}
