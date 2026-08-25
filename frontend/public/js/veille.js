'use strict';

// ============================================================
//  JARVIS — veille.js
//  Rôle : Consomme /api/veille et rend le rapport dans l'UI
//
//  États UI gérés :
//    loading  → squelette animé
//    error    → message d'erreur + bouton retry
//    content  → cartes d'articles par catégorie
// ============================================================

// ─── ÉLÉMENTS DOM ─────────────────────────────────────────
const $ = id => document.getElementById(id);
const elLoading  = $('state-loading');
const elError    = $('state-error');
const elContent  = $('veille-content');
const elFooter   = $('veille-footer');
const elIntro    = $('rapport-intro');
const elDate     = $('report-date');
const elDesc     = $('intro-desc');
const elErrMsg   = $('error-msg');
const elFootInfo = $('footer-info');
const btnRefresh = $('btn-refresh');
const refreshIcon = $('refresh-icon');

// ─── ÉTAT LOCAL ───────────────────────────────────────────
let isLoading = false;

// ─── POINT D'ENTRÉE ───────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadVeille(false);
  btnRefresh.addEventListener('click', () => loadVeille(true));
});

// ════════════════════════════════════════════════════════════
//  CHARGEMENT PRINCIPAL
// ════════════════════════════════════════════════════════════

/**
 * Charge le rapport de veille depuis l'API backend.
 * @param {boolean} forceRefresh - Bypasser le cache serveur (bouton actualiser)
 */
