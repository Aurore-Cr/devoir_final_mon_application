'use strict';

// ============================================================
//  JAMES — dashboard.js   v6.0 (multi-utilisateurs)
//
//  Nouveautés v6 :
//    ✅ Charge le planning depuis /api/user/schedule (par user)
//    ✅ Affiche le nom de l'utilisateur connecté
//    ✅ Lien vers /parametres.html dans le header
//    ✅ Redirige vers /login.html si non connecté
// ============================================================

// Attendre que auth.js soit chargé avant d'exécuter
// (auth.js est chargé avant dashboard.js dans le HTML)


/* ─────────────────────────────────────────────────────────
   PLANNING QUOTIDIEN — personnalise ces créneaux
─────────────────────────────────────────────────────────── */
const SCHEDULE = [
  { start: '06:30', end: '07:00', label: 'Réveil & Prépa',       icon: '🌅' },
  { start: '07:00', end: '08:30', label: 'Sport',                icon: '💪' },
  { start: '08:30', end: '09:00', label: 'Petit-déjeuner',       icon: '☕' },
  { start: '09:00', end: '12:00', label: 'Cours / Travail',      icon: '📚' },
  { start: '12:00', end: '13:00', label: 'Repas midi',           icon: '🍽️' },
  { start: '13:00', end: '14:00', label: 'Pause & Récupération', icon: '😴' },
  { start: '14:00', end: '17:00', label: 'Révision & Projets',   icon: '💻' },
  { start: '17:00', end: '18:00', label: 'JAMES — Défis',       icon: '🤖' },
  { start: '18:00', end: '19:00', label: 'Sport / Détente',      icon: '🏃' },
  { start: '19:00', end: '20:00', label: 'Dîner',                icon: '🍴' },
  { start: '20:00', end: '22:00', label: 'Révision soirée',      icon: '📖' },
  { start: '22:00', end: '23:00', label: 'Détente / Lecture',    icon: '🌙' },
];

const CAT_COLORS = {
  dev: '#58a6ff', ia: '#bc8cff', cyber: '#f85149', general: '#3fb950',
};

const $ = id => document.getElementById(id);

// ════════════════════════════════════════════════════════════
//  ✅ BUG 1 CORRIGÉ — ENREGISTREMENT SERVICE WORKER
//  Sans cette ligne, la PWA ne peut pas :
//    - Fonctionner hors ligne
//    - Recevoir des notifications push
//    - Être installable sur iPhone (iOS 16.4+ exige le SW)
// ════════════════════════════════════════════════════════════
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then(reg => {
        console.log('[JAMES] ✅ Service Worker enregistré — scope :', reg.scope);
        // Keepalive SW toutes les 20s (empêche Safari de le tuer en arrière-plan)
        setInterval(() => {
          if (navigator.serviceWorker.controller) {
            const channel = new MessageChannel();
            navigator.serviceWorker.controller.postMessage(
              { type: 'KEEPALIVE' }, [channel.port2]
            );
          }
        }, 20_000);
      })
      .catch(err => console.warn('[JAMES] ⚠️ SW :', err.message));
  });
}

// ════════════════════════════════════════════════════════════
//  POINT D'ENTRÉE
// ════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  // ── Auth : rediriger si non connecté ──
  if (typeof AUTH !== 'undefined') {
    if (!AUTH.isLoggedIn()) { window.location.href = '/login.html'; return; }
    const user = AUTH.getUser();
    const nameEl = document.getElementById('user-name');
    if (nameEl && user) nameEl.textContent = user.username || 'JAMES';
    await loadUserSchedule();
  }

  initClock();
  initPlanner();
  initStatusBar();
  wireNotifBtn();

  Promise.allSettled([
    loadVeilleWidget(),
    loadAnglaisWidget(),
    loadDefiWidget(),
  ]);
});

// Charge le planning personnel depuis la DB via API
async function loadUserSchedule() {
  try {
    const res = await AUTH.apiFetch('/api/user/schedule');
    if (!res) return;
    const data = await res.json();
    if (data.success && data.schedule?.length > 0) {
      SCHEDULE.length = 0;
      data.schedule.forEach(s => SCHEDULE.push({
        start: s.start_time, end: s.end_time, label: s.label, icon: s.icon || '📌'
      }));
    }
  } catch(e) { console.warn('[Dashboard] schedule:', e.message); }
}

