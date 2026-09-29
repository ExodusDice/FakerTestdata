const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const db = require('../db');
const mailer = require('../mailer');
const { requireAdmin, requireSadmin } = require('../middleware/auth');

const router = express.Router();

function baseUrl() {
  return process.env.APP_BASE_URL || 'http://localhost:3000';
}

router.get('/admin', requireAdmin, (req, res) => {
  const data = db.load();
  const pending = data.users.filter((u) => !u.hardcoded && u.status === 'pending');
  const users = data.users.filter((u) => !u.hardcoded);

  const usageByUser = {};
  let totalTokens = 0;
  for (const t of data.tokenUsage) {
    usageByUser[t.userEmail] = usageByUser[t.userEmail] || { email: t.userEmail, requests: 0, tokens: 0 };
    usageByUser[t.userEmail].requests += 1;
    usageByUser[t.userEmail].tokens += t.tokensUsed || 0;
    totalTokens += t.tokensUsed || 0;
  }

  const recentUsage = [...data.tokenUsage].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 30);
  const recentEmails = [...data.emailLog].sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt)).slice(0, 30);

  res.render('admin', {
    user: req.session.user,
    pending,
    users,
    usageByUser: Object.values(usageByUser),
    totalTokens,
    recentUsage,
    recentEmails,
    smtpConfigured: mailer.isConfigured(),
    aiConfigured: Boolean(process.env.ANTHROPIC_API_KEY)
  });
});

// ---- Approvals from within the admin portal (no email token needed) ----
router.post('/admin/users/:id/approve', requireAdmin, async (req, res) => {
  const data = db.load();
  const user = data.users.find((u) => u.id === req.params.id && !u.hardcoded);
  if (!user) return res.redirect('/admin');

  const tempPassword = 'Vsp-' + Math.random().toString(36).slice(2, 8) + Math.floor(Math.random() * 100);
  user.passwordHash = bcrypt.hashSync(tempPassword, 10);
  user.status = 'approved';
  user.mustResetPassword = true;
  user.approvedAt = new Date().toISOString();

  const resetToken = uuid();
  data.actionTokens.push({
    token: resetToken,
    type: 'reset-password',
    payload: { userId: user.id },
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 168 * 3600 * 1000).toISOString(),
    used: false
  });
  db.save(data);

  await mailer.sendMail({
    to: user.email,
    subject: '[VASUP-Testdata] Your account has been approved - login credentials',
    text: `Hi ${user.name},\n\nYour VASUP-Testdata account has been approved.\nUsername (email): ${user.email}\nTemporary password: ${tempPassword}\n\nLogin at: ${baseUrl()}/login`
  });
  await mailer.sendMail({
    to: user.email,
    subject: '[VASUP-Testdata] Confirm your account & set your own password',
    text: `Your VASUP-Testdata registration is confirmed. Please set your own password: ${baseUrl()}/reset-password/${resetToken}\nThis link expires in 7 days.`
  });

  res.redirect('/admin');
});

router.post('/admin/users/:id/reject', requireAdmin, async (req, res) => {
  const data = db.load();
  const user = data.users.find((u) => u.id === req.params.id && !u.hardcoded);
  if (!user) return res.redirect('/admin');
  user.status = 'rejected';
  db.save(data);
  await mailer.sendMail({
    to: user.email,
    subject: '[VASUP-Testdata] Registration not approved',
    text: `Hi ${user.name},\n\nYour VASUP-Testdata registration was not approved. Contact the admin for details.`
  });
  res.redirect('/admin');
});

router.post('/admin/users/:id/ban', requireAdmin, (req, res) => {
  db.update((data) => {
    const user = data.users.find((u) => u.id === req.params.id && !u.hardcoded);
    if (user) user.status = 'banned';
  });
  res.redirect('/admin');
});

router.post('/admin/users/:id/unban', requireAdmin, (req, res) => {
  db.update((data) => {
    const user = data.users.find((u) => u.id === req.params.id && !u.hardcoded);
    if (user) user.status = 'approved';
  });
  res.redirect('/admin');
});

// ---- Full CRUD: sadmin only ("can create delete update data anytime") ----
router.post('/admin/users', requireSadmin, (req, res) => {
  const { name, email, position, role } = req.body;
  if (!name || !email) return res.redirect('/admin');
  db.update((data) => {
    if (data.users.some((u) => !u.hardcoded && u.email.toLowerCase() === email.toLowerCase())) return;
    const tempPassword = 'Vsp-' + Math.random().toString(36).slice(2, 8);
    data.users.push({
      id: uuid(),
      email,
      name,
      position: position || 'Jr',
      role: role === 'admin' ? 'admin' : 'tester',
      status: 'approved',
      mustResetPassword: true,
      passwordHash: bcrypt.hashSync(tempPassword, 10),
      createdAt: new Date().toISOString(),
      createdByAdmin: true
    });
  });
  res.redirect('/admin');
});

router.post('/admin/users/:id/update', requireSadmin, (req, res) => {
  const { name, position, role } = req.body;
  db.update((data) => {
    const user = data.users.find((u) => u.id === req.params.id && !u.hardcoded);
    if (!user) return;
    if (name) user.name = name;
    if (position) user.position = position;
    if (role) user.role = role === 'admin' ? 'admin' : 'tester';
  });
  res.redirect('/admin');
});

router.post('/admin/users/:id/delete', requireSadmin, (req, res) => {
  db.update((data) => {
    data.users = data.users.filter((u) => !(u.id === req.params.id && !u.hardcoded));
  });
  res.redirect('/admin');
});

module.exports = router;
