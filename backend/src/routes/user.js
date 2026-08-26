'use strict';
const express = require('express');
const bcrypt  = require('bcryptjs');
const router  = express.Router();
const db      = require('../db/database');
const generator = require('../services/generator.service');
const { requireAuth } = require('../middleware/auth');


const ENGLISH_LEVELS = ['A1','A2','B1','B2','C1','C2'];

function buildProgress(userId) {
  const attempts = db.getEnglishAttempts.all(userId, 100);
  const successRows = db.getSuccessfulEnglishByLevel.all(userId);
  const successMap = Object.fromEntries(successRows.map(r => [r.difficulty, Number(r.successes)]));
  let unlockedIndex = 0;
  // Un niveau réussi avec « Bien compris » débloque le niveau suivant.
  for (let i = 0; i < ENGLISH_LEVELS.length - 1; i++) {
    if ((successMap[ENGLISH_LEVELS[i]] || 0) >= 1) unlockedIndex = i + 1;
    else break;
  }
  const currentLevel = ENGLISH_LEVELS[unlockedIndex];
  const total = attempts.length;
  const successful = attempts.filter(a => Number(a.score) === 2).length;
  return {
    levels: ENGLISH_LEVELS,
    unlockedLevels: ENGLISH_LEVELS.slice(0, unlockedIndex + 1),
    currentLevel,
    successByLevel: successMap,
    totalCompleted: total,
    successful,
    successRate: total ? Math.round((successful / total) * 100) : 0,
    history: attempts.slice(0, 20),
  };
}

router.put('/profile', requireAuth, (req, res) => {
  const { username, email, avatar } = req.body || {};
  const name = String(username || '').trim();
  const mail = String(email || '').trim().toLowerCase();
  if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail))
    return res.status(400).json({ success:false, error:'Nom ou email invalide' });
  const byName = db.findUserByUsername.get(name);
  const byEmail = db.findUserByEmail.get(mail);
  if (byName && Number(byName.id) !== Number(req.user.id)) return res.status(409).json({ success:false, error:'Nom déjà utilisé' });
  if (byEmail && Number(byEmail.id) !== Number(req.user.id)) return res.status(409).json({ success:false, error:'Email déjà utilisé' });
  db.updateUserProfile.run(req.user.id, { username:name, email:mail, avatar:String(avatar || '🤖').slice(0,8) });
  res.json({ success:true, user:db.findUserById.get(req.user.id) });
});

router.put('/password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword || newPassword.length < 8)
    return res.status(400).json({ success:false, error:'Mot de passe actuel requis et nouveau mot de passe de 8 caractères minimum' });
  const user = db.findUserAuthById.get(req.user.id);
  if (!user || !(await bcrypt.compare(currentPassword, user.password_hash)))
    return res.status(401).json({ success:false, error:'Mot de passe actuel incorrect' });
  db.updateUserPassword.run(req.user.id, await bcrypt.hash(newPassword, 10));
  res.json({ success:true });
});

router.post('/english-attempt', requireAuth, (req, res) => {
  const { exerciseId, title, difficulty, score, source } = req.body || {};
  if (!exerciseId || !title || !ENGLISH_LEVELS.includes(difficulty) || ![0,1,2].includes(Number(score)))
    return res.status(400).json({ success:false, error:'Résultat d’exercice invalide' });
  db.addEnglishAttempt.run({ user_id:req.user.id, exercise_id:String(exerciseId).slice(0,100), title:String(title).slice(0,160), difficulty, score:Number(score), source:source === 'ia' ? 'ia' : 'catalogue' });
  res.json({ success:true, progress:buildProgress(req.user.id) });
});

router.get('/progress', requireAuth, (req, res) => {
  res.json({ success:true, progress:buildProgress(req.user.id) });
});

router.get('/history', requireAuth, (req, res) => {
  res.json({ success:true, history:db.getEnglishAttempts.all(req.user.id, 50) });
});

router.get('/daily-flashcards', requireAuth, async (req, res) => {
  const day = new Date().toISOString().slice(0,10);
  let cards = db.getDailyFlashcards.all(req.user.id, day);
  if (!cards.length) {
    if (!generator.isConfigured()) return res.status(503).json({ success:false, error:'Gemini non configuré' });
    try {
      const generated = await generator.generateDailyFlashcards();
      for (const card of generated) {
        db.addDailyFlashcard.run({ user_id:req.user.id, day, category:card.category, question:card.question, answer:card.answer });
      }
      cards = db.getDailyFlashcards.all(req.user.id, day);
    } catch (err) {
      console.error('[Flashcards]', err.message);
      return res.status(500).json({ success:false, error:'Génération des flashcards impossible' });
    }
  }
  res.json({ success:true, day, cards });
});

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