// ════════════════════════════════════════════════════════════
//  ① HORLOGE LIVE
// ════════════════════════════════════════════════════════════
function initClock() {
  const elTime = $('live-time');
  const elDate = $('live-date');
  const DAYS   = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  const MONTHS = ['jan','fév','mars','avr','mai','juin','juil','août','sep','oct','nov','déc'];

  function tick() {
    const n = new Date();
    if (elTime) elTime.textContent = `${pad(n.getHours())}:${pad(n.getMinutes())}:${pad(n.getSeconds())}`;
    if (elDate) elDate.textContent = `${DAYS[n.getDay()]} ${n.getDate()} ${MONTHS[n.getMonth()]} ${n.getFullYear()}`;
  }
  tick();
  setInterval(tick, 1000);
}

// ════════════════════════════════════════════════════════════
//  ② WIDGET PLANNER
// ════════════════════════════════════════════════════════════
function initPlanner() {
  renderMiniTimeline();
  updatePlanner();
  setInterval(updatePlanner, 30_000);
}

function updatePlanner() {
  const now = new Date();
  const mNow = now.getHours() * 60 + now.getMinutes();

  const currentIdx = SCHEDULE.findIndex(s => {
    const sM = toMin(s.start), eM = toMin(s.end);
    return mNow >= sM && mNow < eM;
  });

  const current = currentIdx !== -1 ? SCHEDULE[currentIdx] : null;
  const next = current
    ? (SCHEDULE[currentIdx + 1] || null)
    : SCHEDULE.find(s => toMin(s.start) > mNow) || null;

  // Tâche courante
  if (current) {
    const sM = toMin(current.start), eM = toMin(current.end);
    const progress   = Math.min(1, Math.max(0, (mNow - sM) / (eM - sM)));
    const remainMin  = eM - mNow;

    setText('pln-now-icon', current.icon);
    setText('pln-now-name', current.label);
    setText('pln-now-time', `${current.start} → ${current.end}`);
    setText('pln-remaining', formatDur(remainMin));

    const arc = $('ring-arc');
    if (arc) arc.style.strokeDashoffset = (213.6 * (1 - progress)).toFixed(1);
  } else {
    setText('pln-now-icon', '💤');
    setText('pln-now-name', mNow < 360 ? 'Repos nocturne' : 'Soirée libre');
    setText('pln-now-time', '—');
    setText('pln-remaining', '--:--');
    const arc = $('ring-arc');
    if (arc) arc.style.strokeDashoffset = '213.6';
  }

  // Tâche suivante
  if (next) {
    setText('pln-next-icon', next.icon);
    setText('pln-next-name', next.label);
    setText('pln-next-time', next.start);
  } else {
    setText('pln-next-icon', '🌟');
    setText('pln-next-name', 'Journée terminée');
    setText('pln-next-time', '');
  }

  // Barre journée (06h–23h)
  const pct = Math.min(100, Math.max(0,
    ((mNow - 360) / (23 * 60 - 360)) * 100
  )).toFixed(1);
  const fill = $('day-progress-fill'), marker = $('dpb-marker');
  if (fill)   fill.style.width = `${pct}%`;
  if (marker) marker.style.left = `${pct}%`;

  // Mini-timeline
  document.querySelectorAll('.mt-slot').forEach((el, i) => {
    const s = SCHEDULE[i];
    if (!s) return;
    const sM = toMin(s.start), eM = toMin(s.end);
    el.classList.toggle('active', mNow >= sM && mNow < eM);
    el.classList.toggle('past',   mNow >= eM);
  });
}

function renderMiniTimeline() {
  const c = $('mini-timeline');
  if (!c) return;
  c.innerHTML = SCHEDULE.map((s, i) => `
    <div class="mt-slot" data-idx="${i}" title="${s.label} (${s.start}–${s.end})">
      <span class="mt-slot-icon">${s.icon}</span>
      <span>${s.label.split(' ')[0]}</span>
      <span class="mt-slot-time">${s.start}</span>
    </div>`).join('');
}

