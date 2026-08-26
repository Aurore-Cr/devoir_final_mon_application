'use strict';
const express = require('express');
const router  = express.Router();
const gen     = require('../services/generator.service');

function noKey(res) {
  return res.status(503).json({ success:false, code:'NO_API_KEY', error:'GEMINI_API_KEY manquante dans .env' });
}

router.post('/defi', async (req, res) => {
  if (!gen.isConfigured()) return noKey(res);
  const { techno, niveau } = req.body || {};
  try {
    const defi = await gen.generateDefi(techno||null, niveau||null);
    res.json({ success:true, defi });
  } catch(e) { res.status(500).json({ success:false, error:e.message }); }
});

router.post('/anglais', async (req, res) => {
  if (!gen.isConfigured()) return noKey(res);
  const { topic, difficulty } = req.body || {};
  try {
    const exercise = await gen.generateAnglais(topic||null, difficulty||null);
    res.json({ success:true, exercise });
  } catch(e) { res.status(500).json({ success:false, error:e.message }); }
});

router.get('/status', (_req, res) => {
  res.json({ success:true, configured:gen.isConfigured(), provider:gen.providerLabel(), env_var:process.env.AI_PROVIDER||'gemini' });
});

router.get('/technos', (_req, res) => res.json({ success:true, technos:gen.TECHNOS_DEV }));

router.get('/vapid-public-key', (_req, res) => {
  const key = process.env.VAPID_PUBLIC_KEY || '';
  if (!key) return res.status(503).json({ success:false, error:'VAPID manquant — lancer npm run setup' });
  res.json({ success:true, publicKey:key });
});

module.exports = router;
