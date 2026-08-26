'use strict';
const express  = require('express');
const router   = express.Router();
const { getVeilleReport, debugFeeds } = require('../services/veille.service');

router.get('/', async (req, res) => {
  try {
    const report = await getVeilleReport(req.query.refresh === 'true');
    res.set('Cache-Control', 'public, max-age=1800');
    res.json({ success:true, ...report });
  } catch(e) {
    res.status(500).json({ success:false, error:e.message });
  }
});

// ✅ NOUVEAU : endpoint de diagnostic
router.get('/debug', async (_req, res) => {
  try {
    const results = await debugFeeds();
    const ok  = results.filter(r=>r.status==='ok').length;
    const ko  = results.filter(r=>r.status==='error').length;
    res.json({ success:true, summary:`${ok} OK / ${ko} KO`, results });
  } catch(e) {
    res.status(500).json({ success:false, error:e.message });
  }
});

router.get('/sources', (_req, res) => {
  const { CATEGORIES } = require('../services/veille.service');
  const sources = Object.entries(CATEGORIES).map(([key,cat]) => ({
    key, label:cat.label, feeds:cat.feeds.map(f=>({name:f.name,url:f.url})), quota:cat.quota
  }));
  res.json({ success:true, sources });
});

module.exports = router;
