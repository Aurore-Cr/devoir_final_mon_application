// ============================================================
//  JAMES — Service Worker v4
//  Rôle : Cache offline + Moteur de notifications planifiées
// ============================================================

const CACHE_NAME = 'james-cache-v4';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/planner.html',
  '/veille.html',
  '/anglais.html',
  '/defis.html',
  '/flashcards.html',
  '/parametres.html',
  '/css/style.css',
  '/css/dashboard.css',
  '/css/planner.css',
  '/css/flashcards.css',
  '/css/parametres.css',
  '/js/auth.js',
  '/js/dashboard.js',
  '/js/planner.js',
  '/js/flashcards.js',
  '/js/parametres.js',
  '/manifest.json'
];

// ─── État interne du SW ────────────────────────────────────
let schedule = [];          // Planning injecté par le frontend
let firedAlerts = new Set();// Alertes déjà déclenchées (évite les doublons)
let tickerHandle = null;    // Handle du setInterval interne

// ─── INSTALL ───────────────────────────────────────────────
self.addEventListener('install', (event) => {
  console.log('[SW] Installation v4');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS_TO_CACHE))
      .then(() => self.skipWaiting()) // Activation immédiate sans reload
  );
});

// ─── ACTIVATE ──────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  console.log('[SW] Activation');
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => {
            console.log('[SW] Suppression ancien cache :', k);
            return caches.delete(k);
          })
      ))
      .then(() => self.clients.claim()) // Prise de contrôle immédiate de tous les onglets
  );
});

// ─── FETCH (Cache-first pour les assets, network-first pour l'API) ─
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Les appels API passent toujours par le réseau.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Les navigations HTML sont network-first pour éviter d'afficher une ancienne
  // version de JAMES après un déploiement ou une mise à jour du Service Worker.
  if (event.request.mode === 'navigate' || event.request.destination === 'document') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then(cached => cached || caches.match('/index.html')))
    );
    return;
  }

  // Assets : cache-first, puis réseau et mise à jour du cache.
  event.respondWith(
    caches.match(event.request)
      .then(cached => cached || fetch(event.request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
      )
  );
});

// ─── MESSAGE HANDLER ───────────────────────────────────────
// Canal de communication avec le frontend (planner.js)
self.addEventListener('message', (event) => {
  const { type, payload } = event.data;

  switch (type) {

    // Le frontend envoie le planning au démarrage
    case 'INIT_SCHEDULE':
      console.log('[SW] Planning reçu :', payload.schedule.length, 'tâches');
      schedule = payload.schedule;
      firedAlerts.clear();
      startTicker();
      // Accusé de réception au client émetteur
      event.source.postMessage({
        type: 'SW_READY',
        payload: { taskCount: schedule.length, time: new Date().toISOString() }
      });
      break;

    // Ping périodique du frontend pour garder le SW en vie sur iOS
    case 'KEEPALIVE':
      event.source.postMessage({
        type: 'SW_ALIVE',
        payload: { uptime: true, time: new Date().toISOString() }
      });
      break;

    // Réinitialiser les alertes déjà tirées (utile au changement de jour)
    case 'RESET_FIRED_ALERTS':
      firedAlerts.clear();
      console.log('[SW] Alertes réinitialisées');
      break;

    // Déclencher une notification manuelle depuis le frontend (test)
    case 'FORCE_NOTIFY':
      fireNotification(payload.endedTask, payload.nextTask);
      break;
  }
});

// ─── MOTEUR DE VÉRIFICATION ────────────────────────────────
function startTicker() {
  if (tickerHandle) {
    clearInterval(tickerHandle);
    console.log('[SW] Ancien ticker stoppé');
  }

  // Vérification toutes les 30 secondes
  // (compromis précision / consommation batterie)
  tickerHandle = setInterval(checkSchedule, 30_000);
  checkSchedule(); // Vérification immédiate au démarrage
  console.log('[SW] Ticker démarré (30s)');
}

function checkSchedule() {
  if (!schedule.length) return;

  const now   = new Date();
  const hh    = String(now.getHours()).padStart(2, '0');
  const mm    = String(now.getMinutes()).padStart(2, '0');
  const timeNow = `${hh}:${mm}`;

  schedule.forEach((slot, index) => {
    const alertKey = `${slot.end}::${slot.task}`;

    // L'heure de fin coïncide avec l'heure actuelle ET pas encore notifié
    if (slot.end === timeNow && !firedAlerts.has(alertKey)) {
      firedAlerts.add(alertKey);

      const next = schedule[index + 1];
      const nextTaskName = next ? next.task : '🌙 Fin de journée';

      console.log(`[SW] Transition détectée : ${slot.task} → ${nextTaskName}`);

      // 1. Notification native (push)
      fireNotification(slot.task, nextTaskName);

      // 2. Informer tous les onglets ouverts pour jouer le bip audio
      broadcastTransition(slot.task, nextTaskName);
    }
  });
}

// ─── NOTIFICATION PUSH NATIVE ──────────────────────────────
function fireNotification(endedTask, nextTask) {
  const title = '🤖 Ordre de JAMES';
  const body  = `Arrêtez "${endedTask}" — commencez "${nextTask}"`;

  return self.registration.showNotification(title, {
    body,
    icon        : '/icons/icon-192x192.png',
    badge       : '/icons/icon-192x192.png',
    // Vibration : 3 impulsions (Android / iPhone en silencieux)
    vibrate     : [400, 150, 400, 150, 600],
    // La notif reste visible jusqu'à interaction explicite
    requireInteraction: true,
    // Tag unique : une seule notif JAMES à la fois (remplace la précédente)
    tag         : 'james-transition',
    renotify    : true,
    data        : { endedTask, nextTask, url: '/planner.html' }
  });
}

// ─── BROADCAST AUX CLIENTS (pour audio) ───────────────────
function broadcastTransition(endedTask, nextTask) {
  self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    .then(clients => {
      clients.forEach(client => {
        client.postMessage({
          type: 'TASK_TRANSITION',
          payload: { endedTask, nextTask }
        });
      });
    });
}

// ─── CLIC SUR NOTIFICATION ────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  const targetUrl = event.notification.data?.url || '/planner.html';
  event.notification.close();

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clients => {
        // Si un onglet est déjà ouvert → focus
        const existing = clients.find(c => c.url.includes('/planner'));
        if (existing) return existing.focus();
        // Sinon → ouvrir le planner
        return self.clients.openWindow(targetUrl);
      })
  );
});

// ─── PUSH EVENT (pour future intégration Push API serveur) ─
self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || '🤖 JAMES', {
      body   : data.body || '',
      icon   : '/icons/icon-192x192.png',
      badge  : '/icons/icon-192x192.png',
      tag    : 'james-push'
    })
  );
});