async function loadVeille(forceRefresh = false) {
  if (isLoading) return;
  isLoading = true;

  setState('loading');
  setRefreshSpinning(true);

  try {
    const url = forceRefresh ? '/api/veille?refresh=true' : '/api/veille';
    const res  = await fetch(url);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Erreur HTTP ${res.status}`);
    }

    const report = await res.json();
    if (!report.success) throw new Error(report.error || 'Réponse invalide');

    renderReport(report);
    setState('content');

  } catch (err) {
    console.error('[Veille] Erreur :', err);
    elErrMsg.textContent = err.message || 'Impossible de charger les actualités.';
    setState('error');
  } finally {
    isLoading = false;
    setRefreshSpinning(false);
  }
}

// ════════════════════════════════════════════════════════════
//  RENDU UI
// ════════════════════════════════════════════════════════════

function renderReport(report) {
  // ─ Bandeau d'intro
  const genDate = new Date(report.generatedAt);
  elDate.textContent  = formatDateFr(genDate);

  const totalArticles = report.categories.reduce((s, c) => s + c.articles.length, 0);
  elDesc.textContent  =
    `${totalArticles} article${totalArticles > 1 ? 's' : ''} sélectionnés dans ${report.categories.length} domaines • mis à jour en ${report.duration}`;

  // ─ Contenu principal : une section par catégorie
  elContent.innerHTML = report.categories
    .map(cat => renderCategory(cat))
    .join('');

  // ─ Footer
  elFootInfo.textContent =
    `Données récupérées le ${formatDateFr(genDate)} — Cache serveur 1h`;

  elIntro.style.display = '';
  elFooter.style.display = '';

  // ── Event delegation ────────────────────────────────────
  // Écoute les clics sur le container plutôt que sur chaque lien.
  // window.open() à l'intérieur d'un handler de clic utilisateur
  // n'est PAS bloqué par les bloqueurs de popups (contrairement à
  // target="_blank" en mode PWA standalone iOS).
  // On retire l'ancien listener avant d'en attacher un nouveau
  // pour éviter les doublons si l'utilisateur clique sur "Actualiser".
  elContent.removeEventListener('click',   handleCardClick);
  elContent.removeEventListener('keydown', handleCardKeydown);
  elContent.addEventListener('click',   handleCardClick);
  elContent.addEventListener('keydown', handleCardKeydown);
}

/** Génère le HTML d'une catégorie avec ses articles */
function renderCategory(cat) {
  if (!cat.articles.length) {
    return `
      <section class="category-section">
        <h2 class="category-title" style="--cat-color:${cat.color}">
          <span class="cat-emoji">${cat.emoji}</span>${cat.label}
        </h2>
        <p class="no-articles">Aucun article disponible pour cette catégorie.</p>
      </section>`;
  }

  const cards = cat.articles.map(article => renderArticleCard(article, cat)).join('');

  return `
    <section class="category-section" data-category="${cat.key}">
      <h2 class="category-title" style="--cat-color:${cat.color}">
        <span class="cat-emoji">${cat.emoji}</span>
        ${escHtml(cat.label)}
        <span class="cat-count">${cat.articles.length}</span>
      </h2>
      <div class="articles-grid">${cards}</div>
    </section>`;
}

/** Génère le HTML d'une carte article */
function renderArticleCard(article, cat) {
  const timeAgo  = formatTimeAgo(article.pubDate);
  const scoreBar = Math.min(100, article.score);
  const domain   = extractDomain(article.url);

  // ↓ validateUrl() garantit une URL http(s) propre, sans HTML-encoding
  //   qui casserait getAttribute('data-href') sur les data-attributes.
  const safeUrl  = validateUrl(article.url);

  return `
    <article class="article-card"
             style="--cat-color:${cat.color}"
             data-href="${safeUrl}"
             role="link"
             tabindex="0"
             aria-label="${escAttr(article.title)}">

      <!-- L'<a> reste pour l'accessibilité (right-click → "Ouvrir le lien")
           mais la navigation est gérée par le listener JS pour contourner
           le blocage de target="_blank" en mode PWA standalone iOS. -->
      <a href="${safeUrl}"
         class="card-link"
         tabindex="-1"
         aria-hidden="true">

        <header class="card-header">
          <span class="source-badge" style="--cat-color:${cat.color}">
            ${escHtml(article.sourceName)}
          </span>
          <time class="card-time" datetime="${escAttr(article.pubDate || '')}">
            ${escHtml(timeAgo)}
          </time>
        </header>

        <h3 class="card-title">${escHtml(article.title)}</h3>

        ${article.summary
          ? `<p class="card-summary">${escHtml(article.summary)}</p>`
          : ''}

        <footer class="card-footer">
          <span class="card-domain">↗ ${escHtml(domain)}</span>
          <div class="relevance-bar" title="Score de pertinence : ${scoreBar}/100">
            <div class="relevance-fill" style="width:${scoreBar}%; background:${cat.color}"></div>
          </div>
        </footer>
      </a>
    </article>`;
}

// ════════════════════════════════════════════════════════════
//  NAVIGATION PAR DÉLÉGATION (clic + clavier)
// ════════════════════════════════════════════════════════════

/**
 * Ouvre l'URL de la carte cliquée dans un nouvel onglet.
 * window.open() dans un handler de clic direct = jamais bloqué,
 * même en mode PWA standalone sur iOS Safari.
 */
function handleCardClick(e) {
  // Remonter jusqu'à l'article portant data-href
  const card = e.target.closest('[data-href]');
  if (!card) return;

  const url = card.dataset.href;
  if (!url) return;

  // Ne pas interférer avec Ctrl+clic / Cmd+clic (ouvrir dans un nouvel onglet natif)
  if (e.ctrlKey || e.metaKey || e.shiftKey) return;

  e.preventDefault();
  openArticle(url);
}

/** Accessibilité clavier : Entrée ou Espace sur une carte = navigation */
function handleCardKeydown(e) {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const card = e.target.closest('[data-href]');
  if (!card) return;

  const url = card.dataset.href;
  if (!url) return;

  e.preventDefault();
  openArticle(url);
}

/**
 * Ouvre une URL de façon compatible PWA iOS + desktop.
 * Détecte le mode standalone pour adapter la stratégie.
 */
function openArticle(url) {
  // Détection PWA standalone (iOS: navigator.standalone, autres: matchMedia)
  const isStandalone =
    window.navigator.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;

  if (isStandalone) {
    // En PWA standalone, target="_blank" est bloqué sur iOS.
    // window.open() dans un handler de clic utilisateur fonctionne.
    const tab = window.open(url, '_blank', 'noopener,noreferrer');
    if (!tab) {
      // Fallback si window.open échoue malgré tout (rare) :
      // ouvrir dans la même fenêtre PWA plutôt que rien.
      window.location.href = url;
    }
  } else {
    // Mode navigateur standard : window.open fonctionne nativement
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

// ════════════════════════════════════════════════════════════
//  GESTION DES ÉTATS
// ════════════════════════════════════════════════════════════

function setState(state) {
  elLoading.style.display = state === 'loading' ? '' : 'none';
  elError.style.display   = state === 'error'   ? '' : 'none';
  elContent.style.display = state === 'content' ? '' : 'none';
  if (state !== 'content') {
    elIntro.style.display  = 'none';
    elFooter.style.display = 'none';
  }
}

function setRefreshSpinning(spin) {
  refreshIcon.style.animation = spin ? 'spin 0.8s linear infinite' : 'none';
  btnRefresh.disabled         = spin;
}

// ════════════════════════════════════════════════════════════
//  UTILITAIRES
// ════════════════════════════════════════════════════════════

/** Formate une date en français : "Vendredi 4 juillet 2025, 07h12" */
function formatDateFr(date) {
  if (!(date instanceof Date) || isNaN(date)) return '—';
  return date.toLocaleString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

/** Retourne un libellé relatif : "il y a 3h", "hier", etc. */
function formatTimeAgo(dateStr) {
  if (!dateStr) return 'Date inconnue';
  const date = new Date(dateStr);
  if (isNaN(date)) return 'Date inconnue';

  const diffMin = Math.round((Date.now() - date) / 60_000);

  if (diffMin < 2)   return 'À l\'instant';
  if (diffMin < 60)  return `il y a ${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24)    return `il y a ${diffH}h`;
  const diffD = Math.round(diffH / 24);
  if (diffD === 1)   return 'hier';
  if (diffD < 7)     return `il y a ${diffD} jours`;
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

/** Extrait le domaine d'une URL pour l'affichage */
function extractDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url || '—';
  }
}

/**
 * Valide et retourne une URL http(s) propre, ou '' si invalide.
 * Ne fait PAS de HTML-encoding : utilisé dans data-href et href,
 * où le navigateur gère lui-même l'encodage des caractères spéciaux.
 */
function validateUrl(url) {
  if (!url || typeof url !== 'string') return '';
  try {
    const u = new URL(url.trim());
    // Rejeter tout protocole qui ne soit pas http(s) (ex: javascript:)
    if (!['http:', 'https:'].includes(u.protocol)) return '';
    return u.href; // URL normalisée par le constructeur URL
  } catch {
    return '';
  }
}

/** Échappe les caractères HTML (XSS) */
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Échappe pour usage dans un attribut HTML */
function escAttr(str) {
  return escHtml(str || '');
}