// ════════════════════════════════════════════════════════════
//  ③ WIDGET VEILLE
// ════════════════════════════════════════════════════════════
async function loadVeilleWidget() {
  const c = $('veille-articles');
  if (!c) return;
  try {
    const res  = await fetch('/api/veille');
    const data = await res.json();
    if (!data.success) throw new Error();

    const articles = [];
    for (const cat of (data.categories || [])) {
      if (cat.articles?.length) {
        articles.push({ ...cat.articles[0], catColor: CAT_COLORS[cat.key] || '#58a6ff' });
      }
      if (articles.length >= 4) break;
    }
    if (!articles.length) throw new Error('Vide');

    c.innerHTML = `<div class="veille-feed">${articles.map(a => `
      <div class="vf-article" data-href="${escAttr(a.url)}" role="link" tabindex="0">
        <div class="vf-cat-dot" style="background:${a.catColor}"></div>
        <div class="vf-body">
          <div class="vf-source">${escHtml(a.sourceName || '—')}</div>
          <div class="vf-title">${escHtml(a.title)}</div>
          <div class="vf-time">${timeAgo(a.pubDate)}</div>
        </div>
      </div>`).join('')}</div>`;

    // Navigation PWA-safe (fix iOS standalone)
    c.querySelectorAll('[data-href]').forEach(el => {
      el.addEventListener('click', () => navigateExternal(el.dataset.href));
      el.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') navigateExternal(el.dataset.href);
      });
    });

    setStatus('sbar-server', 'ok', 'Serveur');
  } catch (err) {
    console.error('[Veille widget]', err.message);
    c.innerHTML = `<div class="veille-error">
      ⚠️ Serveur inaccessible — vérifie que <code>npm start</code> est lancé
      ou <a href="/veille.html" style="color:var(--a-veille)">ouvre la veille</a>
    </div>`;
    setStatus('sbar-server', 'error', 'Serveur HS');
  }
}

// ════════════════════════════════════════════════════════════
//  ④ WIDGET ANGLAIS
// ════════════════════════════════════════════════════════════
async function loadAnglaisWidget() {
  const c = $('anglais-preview');
  if (!c) return;
  try {
    const res  = await fetch('/api/anglais/random');
    const data = await res.json();
    if (!data.success) throw new Error();
    const ex = data.exercise;
    c.innerHTML = `
      <div class="anglais-card">
        <div class="ac-meta">
          <span class="ac-badge cat">${escHtml(ex.category)}</span>
          <span class="ac-badge diff">${escHtml(ex.difficulty)}</span>
        </div>
        <div class="ac-title">${escHtml(ex.title)}</div>
        <div class="ac-excerpt">${escHtml(ex.intro)}</div>
      </div>`;
  } catch {
    c.innerHTML = `<div class="anglais-card">
      <div class="ac-title">📚 8 exercices disponibles</div>
      <div class="ac-excerpt">REST · Promesses JS · JWT · Big O · XSS · SQL · PHP · WebSockets</div>
    </div>`;
  }
}

// ════════════════════════════════════════════════════════════
//  ⑤ WIDGET DÉFIS DEV
// ════════════════════════════════════════════════════════════
async function loadDefiWidget() {
  const c = $('defis-preview');
  if (!c) return;
  try {
    const res  = await fetch('/api/defis/random');
    const data = await res.json();
    if (!data.success) throw new Error();
    const d = data.defi;
    c.innerHTML = `
      <div class="defi-card">
        <div class="dc-header">
          <span class="dc-badge techno">${escHtml(d.techno)}</span>
          <span class="dc-badge ${d.niveau === 'Facile' ? 'niveau-facile' : 'niveau-moyen'}">${escHtml(d.niveau)}</span>
          <span class="dc-duration">⏱ ${escHtml(d.duree)}</span>
        </div>
        <div class="dc-title">${escHtml(d.titre)}</div>
        <div class="dc-objectif">${escHtml(d.objectif)}</div>
        <div class="dc-tags">${(d.tags || []).slice(0, 4)
          .map(t => `<span class="dc-tag">${escHtml(t)}</span>`).join('')}</div>
      </div>`;
  } catch {
    c.innerHTML = `<div class="defi-card">
      <div class="dc-title">⚡ 18 défis disponibles</div>
      <div class="dc-objectif">JS · React · TypeScript · PHP · SQL · Express · Angular · Symfony</div>
    </div>`;
  }
}

// ════════════════════════════════════════════════════════════
//  ⑥ BARRE STATUT SYSTÈME
// ════════════════════════════════════════════════════════════
function initStatusBar() {
  fetch('/api/status')
    .then(r => r.json())
    .then(d => {
      setStatus('sbar-server', 'ok', `Serveur v${d.version || '?'}`);
      const fs = $('footer-status');
      if (fs) { fs.textContent = `⬤ JAMES opérationnel`; fs.className = 'ok'; }
    })
    .catch(() => {
      setStatus('sbar-server', 'error', 'Serveur hors ligne');
      const fs = $('footer-status');
      if (fs) { fs.textContent = '⬤ Serveur inaccessible — relancer npm start'; fs.className = 'warn'; }
    });

  const standalone = window.navigator.standalone === true
    || window.matchMedia('(display-mode: standalone)').matches;
  setStatus('sbar-pwa', standalone ? 'ok' : 'warn', standalone ? 'PWA Active' : 'Navigateur');

  if ('Notification' in window) {
    const p = Notification.permission;
    setStatus('sbar-notif',
      p === 'granted' ? 'ok' : p === 'denied' ? 'error' : 'warn',
      p === 'granted' ? 'Alertes ON' : p === 'denied' ? 'Alertes bloquées' : 'Alertes OFF'
    );
  }
}

