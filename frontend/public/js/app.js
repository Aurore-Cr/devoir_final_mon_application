// Vérifie que le backend répond
fetch('/api/status')
  .then(res => res.json())
  .then(data => {
    document.getElementById('status').textContent =
      `✅ Serveur connecté (v${data.version})`;
  })
  .catch(() => {
    document.getElementById('status').textContent =
      '⚠️ Serveur injoignable';
  });

// Navigation simple entre modules (à étoffer plus tard)
document.querySelectorAll('.module-card').forEach(card => {
  card.addEventListener('click', () => {
    const module = card.dataset.module;
    console.log(`Module sélectionné : ${module}`);
    // TODO: routing vers chaque module dans les prochaines étapes
  });
});

// Enregistrement du Service Worker (nécessaire pour l'installation PWA sur iOS 16.4+/iPhone 15)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then(() => console.log('Service Worker enregistré'))
      .catch(err => console.error('Erreur Service Worker :', err));
  });
}
