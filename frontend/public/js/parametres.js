'use strict';
if (!window.AUTH?.isLoggedIn()) window.location.href = '/login.html';

let schedule = []; // planning en mémoire locale
let editingIdx = null; // index du créneau en cours d'édition

document.addEventListener('DOMContentLoaded', async () => {
  await loadProfile();
  await loadProgress();
  detectServerUrl();
  await loadSchedule();
  initNotifications();
  wireButtons();
});

// ── PROFIL ─────────────────────────────────────────────────
async function loadProfile() {
  let user = window.AUTH.getUser();
  try {
    const res = await window.AUTH.apiFetch('/api/user/profile');
    if (res) { const data = await res.json(); if (data.success) user = data.user; }
  } catch {}
  if (user) {
    document.getElementById('profile-avatar').textContent = user.avatar || '🤖';
    document.getElementById('profile-name').textContent   = user.username || '—';
    document.getElementById('profile-email').textContent  = user.email || '—';
    const u = document.getElementById('profile-username'); if (u) u.value = user.username || '';
    const e = document.getElementById('profile-email-input'); if (e) e.value = user.email || '';
    const a = document.getElementById('profile-avatar-input'); if (a) a.value = user.avatar || '🤖';
    localStorage.setItem('james_user', JSON.stringify(user));
  }
}

async function loadProgress() {
  const stats = document.getElementById('progress-stats');
  const track = document.getElementById('level-track');
  const history = document.getElementById('history-list');
  if (!stats || !track || !history) return;
  try {
    const res = await window.AUTH.apiFetch('/api/user/progress');
    if (!res) return;
    const data = await res.json();
    const p = data.progress;
    stats.innerHTML = `<div class="stat-card"><strong>${p.currentLevel}</strong><span>Niveau actuel</span></div><div class="stat-card"><strong>${p.totalCompleted}</strong><span>Exercices</span></div><div class="stat-card"><strong>${p.successRate}%</strong><span>Bien compris</span></div>`;
    track.innerHTML = p.levels.map(l => `<span class="level-pill ${p.unlockedLevels.includes(l)?'unlocked':'locked'}">${l}${p.unlockedLevels.includes(l)?'':' 🔒'}</span>`).join('');
    history.innerHTML = p.history.length ? p.history.map(h => `<div class="history-row"><div><strong>${escHtml(h.title)}</strong><span>${h.difficulty} · ${h.source === 'ia' ? 'IA' : 'Catalogue'}</span></div><span class="history-score score-${h.score}">${Number(h.score)===2?'✓':Number(h.score)===1?'~':'×'}</span></div>`).join('') : '<p class="section-desc">Aucun exercice terminé pour le moment.</p>';
  } catch (e) { stats.innerHTML = '<p class="section-desc">Progression indisponible.</p>'; }
}

// ── DÉTECTION URL SERVEUR ──────────────────────────────────
function detectServerUrl() {
  const el = document.getElementById('detected-url');
  const url = window.location.origin;
  el.textContent = url;
  // Tester la connexion automatiquement
  testUrl(url, document.getElementById('server-status'));
}

async function testUrl(url, statusEl) {
  try {
    const res = await fetch(url + '/api/status', { signal: AbortSignal.timeout(5000) });
    const d   = await res.json();
    if (statusEl) statusEl.textContent = d.success !== false ? '✅ Connecté' : '❌ Erreur';
    return d.success !== false;
  } catch(e) {
    if (statusEl) statusEl.textContent = '❌ Inaccessible';
    return false;
  }
}

// ── PLANNING ───────────────────────────────────────────────
async function loadSchedule() {
  try {
    const res = await window.AUTH.apiFetch('/api/user/schedule');
    if (!res) return;
    const data = await res.json();
    if (data.success) { schedule = data.schedule; renderSchedule(); }
  } catch(e) { console.error('[Params] schedule:', e); }
}

function renderSchedule() {
  const list = document.getElementById('schedule-list');
  list.innerHTML = schedule.map((s, i) => `
    <div class="slot-row" data-idx="${i}" style="--sc:${s.color||'#58a6ff'}">
      <span class="slot-icon">${s.icon||'📌'}</span>
      <div class="slot-info">
        <span class="slot-label">${escHtml(s.label)}</span>
        <span class="slot-time">${s.start_time} → ${s.end_time}</span>
      </div>
      <button class="slot-edit-btn" data-idx="${i}">✏️</button>
    </div>
  `).join('');
  list.querySelectorAll('.slot-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => openEditor(parseInt(btn.dataset.idx)));
  });
}

