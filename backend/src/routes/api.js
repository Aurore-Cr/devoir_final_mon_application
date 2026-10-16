'use strict';
const express = require('express');
const router  = express.Router();
router.get('/config', (_req,res) => res.json({vapidPublicKey:require('../services/push.service').getVapidPublicKey()}));
router.get('/status', (_req, res) => {
  res.json({ status: 'ok', version: '1.0.0', timestamp: new Date().toISOString() });
});
module.exports = router;
