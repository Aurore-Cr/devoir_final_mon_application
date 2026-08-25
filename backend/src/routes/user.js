'use strict';
const express = require('express');
const router  = express.Router();
const db      = require('../db/database');
const { requireAuth } = require('../middleware/auth');

router.get('/schedule', requireAuth, (req, res) => {
  res.json({ success:true, schedule: db.getUserSchedule.all(req.user.id) });
});

router.put('/schedule', requireAuth, (req, res) => {
  const { schedule } = req.body;
  if (!Array.isArray(schedule) || !schedule.length)
    return res.status(400).json({ success:false, error:'schedule doit être un tableau non vide' });
  for (const s of schedule) {
    if (!s.label || !s.start_time || !s.end_time)
      return res.status(400).json({ success:false, error:'label, start_time, end_time requis' });
    if (!/^\d{2}:\d{2}$/.test(s.start_time) || !/^\d{2}:\d{2}$/.test(s.end_time))
      return res.status(400).json({ success:false, error:'Format HH:MM invalide' });
  }
  db.db.transaction(() => {
    db.deleteUserSchedule.run(req.user.id);
    schedule.forEach((s, i) => db.insertSlot.run({
      user_id:req.user.id, label:s.label.trim(), icon:s.icon||'📌',
      start_time:s.start_time, end_time:s.end_time, order_idx:i, color:s.color||'#58a6ff'
    }));
  })();
  res.json({ success:true });
});

router.post('/push-subscribe', requireAuth, (req, res) => {
  const sub = req.body.subscription;
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth)
    return res.status(400).json({ success:false, error:'Subscription invalide' });
  try {
    db.savePushSub.run({ user_id:req.user.id, endpoint:sub.endpoint, p256dh:sub.keys.p256dh, auth_key:sub.keys.auth, user_agent:req.headers['user-agent']||null });
    res.json({ success:true });
  } catch(err) { res.status(500).json({ success:false, error:err.message }); }
});

router.delete('/push-subscribe', requireAuth, (req, res) => {
  if (!req.body.endpoint) return res.status(400).json({ success:false, error:'endpoint requis' });
  db.deletePushSub.run(req.user.id, req.body.endpoint);
  res.json({ success:true });
});

router.get('/profile', requireAuth, (req, res) => {
  const user = db.findUserById.get(req.user.id);
  if (!user) return res.status(404).json({ success:false });
  res.json({ success:true, user });
});

module.exports = router;
