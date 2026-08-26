// ============================================================
//  JAMES — planner.js
//  Rôle : Cerveau frontend du Daily Planner
//         - Enregistrement & communication Service Worker
//         - Minuterie de garde (filet de secours iOS)
//         - Web Notification API
//         - Web Audio API (bip sonore)
//         - Rendu UI : planning, tâche courante, countdown
// ============================================================

'use strict';

// ─── PLANNING ─────────────────────────────────────────────
// Source de vérité des données. À terme : chargé depuis l'API.
const SCHEDULE = [
  { start: "10:30", end: "11:00", task: "Réveil, faire le lit, préparation petit-déj" },
  { start: "11:00", end: "11:30", task: "Petit-déj, paroxétine" },
  { start: "11:30", end: "12:00", task: "Pause digestion, préparation sport" },
  { start: "12:00", end: "12:30", task: "Sport — séance Pilates" },
  { start: "12:30", end: "12:45", task: "Sortir le chien" },
  { start: "12:45", end: "13:45", task: "Ménage, rangement" },
  { start: "13:45", end: "15:45", task: "Déjeuner et pause série / film" },
  { start: "15:45", end: "18:15", task: "Session dev web — Partie 1 (Pomodoro ×4 + pause 15 min)" },
  { start: "18:15", end: "18:45", task: "Goûter / collation" },
  { start: "18:45", end: "21:15", task: "Session dev web — Partie 2 (Pomodoro ×4 + pause 15 min)" },
  { start: "21:15", end: "22:15", task: "Dîner" },
  { start: "22:15", end: "00:15", task: "Temps libre et préparation au sommeil" },
];

// ─── ÉTAT LOCAL ───────────────────────────────────────────
let swRegistration  = null;  // Référence au SW enregistré
let guardInterval   = null;  // Minuterie de garde frontend (fallback iOS)
let keepaliveTimer  = null;  // Ping SW toutes les 20 s
let firedLocally    = new Set(); // Doublons côté frontend

// ─── POINT D'ENTRÉE ───────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  renderSchedule();
  startClock();
  await registerServiceWorker();
  await requestNotificationPermission();
  startGuardTimer();     // Minuterie frontend de secours
  startKeepalive();      // Keepalive SW (iOS)
  updateCurrentTask();   // Premier rendu immédiat
});

// ════════════════════════════════════════════════════════════
//  SERVICE WORKER
// ════════════════════════════════════════════════════════════

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    setStatus('sw', '❌ Service Worker non supporté', 'error');
    return;
  }

  try {
    swRegistration = await navigator.serviceWorker.register('/service-worker.js', {
      scope: '/'
    });
    console.log('[Planner] SW enregistré :', swRegistration.scope);
    setStatus('sw', '✅ Service Worker actif', 'ok');

    // Écouter les messages entrants depuis le SW
    navigator.serviceWorker.addEventListener('message', onSwMessage);

    // Attendre que le SW soit contrôleur effectif avant d'envoyer le planning
    await waitForSwController();
    sendScheduleToSw();

  } catch (err) {
    console.error('[Planner] Erreur SW :', err);
    setStatus('sw', '⚠️ SW : erreur d\'enregistrement', 'warn');
  }
}

/** Attend que navigator.serviceWorker.controller soit non-null */
function waitForSwController() {
  return new Promise(resolve => {
    if (navigator.serviceWorker.controller) {
      resolve();
      return;
    }
    // Le SW vient d'être installé → attendre l'événement controllerchange
    navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true });
    // Timeout de sécurité : 3 s
    setTimeout(resolve, 3000);
  });
}

/** Envoie le planning au SW */
function sendScheduleToSw() {
  if (!navigator.serviceWorker.controller) {
    console.warn('[Planner] Pas de contrôleur SW disponible');
    return;
  }
  navigator.serviceWorker.controller.postMessage({
    type: 'INIT_SCHEDULE',
    payload: { schedule: SCHEDULE }
  });
  console.log('[Planner] Planning envoyé au SW');
}

/** Ping périodique pour éviter que le SW soit tué par iOS */
function startKeepalive() {
  keepaliveTimer = setInterval(() => {
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'KEEPALIVE' });
    }
  }, 20_000);
}

/** Traitement des messages reçus du SW */
function onSwMessage(event) {
  const { type, payload } = event.data;

  switch (type) {
    case 'SW_READY':
      console.log('[Planner] SW prêt, tâches chargées :', payload.taskCount);
      setStatus('sw', `✅ SW actif — ${payload.taskCount} tâches planifiées`, 'ok');
      break;

    case 'SW_ALIVE':
      console.debug('[Planner] SW vivant à', payload.time);
      break;

    // Le SW détecte une transition → jouer le bip + afficher une alerte in-app
    case 'TASK_TRANSITION':
      console.log('[Planner] Transition reçue du SW :', payload);
      playAlertSound();
      showInAppAlert(payload.endedTask, payload.nextTask);
      updateCurrentTask();
      break;
  }
}

