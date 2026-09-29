const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const db = require('../db');
const mailer = require('../mailer');

const router = express.Router();

const VASUP_EMAIL_RE = /^[a-zA-Z0-9._%+-]+@vasup\.co\.th$/i;

function baseUrl() {
  return process.env.APP_BASE_URL || 'http://localhost:3000';
}

function makeToken(data, type, payload, ttlHours = 72) {
  const token = uuid();
  data.actionTokens.push({
    token,
    type, // 'approve-reject' | 'reset-password'
    payload,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + ttlHours * 3600 * 1000).toISOString(),
    used: false
  });
  return token;
}

function consumeToken(data, token, type) {
  const entry = data.actionTokens.find((t) => t.token === token && t.type === type && !t.used);
  if (!entry) return null;
  if (new Date(entry.expiresAt) < new Date()) return null;
  entry.used = true;
  return entry;
}

// ---------- Login ----------
router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/portal');
  res.render('login', { error: null, notice: req.query.notice || null });
});

router.post('/login', (req, res) => {
  const { identifier, password } = req.body;
  const data = db.load();
  const idLower = (identifier || '').trim().toLowerCase();

  const user = data.users.find((u) => {
    if (u.hardcoded) return u.username.toLowerCase() === idLower;
    return u.email.toLowerCase() === idLower;
  });

  if (!user || !bcrypt.compareSync(password || '', user.passwordHash || '')) {
    return res.render('login', { error: 'Invalid username/email or password.', notice: null });
  }
  if (user.status === 'banned') {
    return res.render('login', { error: 'This account has been banned. Contact your VASUP-Testdata admin.', notice: null });
  }
  if (user.status === 'pending') {
    return res.render('login', { error: 'Your registration is still awaiting approval.', notice: null });
  }
  if (user.status === 'rejected') {
    return res.render('login', { error: 'Your registration was not approved. Contact the admin for details.', notice: null });
  }

  req.session.user = {
    id: user.id,
    email: user.email,
    username: user.username || user.email,
    name: user.name,
    role: user.role
  };

  if (user.mustResetPassword) return res.redirect('/reset-password/force');
  res.redirect('/portal');
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// ---------- Registration ----------
router.get('/register', (req, res) => {
  res.render('register', { error: null });
});

router.post('/register', (req, res) => {
  const { name, email, position, reason } = req.body;
  if (!name || !email) return res.render('register', { error: 'Name and email are required.' });
  if (!VASUP_EMAIL_RE.test(email)) {
    return res.render('register', { error: 'Registration email must be a @vasup.co.th address.' });
  }

  const data = db.load();
  const exists = data.users.find((u) => !u.hardcoded && u.email.toLowerCase() === email.toLowerCase());
  if (exists) {
    return res.render('register', { error: 'An account with this email already exists or is pending approval.' });
  }

  const userId = uuid();
  db.update((d) => {
    d.users.push({
      id: userId,
      email,
      name,
      position: position || 'Jr',
      reason: reason || '',
      role: 'tester',
      status: 'pending',
      mustResetPassword: false,
      passwordHash: null,
      createdAt: new Date().toISOString()
    });
  });

  db.update((d) => {
    const token = makeToken(d, 'approve-reject', { userId });
    const reviewUrl = `${baseUrl()}/admin/review/${token}`;
    mailer.sendMail({
      to: process.env.SADMIN_EMAIL || 'wisanu.a@vasup.co.th',
      subject: `[VASUP-Testdata] New registration awaiting approval: ${name}`,
      text: `${name} (${email}) has requested access to VASUP-Testdata.\nPosition: ${position || 'Jr'}\nReason: ${reason || '-'}\n\nReview and approve/reject: ${reviewUrl}`,
      html: `<p><b>${escapeHtml(name)}</b> (${escapeHtml(email)}) has requested access to VASUP-Testdata.</p>
             <p>Position: ${escapeHtml(position || 'Jr')}<br/>Reason: ${escapeHtml(reason || '-')}</p>
             <p><a href="${reviewUrl}">Review &amp; approve / reject this request</a></p>`
    }).catch(() => {});
  });

  res.render('pending', { name, email });
});

// ---------- Approval review (from email link) ----------
router.get('/admin/review/:token', (req, res) => {
  const data = db.load();
  const entry = data.actionTokens.find((t) => t.token === req.params.token && t.type === 'approve-reject');
  if (!entry) return res.status(404).render('error', { message: 'This review link is invalid or has already been used.' });
  const user = data.users.find((u) => u.id === entry.payload.userId);
  if (!user) return res.status(404).render('error', { message: 'Registration not found.' });
  res.render('review', { token: req.params.token, candidate: user, used: entry.used });
});

router.post('/admin/review/:token', async (req, res) => {
  const { decision } = req.body; // 'approve' | 'reject'
  const data = db.load();
  const entry = consumeToken(data, req.params.token, 'approve-reject');
  if (!entry) {
    db.save(data);
    return res.status(400).render('error', { message: 'This review link is invalid, expired, or already used.' });
  }
  const user = data.users.find((u) => u.id === entry.payload.userId);
  if (!user) {
    db.save(data);
    return res.status(404).render('error', { message: 'Registration not found.' });
  }

  if (decision === 'approve') {
    const tempPassword = generateTempPassword();
    user.passwordHash = bcrypt.hashSync(tempPassword, 10);
    user.status = 'approved';
    user.mustResetPassword = true;
    user.approvedAt = new Date().toISOString();

    const resetToken = makeToken(data, 'reset-password', { userId: user.id }, 168);
    db.save(data);

    await mailer.sendMail({
      to: user.email,
      subject: '[VASUP-Testdata] Your account has been approved - login credentials',
      text: `Hi ${user.name},\n\nYour VASUP-Testdata account has been approved.\nUsername (email): ${user.email}\nTemporary password: ${tempPassword}\n\nLogin at: ${baseUrl()}/login`,
      html: `<p>Hi ${escapeHtml(user.name)},</p><p>Your VASUP-Testdata account has been approved.</p>
             <p>Username (email): <b>${escapeHtml(user.email)}</b><br/>Temporary password: <b>${escapeHtml(tempPassword)}</b></p>
             <p><a href="${baseUrl()}/login">Login here</a></p>`
    });

    const resetUrl = `${baseUrl()}/reset-password/${resetToken}`;
    await mailer.sendMail({
      to: user.email,
      subject: '[VASUP-Testdata] Confirm your account & set your own password',
      text: `Your VASUP-Testdata registration is confirmed. For security, please set your own password here: ${resetUrl}\nThis link expires in 7 days.`,
      html: `<p>Your VASUP-Testdata registration is confirmed.</p>
             <p>For security, please set your own password: <a href="${resetUrl}">${resetUrl}</a></p>
             <p>This link expires in 7 days.</p>`
    });
  } else {
    user.status = 'rejected';
    db.save(data);
    await mailer.sendMail({
      to: user.email,
      subject: '[VASUP-Testdata] Registration not approved',
      text: `Hi ${user.name},\n\nYour VASUP-Testdata registration was not approved. Please contact the admin (${process.env.SADMIN_EMAIL || 'wisanu.a@vasup.co.th'}) for details.`
    });
  }

  res.render('review-done', { decision });
});

// ---------- Forgot / reset password ----------
router.get('/forgot-password', (req, res) => res.render('forgot-password', { sent: false, error: null }));

router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  const data = db.load();
  const user = data.users.find((u) => !u.hardcoded && u.email.toLowerCase() === (email || '').toLowerCase() && u.status === 'approved');
  if (user) {
    let token;
    db.update((d) => {
      token = makeToken(d, 'reset-password', { userId: user.id }, 24);
    });
    const resetUrl = `${baseUrl()}/reset-password/${token}`;
    await mailer.sendMail({
      to: user.email,
      subject: '[VASUP-Testdata] Password reset requested',
      text: `Reset your password here: ${resetUrl}\nThis link expires in 24 hours. If you did not request this, ignore this email.`
    });
  }
  // Always show the same response, whether or not the email matched, to avoid leaking account existence.
  res.render('forgot-password', { sent: true, error: null });
});

