// Sends mail via SMTP when configured. Falls back to writing the message to
// data/outbox/ and logging it in the DB (visible in the admin portal) so the
// whole approval + delivery flow is demonstrable and testable without real
// SMTP credentials on hand.
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const db = require('./db');

const OUTBOX_DIR = path.join(__dirname, '..', 'data', 'outbox');

function isConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
}

async function sendMail({ to, subject, html, text, attachments }) {
  const from = process.env.MAIL_FROM || 'VASUP-Testdata <no-reply@vasup.co.th>';
  const logEntry = {
    to,
    subject,
    sentAt: new Date().toISOString(),
    attachments: (attachments || []).map((a) => a.filename)
  };

  if (!isConfigured()) {
    const safeName = `${Date.now()}-${to.replace(/[^a-z0-9.@-]/gi, '_')}.txt`;
    const filePath = path.join(OUTBOX_DIR, safeName);
    fs.writeFileSync(
      filePath,
      `To: ${to}\nFrom: ${from}\nSubject: ${subject}\n\n${text || ''}\n\n--- HTML ---\n${html || ''}\n`
    );
    db.update((data) => {
      data.emailLog.push({ ...logEntry, status: 'mock-outbox', file: safeName });
    });
    return { mocked: true, file: filePath };
  }

  const transport = getTransport();
  await transport.sendMail({ from, to, subject, html, text, attachments });
  db.update((data) => {
    data.emailLog.push({ ...logEntry, status: 'sent' });
  });
  return { mocked: false };
}

module.exports = { sendMail, isConfigured };
