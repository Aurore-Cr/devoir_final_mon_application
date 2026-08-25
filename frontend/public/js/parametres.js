'use strict';
if (!window.AUTH?.isLoggedIn()) window.location.href = '/login.html';

let schedule = []; // planning en mémoire locale
let editingIdx = null; // index du créneau en cours d'édition

document.addEventListener('DOMContentLoaded', async () => {
  loadProfile();
  detectServerUrl();
  await loadSchedule();
  initNotifications();
  checkApiStatus();
  wireButtons();
});

// ── PROFIL ─────────────────────────────────────────────────
async function loadProfile() {
  const user = window.AUTH.getUser();
  if (user) {
    document.getElementById('profile-avatar').textContent = user.avatar || '🤖';
    document.getElementById('profile-name').textContent   = user.username || '—';
    document.getElementById('profile-email').textContent  = user.email    || '—';
  }
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
    statusEl.innerHTML = '🚫 Bloquées — autorise dans Réglages → Notifications → JARVIS';
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
  new Notification('⏰ JARVIS — Test', {
    body: 'Ordre de Jarvis : Arrêtez "Sport" → commencez "Cours / Travail"',
    icon: '/icons/icon-192x192.png',
  });
}

// ── STATUT API ─────────────────────────────────────────────
async function checkApiStatus() {
  const box = document.getElementById('api-status');
  try {
    const res  = await fetch('/api/generate/status');
    const data = await res.json();

    if (data.configured) {
      box.innerHTML = `
        <span class="status-dot ok"></span>
        <span>✅ <strong>${data.provider}</strong> connecté et opérationnel</span>`;
      box.className = 'api-status-box ok';
      // Mettre en valeur la carte du provider actif
      const active = data.env_var?.toLowerCase();
      document.querySelectorAll('.provider-card').forEach(card => {
        card.classList.toggle('active-provider', card.dataset.provider === active);
      });
    } else {
      box.innerHTML = `
        <span class="status-dot warn"></span>
        <span>⚠️ Aucun provider configuré — choisis une option ci-dessous</span>`;
      box.className = 'api-status-box warn';
    }
  } catch {
    box.innerHTML = `<span class="status-dot error"></span><span>❌ Serveur inaccessible</span>`;
    box.className = 'api-status-box error';
  }
}

// ── CÂBLAGE ÉVÉNEMENTS ────────────────────────────────────
function wireButtons() {
  // Logout
  [document.getElementById('btn-logout'), document.getElementById('btn-logout-bottom')].forEach(btn => {
    if (btn) btn.addEventListener('click', () => { if (confirm('Se déconnecter ?')) window.AUTH.logout(); });
  });

  // Test URL
  document.getElementById('btn-test-url').addEventListener('click', async () => {
    const url    = document.getElementById('custom-url').value.trim() || window.location.origin;
    const result = document.getElementById('url-result');
    result.textContent = 'Test en cours…';
    const ok = await testUrl(url, null);
    result.textContent = ok ? `✅ ${url} est accessible` : `❌ ${url} inaccessible — vérifier l'URL et que le serveur est démarré`;
    result.className = 'url-result ' + (ok ? 'ok' : 'error');
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