function setStatus(id, state, label) {
  const el = $(id);
  if (!el) return;
  el.className = `sbar-item ${state}`;
  const dot = el.querySelector('.sdot');
  // Remplacer le texte sans toucher au .sdot
  const last = el.lastChild;
  if (last && last.nodeType === 3) last.textContent = label;
  else el.appendChild(document.createTextNode(label));
  if (dot && state === 'ok') dot.classList.add('pulse');
  else if (dot) dot.classList.remove('pulse');
}

// ════════════════════════════════════════════════════════════
//  ⑦ BOUTON NOTIFICATIONS
// ════════════════════════════════════════════════════════════
function wireNotifBtn() {
  const btn = $('btn-notif');
  if (!btn) return;

  if ('Notification' in window && Notification.permission === 'default') {
    btn.style.display = '';
  }

  btn.addEventListener('click', async () => {
    const perm = await Notification.requestPermission();
    btn.style.display = 'none';
    if (perm === 'granted') {
      setStatus('sbar-notif', 'ok', 'Alertes ON');
      new Notification('JAMES 🤖', {
        body: 'Les alertes du planning sont activées.',
        icon: '/icons/icon-192x192.png',
      });
    } else {
      setStatus('sbar-notif', perm === 'denied' ? 'error' : 'warn',
        perm === 'denied' ? 'Alertes bloquées' : 'Alertes OFF');
    }
  });
}

// ════════════════════════════════════════════════════════════
//  UTILITAIRES
// ════════════════════════════════════════════════════════════

/** Navigation externe PWA-safe (corrige le blocage iOS standalone) */
function navigateExternal(url) {
  if (!url) return;
  const isStandalone = window.navigator.standalone === true
    || window.matchMedia('(display-mode: standalone)').matches;
  if (isStandalone) {
    const t = window.open(url, '_blank', 'noopener,noreferrer');
    if (!t) window.location.href = url;
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

function toMin(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}
function pad(n) { return String(n).padStart(2, '0'); }
function setText(id, val) { const el = $(id); if (el) el.textContent = val; }
function formatDur(min) {
  if (min <= 0) return '00:00';
  const h = Math.floor(min / 60), m = min % 60;
  return h > 0 ? `${h}h${pad(m)}` : `${pad(m)}:00`;
}
function timeAgo(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d)) return '';
  const diff = Math.round((Date.now() - d) / 60_000);
  if (diff < 2)  return 'à l\'instant';
  if (diff < 60) return `il y a ${diff} min`;
  const h = Math.round(diff / 60);
  if (h < 24) return `il y a ${h}h`;
  return `il y a ${Math.round(h / 24)}j`;
}
function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function escAttr(url) {
  if (!url) return '';
  try { const u = new URL(url); return ['http:','https:'].includes(u.protocol) ? url.replace(/"/g,'%22') : ''; }
  catch { return ''; }
}


// ── FLASHCARDS QUOTIDIENNES IA ────────────────────────────
async function loadDailyFlashcards() {
  const box = document.getElementById('daily-flashcards');
  if (!box || !window.AUTH?.isLoggedIn()) return;
  try {
    const res = await window.AUTH.apiFetch('/api/user/daily-flashcards');
    if (!res) return;
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    box.innerHTML = data.cards.map((c,i) => `<button class="flashcard" type="button" aria-expanded="false"><span class="fc-num">${i+1}</span><span class="fc-category">${escapeFlash(c.category)}</span><strong>${escapeFlash(c.question)}</strong><span class="fc-answer">${escapeFlash(c.answer)}</span><small>Cliquer pour retourner</small></button>`).join('');
    box.querySelectorAll('.flashcard').forEach(card => card.addEventListener('click', () => { card.classList.toggle('revealed'); card.setAttribute('aria-expanded', card.classList.contains('revealed') ? 'true' : 'false'); }));
  } catch (e) {
    box.innerHTML = `<div class="flashcard-error">⚠️ Flashcards indisponibles pour le moment. Les autres fonctions de JAMES restent accessibles.</div>`;
  }
}
function escapeFlash(v){return String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
document.addEventListener('DOMContentLoaded', loadDailyFlashcards);
