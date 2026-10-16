'use strict';
const express = require('express');
const crypto = require('crypto');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();
const hash = v => crypto.createHash('sha256').update(v).digest('hex');
const now = () => new Date().toISOString();
function auth(req,res,next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer jkv1_')) return requireAuth(req,res,()=>{
    if (!db.findUserById.get(req.user.id)) return res.status(401).json({error:'Compte introuvable'});
    next();
  });
  const row = db.get('SELECT user_id FROM organizer_devices WHERE token_hash=?',[hash(header.slice(7))]);
  if (!row || !db.findUserById.get(row.user_id)) return res.status(401).json({error:'Connexion Jarvis révoquée'});
  req.user = {id:row.user_id}; next();
}
const guard = fn => (req,res,next) => {try {fn(req,res);}catch(e){if(e.validation) return res.status(400).json({error:e.message});next(e);}};
const invalid = message => {const e=new Error(message);e.validation=true;throw e;};
function text(v,key,max,required=false) {
  if (typeof v !== 'string' || v.length>max || (required && !v.trim())) invalid(key+' invalide');
  return v.trim();
}
function date(v) {
  if (v===null || v==='') return null;
  if (typeof v!=='string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(v) || !Number.isFinite(Date.parse(v))) invalid('Date invalide : heure et fuseau requis');
  // Refuse les jours impossibles que Date.parse normaliserait (31 février...).
  const [y,m,d]=v.slice(0,10).split('-').map(Number);
  if (m<1 || m>12 || d<1 || d>new Date(Date.UTC(y,m,0)).getUTCDate()) invalid('Jour invalide');
  return new Date(v).toISOString();
}
function input(body,old={}) {
  const allowed=['title','notes','status','priority','quantity','due_at','remind_at','archived','version','request_key','kind'];
  if (!body || typeof body!=='object' || Array.isArray(body) || Object.keys(body).some(k=>!allowed.includes(k))) invalid('Champs non reconnus');
  const v={...old};
  for(const key of ['title','notes','quantity']) if(key in body) v[key]=text(body[key],key,key==='notes'?4000:key==='title'?200:100,key==='title');
  for(const [key,values] of [['kind',['task','shopping']],['status',['todo','doing','done']],['priority',['low','normal','high']]]) {
    if(key in body){if(!values.includes(body[key])) invalid(key+' invalide');v[key]=body[key];}
  }
  if(old.id && 'kind' in body && body.kind!==old.kind) invalid('Type non modifiable');
  if(!v.title || !v.kind) invalid('Titre et type requis');
  for(const key of ['due_at','remind_at']) if(key in body) v[key]=date(body[key]);
  if(v.due_at && v.remind_at && v.remind_at>v.due_at) invalid('Le rappel doit précéder ou correspondre à l’échéance');
  if('archived' in body){if(typeof body.archived!=='boolean') invalid('archived doit être un booléen');v.archived=Number(body.archived);}
  if(v.kind==='shopping' && v.status==='doing') invalid('Un article est à acheter ou acheté');
  return v;
}
function publicItem(v){return {...v,done:v.status==='done',archived:!!v.archived};}
function history(item,action){db.run('INSERT INTO organizer_history(item_id,user_id,action,snapshot,created_at) VALUES(?,?,?,?,?)',[item.id,item.user_id,action,JSON.stringify(publicItem(item)),now()]);}
router.post('/device',requireAuth,guard((req,res)=>{
  if(!db.findUserById.get(req.user.id))return res.status(401).json({error:'Compte introuvable'});
  const token='jkv1_'+crypto.randomBytes(32).toString('hex');
  db.run('INSERT INTO organizer_devices(user_id,token_hash,created_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET token_hash=excluded.token_hash,created_at=excluded.created_at',[req.user.id,hash(token),now()]);
  res.set('Cache-Control','no-store').json({token});
}));
router.delete('/device',requireAuth,guard((req,res)=>{
  db.run('DELETE FROM organizer_devices WHERE user_id=?',[req.user.id]);res.json({success:true});
}));
router.use(auth);
router.get('/items',guard((req,res)=>{
  if(req.query.kind && !['task','shopping'].includes(req.query.kind)) invalid('Type invalide');
  const rows=db.all('SELECT * FROM organizer_items WHERE user_id=? AND archived=?'+(req.query.kind?' AND kind=?':'')+' ORDER BY CASE status WHEN \'todo\' THEN 0 WHEN \'doing\' THEN 1 ELSE 2 END, CASE priority WHEN \'high\' THEN 0 WHEN \'normal\' THEN 1 ELSE 2 END, COALESCE(due_at,\'9999\'),id DESC',req.query.kind?[req.user.id,req.query.archived==='1'?1:0,req.query.kind]:[req.user.id,req.query.archived==='1'?1:0]);
  res.set('Cache-Control','no-store').json({items:rows.map(publicItem),server_time:now()});
}));
router.get('/export',guard((req,res)=>{
  res.set('Cache-Control','no-store').json({version:1,exported_at:now(),items:db.all('SELECT * FROM organizer_items WHERE user_id=?',[req.user.id]).map(publicItem),history:db.all('SELECT * FROM organizer_history WHERE user_id=?',[req.user.id])});
}));
router.post('/items',guard((req,res)=>{
  const v=input(req.body,{status:'todo',priority:'normal',notes:'',quantity:'',archived:0,due_at:null,remind_at:null});
  const key=req.body.request_key==null?null:text(req.body.request_key,'Identifiant de requête',100,true);
  if(key){const existing=db.get('SELECT * FROM organizer_items WHERE user_id=? AND request_key=?',[req.user.id,key]);if(existing)return res.json({item:publicItem(existing),replayed:true});}
  const stamp=now();
  const {lastInsertRowid:id}=db.run('INSERT INTO organizer_items(user_id,kind,title,notes,status,priority,quantity,due_at,remind_at,archived,created_at,updated_at,completed_at,request_key) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[req.user.id,v.kind,v.title,v.notes,v.status,v.priority,v.quantity,v.due_at,v.remind_at,v.archived,stamp,stamp,v.status==='done'?stamp:null,key]);
  const item=db.get('SELECT * FROM organizer_items WHERE id=? AND user_id=?',[id,req.user.id]);history(item,'created');res.status(201).json({item:publicItem(item)});
}));
router.patch('/items/:id',guard((req,res)=>{
  if(!req.body || Array.isArray(req.body)) invalid('Modification invalide');
  const old=db.get('SELECT * FROM organizer_items WHERE id=? AND user_id=?',[req.params.id,req.user.id]);
  if(!old)return res.status(404).json({error:'Élément introuvable'});
  if(!Number.isInteger(req.body.version) || req.body.version!==old.version)return res.status(409).json({error:'Modifié ailleurs : recharge la liste avant de réessayer'});
  const v=input(req.body,old),stamp=now();
  const completed=v.status==='done'?(old.completed_at||stamp):null;
  const sent=(v.remind_at!==old.remind_at || (old.status==='done' && v.status!=='done') || (!v.archived && old.archived))?null:old.reminder_sent_at;
  db.run('UPDATE organizer_items SET title=?,notes=?,status=?,priority=?,quantity=?,due_at=?,remind_at=?,archived=?,updated_at=?,completed_at=?,reminder_sent_at=?,version=version+1 WHERE id=? AND user_id=? AND version=?',[v.title,v.notes,v.status,v.priority,v.quantity,v.due_at,v.remind_at,v.archived,stamp,completed,sent,old.id,req.user.id,old.version]);
  const item=db.get('SELECT * FROM organizer_items WHERE id=? AND user_id=?',[old.id,req.user.id]);history(item,'updated');res.json({item:publicItem(item)});
}));
router.get('/items/:id/history',guard((req,res)=>{
  if(!db.get('SELECT id FROM organizer_items WHERE id=? AND user_id=?',[req.params.id,req.user.id]))return res.status(404).json({error:'Élément introuvable'});
  res.json({history:db.all('SELECT action,snapshot,created_at FROM organizer_history WHERE item_id=? AND user_id=? ORDER BY id DESC',[req.params.id,req.user.id])});
}));
router.use((err,req,res,next)=>{console.error('[Kanban]',err.message);res.status(500).json({error:'Enregistrement impossible. Réessaie sans fermer cette page.'});});
module.exports=router;
