import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT || 587),
  secure: false,
  auth: process.env.SMTP_USER && process.env.SMTP_PASS ? {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  } : undefined,
});

export const sendResetEmail = async (to, token) => {
  const appBaseUrl = process.env.APP_BASE_URL || 'http://localhost:4000';
  const resetUrl = `${appBaseUrl}/reset-password?token=${token}`;
  const info = await transporter.sendMail({
    from: process.env.MAIL_FROM || 'no-reply@baroni.app',
    to,
    subject: 'Reset your Baroni password',
    html: `<p>Click the link below to reset your password.</p><p><a href="${resetUrl}">Reset Password</a></p>`
  });
  return info.messageId;
};