// ════════════════════════════════════════════════════════════
//  MINUTERIE DE GARDE — Frontend (filet de secours iOS)
// ════════════════════════════════════════════════════════════

/** Vérifie toutes les 30 s si une transition doit être déclenchée.
 *  Prend le relais quand Safari a tué le SW en arrière-plan.
 *  Utilise firedLocally pour ne pas doubler les alertes du SW.
 */
function startGuardTimer() {
  if (guardInterval) clearInterval(guardInterval);
  guardInterval = setInterval(guardCheck, 30_000);
  guardCheck(); // Vérification immédiate
}

function guardCheck() {
  const now = getCurrentTimeString();

  SCHEDULE.forEach((slot, index) => {
    const key = `${slot.end}::${slot.task}`;
    if (slot.end === now && !firedLocally.has(key)) {
      firedLocally.add(key);

      const next = SCHEDULE[index + 1];
      const nextTask = next ? next.task : '🌙 Fin de journée';

      console.log(`[Guard] Transition locale : ${slot.task} → ${nextTask}`);

      // Déclenchements locaux (le SW s'en charge aussi, mais en secours)
      playAlertSound();
      showInAppAlert(slot.task, nextTask);
      showFallbackNotification(slot.task, nextTask);
      updateCurrentTask();
    }
  });
}

// ════════════════════════════════════════════════════════════
//  WEB NOTIFICATION API
// ════════════════════════════════════════════════════════════

async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    setStatus('notif', '❌ Notifications non supportées', 'error');
    return;
  }

  if (Notification.permission === 'granted') {
    setStatus('notif', '✅ Notifications activées', 'ok');
    return;
  }

  if (Notification.permission === 'denied') {
    setStatus('notif', '🚫 Notifications bloquées — vérifiez les réglages', 'error');
    return;
  }

  // Demande l'autorisation (requiert un geste utilisateur sur iOS)
  const btn = document.getElementById('btn-notif');
  if (btn) {
    btn.style.display = 'flex';
    btn.addEventListener('click', async () => {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        setStatus('notif', '✅ Notifications activées', 'ok');
        btn.style.display = 'none';
        sendScheduleToSw(); // Re-envoyer après accord
      } else {
        setStatus('notif', '🚫 Permission refusée', 'error');
      }
    }, { once: true });
  }
}

/** Notification de secours via l'API Notification directe (fallback si SW échoue) */
function showFallbackNotification(endedTask, nextTask) {
  if (Notification.permission !== 'granted') return;
  // Éviter le doublon si le SW a déjà tiré la notif
  // On utilise un délai de 2 s : si le SW répond sous 2 s, cette notif n'est pas envoyée
  const timer = setTimeout(() => {
    new Notification('🤖 Ordre de JAMES', {
      body: `Arrêtez "${endedTask}" — commencez "${nextTask}"`,
      icon: '/icons/icon-192x192.png',
      tag : 'james-fallback'
    });
  }, 2000);

  // Annuler si le SW répond en temps voulu
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data.type === 'TASK_TRANSITION') clearTimeout(timer);
  }, { once: true });
}

// ════════════════════════════════════════════════════════════
//  WEB AUDIO API — Bip d'alerte
// ════════════════════════════════════════════════════════════

/**
 * Génère une séquence de 3 bips nets (880 Hz → 1100 Hz → 880 Hz)
 * via un oscillateur synthétisé — aucun fichier audio requis.
 */
function playAlertSound() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;

    const ctx = new AudioContext();

    // Reprendre le contexte audio si suspendu (politique autoplay iOS)
    if (ctx.state === 'suspended') ctx.resume();

    const BEEPS = [
      { freq: 880,  start: 0.00, duration: 0.18 },
      { freq: 1100, start: 0.25, duration: 0.18 },
      { freq: 880,  start: 0.50, duration: 0.28 },
    ];

    BEEPS.forEach(({ freq, start, duration }) => {
      const osc    = ctx.createOscillator();
      const gain   = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type      = 'sine';
      osc.frequency.value = freq;

      const t0 = ctx.currentTime + start;
      // Envelope : attaque rapide, release douce
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.6, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);

      osc.start(t0);
      osc.stop(t0 + duration + 0.05);
    });

    // Fermer le contexte après la séquence
    setTimeout(() => ctx.close(), 1500);

  } catch (err) {
    console.warn('[Audio] Erreur bip :', err);
  }
}

// ════════════════════════════════════════════════════════════
//  UI — RENDU ET MISE À JOUR
// ════════════════════════════════════════════════════════════

/** Affiche une bannière d'alerte en haut de la page */
function showInAppAlert(endedTask, nextTask) {
  const banner = document.getElementById('alert-banner');
  const msg    = document.getElementById('alert-message');
  if (!banner || !msg) return;

  msg.textContent = `Arrêtez "${endedTask}" — commencez "${nextTask}"`;
  banner.classList.add('visible');

  // Disparaît automatiquement après 12 s
  setTimeout(() => banner.classList.remove('visible'), 12_000);

  banner.querySelector('#alert-close')?.addEventListener('click', () => {
    banner.classList.remove('visible');
  }, { once: true });
}