function openEditor(idx) {
  editingIdx = idx;
  const s    = schedule[idx];
  const isNew = idx === null;
  document.getElementById('editor-title').textContent  = isNew ? 'Nouveau créneau' : 'Modifier le créneau';
  document.getElementById('edit-icon').value    = s?.icon       || '';
  document.getElementById('edit-color').value   = s?.color      || '#58a6ff';
  document.getElementById('edit-label').value   = s?.label      || '';
  document.getElementById('edit-start').value   = s?.start_time || '';
  document.getElementById('edit-end').value     = s?.end_time   || '';
  document.getElementById('btn-delete-slot').style.display = isNew ? 'none' : '';
  document.getElementById('slot-editor').style.display = '';
  document.getElementById('slot-editor').scrollIntoView({ behavior:'smooth' });
}

function openNewEditor() {
  editingIdx = null;
  document.getElementById('editor-title').textContent = 'Nouveau créneau';
  document.getElementById('edit-icon').value  = '📌';
  document.getElementById('edit-color').value = '#58a6ff';
  document.getElementById('edit-label').value = '';
  document.getElementById('edit-start').value = '';
  document.getElementById('edit-end').value   = '';
  document.getElementById('btn-delete-slot').style.display = 'none';
  document.getElementById('slot-editor').style.display = '';
  document.getElementById('slot-editor').scrollIntoView({ behavior:'smooth' });
}

// ── NOTIFICATIONS PUSH ─────────────────────────────────────
async function initNotifications() {
  const statusEl = document.getElementById('notif-status');
  const btnEnable = document.getElementById('btn-enable-notif');
  const btnTest   = document.getElementById('btn-test-notif');

  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    statusEl.innerHTML = '❌ Non supporté par ce navigateur.';
    btnEnable.style.display = 'none'; return;
  }

  const perm = Notification.permission;
  if (perm === 'granted') {
    statusEl.innerHTML = '✅ Alertes activées';
    btnEnable.style.display = 'none';
    btnTest.style.display = '';
  } else if (perm === 'denied') {
    statusEl.innerHTML = '🚫 Bloquées — autorise dans Réglages → Notifications → JAMES';
    btnEnable.style.display = 'none';
  } else {
    statusEl.innerHTML = '⚠️ Alertes non activées';
  }
}

