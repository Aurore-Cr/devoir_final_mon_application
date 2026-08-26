'use strict';
const express = require('express');
const bcrypt  = require('bcryptjs');
const router  = express.Router();
const db      = require('../db/database');
const { requireAuth, signToken } = require('../middleware/auth');

router.post('/register', async (req, res) => {
  const { username, email, password } = req.body || {};
  if (!username?.trim() || !email?.trim() || !password)
    return res.status(400).json({ success:false, error:'username, email et password requis' });
  if (password.length < 6)
    return res.status(400).json({ success:false, error:'Mot de passe : 6 caractères minimum' });
  if (db.findUserByEmail.get(email.toLowerCase()))
    return res.status(409).json({ success:false, error:'Email déjà utilisé' });
  if (db.findUserByUsername.get(username.trim()))
    return res.status(409).json({ success:false, error:'Nom d\'utilisateur déjà pris' });
  try {
    const hash = await bcrypt.hash(password, 10);
    const userId = db.createUserWithSchedule({ username:username.trim(), email:email.toLowerCase(), password_hash:hash, avatar:'🤖' });
    const token = signToken({ id:userId, username:username.trim(), email:email.toLowerCase() });
    res.status(201).json({ success:true, token, user:{ id:userId, username:username.trim(), email } });
  } catch(err) {
    console.error('[Auth]', err);
    res.status(500).json({ success:false, error:'Erreur serveur' });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ success:false, error:'Email et mot de passe requis' });
  const user = db.findUserByEmail.get(email.toLowerCase());
  if (!user) return res.status(401).json({ success:false, error:'Email ou mot de passe incorrect' });
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid)  return res.status(401).json({ success:false, error:'Email ou mot de passe incorrect' });
  db.updateLastLogin.run(user.id);
  const token = signToken({ id:user.id, username:user.username, email:user.email });
  res.json({ success:true, token, user:{ id:user.id, username:user.username, email:user.email, avatar:user.avatar } });
});

router.get('/me', requireAuth, (req, res) => {
  const user = db.findUserById.get(req.user.id);
  if (!user) return res.status(404).json({ success:false, error:'Introuvable' });
  res.json({ success:true, user });
});

module.exports = router;
