const express = require('express');
const path = require('path');
const fs = require('fs');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/manual', requireAuth, (req, res) => {
  res.render('manual', { user: req.session.user });
});

// Serves the same Word version that is saved to the CTO/Vasup In-house folder,
// so users can grab it from inside the app too.
router.get('/manual/download', requireAuth, (req, res) => {
  const docxPath = path.join(__dirname, '..', '..', 'docs', 'usermanual-testdata.docx');
  if (!fs.existsSync(docxPath)) return res.status(404).send('Manual document not generated yet.');
  res.download(docxPath, 'usermanual-testdata.docx');
});

module.exports = router;