async function enableNotifications() {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') {
    document.getElementById('notif-status').innerHTML = '🚫 Permission refusée';
    return;
  }
  document.getElementById('notif-status').innerHTML = '✅ Permission accordée — abonnement en cours…';

  try {
    const reg     = await navigator.serviceWorker.ready;
    const keyRes  = await fetch('/api/generate/vapid-public-key');
    const keyData = await keyRes.json();
    if (!keyData.success) throw new Error('Clé VAPID non disponible — relancer npm run setup');

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(keyData.publicKey),
    });

    const res = await window.AUTH.apiFetch('/api/user/push-subscribe', {
      method: 'POST',
      body: JSON.stringify({ subscription: sub.toJSON() }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    document.getElementById('notif-status').innerHTML = '✅ Alertes activées — tu recevras une notification à chaque changement de tâche';
    document.getElementById('btn-enable-notif').style.display = 'none';
    document.getElementById('btn-test-notif').style.display = '';
  } catch(err) {
    document.getElementById('notif-status').innerHTML = '❌ Erreur: ' + err.message;
  }
}

async function testNotification() {
  new Notification('⏰ JAMES — Test', {
    body: 'Ordre de JAMES : Arrêtez "Sport" → commencez "Cours / Travail"',
    icon: '/icons/icon-192x192.png',
  });
}

// ── STATUT API ─────────────────────────────────────────────

// ── CÂBLAGE ÉVÉNEMENTS ────────────────────────────────────
function wireButtons() {
  const saveProfile = document.getElementById('btn-save-profile');
  if (saveProfile) saveProfile.addEventListener('click', async () => {
    const status = document.getElementById('profile-save-status');
    const payload = { username:document.getElementById('profile-username').value.trim(), email:document.getElementById('profile-email-input').value.trim(), avatar:document.getElementById('profile-avatar-input').value.trim() || '🤖' };
    const res = await window.AUTH.apiFetch('/api/user/profile', {method:'PUT', body:JSON.stringify(payload)});
    if (!res) return; const data = await res.json();
    status.textContent = data.success ? '✅ Profil mis à jour' : '❌ ' + data.error; status.className='save-status '+(data.success?'ok':'error');
    if (data.success) { localStorage.setItem('james_user', JSON.stringify(data.user)); await loadProfile(); }
  });

  const changePw = document.getElementById('btn-change-password');
  if (changePw) changePw.addEventListener('click', async () => {
    const status = document.getElementById('password-status');
    const res = await window.AUTH.apiFetch('/api/user/password', {method:'PUT', body:JSON.stringify({currentPassword:document.getElementById('current-password').value, newPassword:document.getElementById('new-password').value})});
    if (!res) return; const data = await res.json();
    status.textContent = data.success ? '✅ Mot de passe modifié' : '❌ ' + data.error; status.className='save-status '+(data.success?'ok':'error');
    if (data.success) { document.getElementById('current-password').value=''; document.getElementById('new-password').value=''; }
  });

  // Logout
  [document.getElementById('btn-logout'), document.getElementById('btn-logout-bottom')].forEach(btn => {
    if (btn) btn.addEventListener('click', () => { if (confirm('Se déconnecter ?')) window.AUTH.logout(); });
  });

  // Planning
  document.getElementById('btn-add-slot').addEventListener('click', openNewEditor);
  document.getElementById('btn-cancel-edit').addEventListener('click', () => {
    document.getElementById('slot-editor').style.display = 'none';
    editingIdx = null;
  });

  document.getElementById('btn-save-slot').addEventListener('click', () => {
    const label = document.getElementById('edit-label').value.trim();
    const start = document.getElementById('edit-start').value;
    const end   = document.getElementById('edit-end').value;
    if (!label || !start || !end) { alert('Libellé, heure de début et de fin requis.'); return; }
    const slot = {
      icon       : document.getElementById('edit-icon').value || '📌',
      color      : document.getElementById('edit-color').value,
      label, start_time: start, end_time: end,
    };
    if (editingIdx !== null) schedule[editingIdx] = { ...schedule[editingIdx], ...slot };
    else schedule.push(slot);
    schedule.sort((a,b) => a.start_time.localeCompare(b.start_time));
    renderSchedule();
    document.getElementById('slot-editor').style.display = 'none';
    editingIdx = null;
  });

  document.getElementById('btn-delete-slot').addEventListener('click', () => {
    if (editingIdx === null) return;
    if (!confirm('Supprimer ce créneau ?')) return;
    schedule.splice(editingIdx, 1);
    renderSchedule();
    document.getElementById('slot-editor').style.display = 'none';
    editingIdx = null;
  });

  document.getElementById('btn-save-schedule').addEventListener('click', async () => {
    const status = document.getElementById('save-status');
    status.textContent = 'Sauvegarde en cours…';
    try {
      const res  = await window.AUTH.apiFetch('/api/user/schedule', { method:'PUT', body:JSON.stringify({ schedule }) });
      const data = await res.json();
      status.textContent = data.success ? '✅ Planning sauvegardé !' : '❌ ' + data.error;
      status.className = 'save-status ' + (data.success ? 'ok' : 'error');
    } catch(e) { status.textContent = '❌ Erreur réseau'; status.className = 'save-status error'; }
    setTimeout(() => { status.textContent = ''; }, 3000);
  });

  // Notifications
  document.getElementById('btn-enable-notif').addEventListener('click', enableNotifications);
  document.getElementById('btn-test-notif').addEventListener('click', testNotification);
}

// ── UTILITAIRES ───────────────────────────────────────────
function urlBase64ToUint8Array(base64) {
  const p = (base64 + '='.repeat((4 - base64.length % 4) % 4)).replace(/-/g,'+').replace(/_/g,'/');
  const r = atob(p); const o = new Uint8Array(r.length);
  for (let i = 0; i < r.length; i++) o[i] = r.charCodeAt(i);
  return o;
}
function escHtml(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
