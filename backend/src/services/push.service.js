'use strict';
const webpush = require('web-push');
const db      = require('../db/database');

const PUB  = process.env.VAPID_PUBLIC_KEY  || '';
const PRIV = process.env.VAPID_PRIVATE_KEY || '';
const EMAIL= process.env.VAPID_EMAIL       || 'mailto:admin@james.local';

if (PUB && PRIV) { webpush.setVapidDetails(EMAIL, PUB, PRIV); console.log('[Push] ✅ VAPID OK'); }
else              { console.warn('[Push] ⚠️  VAPID manquant — lancer npm run setup'); }

function toMin(t) { const [h,m]=t.split(':').map(Number); return h*60+m; }

async function sendToUser(userId, payload) {
  if (!PUB||!PRIV) return { sent:0 };
  const subs = db.getUserPushSubs.all(userId);
  let sent=0;
  await Promise.allSettled(subs.map(async s => {
    try {
      await webpush.sendNotification({endpoint:s.endpoint,keys:{p256dh:s.p256dh,auth:s.auth_key}},JSON.stringify(payload),{urgency:'high',TTL:300});
      sent++;
    } catch(e) { if(e.statusCode===410||e.statusCode===404) db.deletePushSub.run(userId,s.endpoint); }
  }));
  return { sent };
}

async function checkAndNotify() {
  if (!PUB||!PRIV) return;
  const now  = new Date();
  const hhmm = String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0');
  const subs  = db.getAllPushSubs.all();
  const users = [...new Set(subs.map(s=>s.user_id))];
  for (const uid of users) {
    const schedule = db.getUserSchedule.all(uid);
    const ending   = schedule.find(s=>s.end_time===hhmm);
    if (!ending) continue;
    const next = schedule.filter(s=>toMin(s.start_time)>=toMin(ending.end_time)).sort((a,b)=>toMin(a.start_time)-toMin(b.start_time))[0];
    const body = next ? `Arrêtez "${ending.icon} ${ending.label}" → commencez "${next.icon} ${next.label}"` : `${ending.icon} ${ending.label} est terminé.`;
    await sendToUser(uid,{title:'⏰ JAMES',body,icon:'/icons/icon-192x192.png',url:'/planner.html',vibrate:[400,150,400,150,600]});
  }
}

module.exports = { sendToUser, checkAndNotify, getVapidPublicKey:()=>PUB };
