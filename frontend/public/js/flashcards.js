'use strict';

if (!window.AUTH || !AUTH.requireLogin()) {
  // AUTH.requireLogin gère la redirection.
} else {
  const esc = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  function categoryOf(card) {
    const raw = String(card.category || '').toLowerCase();
    return raw.includes('business') || raw.includes('english') || raw.includes('anglais')
      ? 'business'
      : 'dev';
  }

  function renderCards(targetId, cards, label) {
    const target = document.getElementById(targetId);
    if (!cards.length) {
      target.innerHTML = `<div class="empty-card">Aucune flashcard ${esc(label)} disponible aujourd'hui.</div>`;
      return;
    }
    target.innerHTML = cards.map((card, index) => `
      <button class="study-card" type="button" aria-expanded="false">
        <span class="number">#${index + 1}</span>
        <span class="kind">${esc(card.category || label)}</span>
        <strong class="question">${esc(card.question)}</strong>
        <span class="answer">${esc(card.answer)}</span>
        <small class="hint">Cliquer pour révéler la réponse</small>
      </button>
    `).join('');

    target.querySelectorAll('.study-card').forEach(card => {
      card.addEventListener('click', () => {
        card.classList.toggle('revealed');
        const open = card.classList.contains('revealed');
        card.setAttribute('aria-expanded', open ? 'true' : 'false');
        card.querySelector('.hint').textContent = open ? 'Cliquer pour revoir la question' : 'Cliquer pour révéler la réponse';
      });
    });
  }

  async function loadFlashcards() {
    const status = document.getElementById('flash-status');
    status.className = 'flash-status';
    status.textContent = 'Chargement des flashcards du jour…';
    try {
      const res = await AUTH.apiFetch('/api/user/daily-flashcards');
      if (!res) return;
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Réponse API invalide');

      const cards = Array.isArray(data.cards) ? data.cards : [];
      const dev = cards.filter(card => categoryOf(card) === 'dev');
      const business = cards.filter(card => categoryOf(card) === 'business');

      renderCards('dev-flashcards', dev, 'Développement web');
      renderCards('business-flashcards', business, 'Business English');
      document.getElementById('dev-count').textContent = `${dev.length}/3`;
      document.getElementById('business-count').textContent = `${business.length}/3`;
      document.getElementById('flash-day').textContent = new Intl.DateTimeFormat('fr-FR', { weekday:'long', day:'numeric', month:'long' }).format(new Date());
      status.textContent = `${cards.length} flashcards prêtes pour aujourd'hui.`;
      status.classList.add('ok');
    } catch (error) {
      console.error('[Flashcards]', error);
      document.getElementById('dev-flashcards').innerHTML = '<div class="empty-card">Flashcards indisponibles.</div>';
      document.getElementById('business-flashcards').innerHTML = '<div class="empty-card">Flashcards indisponibles.</div>';
      status.textContent = 'Impossible de charger les flashcards. Vérifie que le serveur et Gemini sont opérationnels.';
      status.classList.add('error');
    }
  }

  document.getElementById('btn-reload').addEventListener('click', loadFlashcards);
  document.addEventListener('DOMContentLoaded', loadFlashcards);
}