/** Génère la liste complète du planning dans le DOM */
function renderSchedule() {
  const list = document.getElementById('schedule-list');
  if (!list) return;

  list.innerHTML = SCHEDULE.map((slot, i) => `
    <li class="schedule-item" data-index="${i}" id="slot-${i}">
      <span class="slot-time">${slot.start} – ${slot.end}</span>
      <span class="slot-task">${slot.task}</span>
      <span class="slot-duration">${getDuration(slot.start, slot.end)}</span>
    </li>
  `).join('');
}

/** Met à jour le bloc "Tâche actuelle / suivante" et surbrillance */
function updateCurrentTask() {
  const now = getCurrentTimeString();
  let currentIndex = -1;

  SCHEDULE.forEach((slot, i) => {
    const active = isTimeInSlot(now, slot.start, slot.end);
    const li = document.getElementById(`slot-${i}`);
    if (li) {
      li.classList.toggle('active', active);
      li.classList.toggle('past', !active && slot.end <= now);
    }
    if (active) currentIndex = i;
  });

  const currentSlot = SCHEDULE[currentIndex];
  const nextSlot    = SCHEDULE[currentIndex + 1];

  setTaskCard('current-task',
    currentSlot ? currentSlot.task : '—',
    currentSlot ? `jusqu'à ${currentSlot.end}` : ''
  );

  setTaskCard('next-task',
    nextSlot ? nextSlot.task : '🌙 Fin de journée',
    nextSlot ? `à ${nextSlot.start}` : ''
  );

  // Scroll automatique vers la tâche active
  if (currentIndex >= 0) {
    document.getElementById(`slot-${currentIndex}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function setTaskCard(id, taskName, subtext) {
  const el = document.getElementById(id);
  if (!el) return;
  el.querySelector('.task-name').textContent  = taskName;
  el.querySelector('.task-sub').textContent   = subtext;
}

/** Horloge en temps réel + countdown vers la prochaine transition */
function startClock() {
  function tick() {
    const now = new Date();
    const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    const el = document.getElementById('clock');
    if (el) el.textContent = timeStr;

    updateCountdown(now);

    // Mise à jour de la tâche courante toutes les minutes pile
    if (now.getSeconds() === 0) updateCurrentTask();
  }
  tick();
  setInterval(tick, 1000);
}

function updateCountdown(now) {
  const timeNow = getCurrentTimeString(now);
  const el = document.getElementById('countdown');
  if (!el) return;

  // Trouver la prochaine fin de tâche
  const next = SCHEDULE.find(slot =>
    isTimeInSlot(timeNow, slot.start, slot.end)
  );

  if (!next) {
    el.textContent = '—';
    return;
  }

  const [endH, endM]  = next.end.split(':').map(Number);
  const endDate       = new Date(now);
  endDate.setHours(endH, endM, 0, 0);

  // Si l'heure de fin est demain (ex: 00:15)
  if (endDate <= now) endDate.setDate(endDate.getDate() + 1);

  const diffSec  = Math.round((endDate - now) / 1000);
  const hh       = Math.floor(diffSec / 3600);
  const mm       = Math.floor((diffSec % 3600) / 60);
  const ss       = diffSec % 60;

  el.textContent = hh > 0
    ? `${pad(hh)}h ${pad(mm)}m ${pad(ss)}s`
    : `${pad(mm)}m ${pad(ss)}s`;
}

// ─── Bouton de test notification + bip ────────────────────
window.testAlert = function () {
  playAlertSound();
  showInAppAlert('Tâche de test', 'Prochaine tâche de test');
  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'FORCE_NOTIFY',
      payload: { endedTask: 'Tâche de test', nextTask: 'Prochaine tâche de test' }
    });
  }
};

// ─── Utilitaires ──────────────────────────────────────────
function getCurrentTimeString(date = new Date()) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function pad(n) { return String(n).padStart(2, '0'); }

function isTimeInSlot(now, start, end) {
  // Gère le cas où end < start (ex: 22:15 → 00:15)
  if (end < start) return now >= start || now < end;
  return now >= start && now < end;
}

function getDuration(start, end) {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let diffMin = (eh * 60 + em) - (sh * 60 + sm);
  if (diffMin < 0) diffMin += 24 * 60; // Minuit
  if (diffMin >= 60) return `${Math.floor(diffMin / 60)}h${diffMin % 60 > 0 ? pad(diffMin % 60) : ''}`;
  return `${diffMin} min`;
}

function setStatus(type, text, level) {
  const id = type === 'sw' ? 'status-sw' : 'status-notif';
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent  = text;
  el.className    = `status-badge ${level}`;
}
