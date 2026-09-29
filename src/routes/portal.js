const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuid } = require('uuid');
const db = require('../db');
const mailer = require('../mailer');
const ai = require('../ai');
const { extractText } = require('../attachments');
const { writeExports } = require('../exporter');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'data', 'uploads');
const EXPORT_DIR = path.join(__dirname, '..', '..', 'data', 'exports');
const VASUP_EMAIL_RE = /^[a-zA-Z0-9._%+-]+@vasup\.co\.th$/i;

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 15 * 1024 * 1024 }
});

router.get('/portal', requireAuth, (req, res) => {
  const data = db.load();
  const history = data.requests
    .filter((r) => r.userId === req.session.user.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 25);
  res.render('portal', { user: req.session.user, history });
});

router.post(
  '/portal/api/generate',
  requireAuth,
  upload.fields([
    { name: 'brdFsd', maxCount: 1 },
    { name: 'testCase', maxCount: 1 },
    { name: 'testPlan', maxCount: 1 }
  ]),
  async (req, res) => {
    const { projectName, condition, goal, email } = req.body;
    let testTypes = req.body.testTypes;
    if (!testTypes) testTypes = [];
    if (!Array.isArray(testTypes)) testTypes = [testTypes];

    if (!projectName || testTypes.length === 0 || !email) {
      return res.status(400).json({ error: 'Project Name, at least one Test Type, and Email are required.' });
    }
    if (!VASUP_EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'Email must be a @vasup.co.th address.' });
    }

    const files = req.files || {};
    const requestId = uuid();

    try {
      const attachmentsMeta = [];
      const attachmentsText = {};

      for (const [field, key] of [['brdFsd', 'brdFsd'], ['testCase', 'testCase'], ['testPlan', 'testPlan']]) {
        const f = files[field]?.[0];
        if (f) {
          const text = await extractText(f.path, f.originalname);
          attachmentsText[key] = text;
          attachmentsMeta.push({ field, originalName: f.originalname, storedAs: path.basename(f.path) });
        } else {
          attachmentsText[key] = '';
        }
      }

      const genResult = await ai.generateTestData({
        projectName,
        condition,
        testTypes,
        goal,
        email,
        attachmentsText
      });

      const { xlsxPath, csvPath } = await writeExports(requestId, genResult.rows);

      const requestRecord = {
        id: requestId,
        userId: req.session.user.id,
        userEmail: req.session.user.email,
        projectName,
        condition,
        testTypes,
        goal,
        deliverToEmail: email,
        attachments: attachmentsMeta,
        rowCount: genResult.rows.length,
        aiMode: genResult.mode,
        aiModel: genResult.model,
        tokensUsed: genResult.tokensUsed,
        createdAt: new Date().toISOString()
      };

      db.update((data) => {
        data.requests.push(requestRecord);
        data.tokenUsage.push({
          id: uuid(),
          requestId,
          userId: req.session.user.id,
          userEmail: req.session.user.email,
          projectName,
          tokensUsed: genResult.tokensUsed,
          mode: genResult.mode,
          model: genResult.model,
          createdAt: new Date().toISOString()
        });
      });

      const mailResult = await mailer.sendMail({
        to: email,
        subject: `[VASUP-Testdata] Test data ready for ${projectName}`,
        text: `Your requested test data for "${projectName}" is attached (CSV + Excel).\nRows generated: ${genResult.rows.length}\nMode: ${genResult.mode}${genResult.note ? '\nNote: ' + genResult.note : ''}`,
        html: `<p>Your requested test data for <b>${escapeHtml(projectName)}</b> is attached (CSV + Excel).</p>
               <p>Rows generated: ${genResult.rows.length}<br/>Mode: ${genResult.mode}</p>
               ${genResult.note ? `<p><i>${escapeHtml(genResult.note)}</i></p>` : ''}`,
        attachments: [
          { filename: `${sanitize(projectName)}-testdata.xlsx`, path: xlsxPath },
          { filename: `${sanitize(projectName)}-testdata.csv`, path: csvPath }
        ]
      });

      res.json({
        ok: true,
        requestId,
        rows: genResult.rows,
        mode: genResult.mode,
        model: genResult.model,
        note: genResult.note || null,
        tokensUsed: genResult.tokensUsed,
        emailed: !mailResult.mocked,
        emailMocked: mailResult.mocked,
        downloadCsv: `/portal/download/${requestId}/csv`,
        downloadXlsx: `/portal/download/${requestId}/xlsx`
      });
    } catch (err) {
      console.error('Generation failed:', err);
      res.status(500).json({ error: 'Test data generation failed: ' + err.message });
    }
  }
);

router.get('/portal/download/:id/:format', requireAuth, (req, res) => {
  const { id, format } = req.params;
  const data = db.load();
  const reqRecord = data.requests.find((r) => r.id === id);
  if (!reqRecord) return res.status(404).send('Not found');
  const isOwner = reqRecord.userId === req.session.user.id;
  const isAdmin = ['admin', 'sadmin'].includes(req.session.user.role);
  if (!isOwner && !isAdmin) return res.status(403).send('Forbidden');

  const ext = format === 'xlsx' ? 'xlsx' : 'csv';
  const filePath = path.join(EXPORT_DIR, `${id}.${ext}`);
  if (!fs.existsSync(filePath)) return res.status(404).send('File no longer available');
  res.download(filePath, `${sanitize(reqRecord.projectName)}-testdata.${ext}`);
});

function sanitize(str) {
  return String(str).replace(/[^a-z0-9-_]+/gi, '_').slice(0, 60);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

module.exports = router;