router.get('/reset-password/force', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  res.render('reset-password', { token: null, force: true, error: null });
});

router.get('/reset-password/:token', (req, res) => {
  const data = db.load();
  const entry = data.actionTokens.find((t) => t.token === req.params.token && t.type === 'reset-password' && !t.used);
  if (!entry || new Date(entry.expiresAt) < new Date()) {
    return res.status(400).render('error', { message: 'This password reset link is invalid or has expired.' });
  }
  res.render('reset-password', { token: req.params.token, force: false, error: null });
});

router.post('/reset-password/:token', (req, res) => {
  const { password, confirm } = req.body;
  const isForce = req.params.token === 'force';

  if (!password || password.length < 8) {
    return res.render('reset-password', { token: req.params.token, force: isForce, error: 'Password must be at least 8 characters.' });
  }
  if (password !== confirm) {
    return res.render('reset-password', { token: req.params.token, force: isForce, error: 'Passwords do not match.' });
  }

  const data = db.load();
  let userId;

  if (isForce) {
    if (!req.session.user) return res.redirect('/login');
    userId = req.session.user.id;
  } else {
    const entry = consumeToken(data, req.params.token, 'reset-password');
    if (!entry) {
      db.save(data);
      return res.status(400).render('error', { message: 'This password reset link is invalid, expired, or already used.' });
    }
    userId = entry.payload.userId;
  }

  const user = data.users.find((u) => u.id === userId);
  if (!user) return res.status(404).render('error', { message: 'Account not found.' });
  user.passwordHash = bcrypt.hashSync(password, 10);
  user.mustResetPassword = false;
  db.save(data);

  if (isForce) return res.redirect('/portal');
  res.redirect('/login?notice=Password updated. You can now log in.');
});

function generateTempPassword() {
  return 'Vsp-' + Math.random().toString(36).slice(2, 8) + Math.floor(Math.random() * 100);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

module.exports = router;
