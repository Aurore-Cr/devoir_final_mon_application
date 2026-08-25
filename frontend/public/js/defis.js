'use strict';

// ============================================================
//  JARVIS — defis.js
//
//  States :
//    landing   → catalogue + filtres + CTA
//    defi      → énoncé + contraintes + timer
//    solution  → méthodologie + code + explications + éval
//
//  Session mémoire volatile :
//    seenIds, score { done, success }, filters { techno, niveau }
// ============================================================

// ─── SÉLECTEURS ───────────────────────────────────────────
const $ = id => document.getElementById(id);

const views = {
  landing  : $('view-landing'),
  defi     : $('view-defi'),
  solution : $('view-solution'),
};

// Landing
const elTechnoGrid    = $('techno-grid');
const elTechnoChips   = $('techno-chips');
const elNiveauChips   = $('niveau-chips');
const elCtaSub        = $('cta-sub');
const elCatalogGrid   = $('catalog-grid');
const elCatalogLabel  = $('catalog-label');
const elLandingError  = $('landing-error');
const btnGenerate     = $('btn-generate');
const btnHeaderRandom = $('btn-header-random');

// Défi
const elDTechno       = $('d-techno');
const elDNiveau       = $('d-niveau');
const elDDuration     = $('d-duration');
const elDTags         = $('d-tags');
const elDTitle        = $('d-title');
const elDObjectif     = $('d-objectif');
const elDEnonce       = $('d-enonce');
const elDContraintes  = $('d-contraintes');
const elDRessources   = $('d-ressources');
const elDDuree        = $('d-duree');
const btnReveal       = $('btn-reveal-solution');
const btnSkip         = $('btn-skip-defi');

// Timer
const elTimerDisplay  = $('timer-display');
const btnTimerStart   = $('btn-timer-start');
const btnTimerReset   = $('btn-timer-reset');

// Solution
const elSMethodo      = $('s-methodologie');
const elSCode         = $('s-code');
const elSLangBadge    = $('s-lang-badge');
const elSExplications = $('s-explications');
const btnCopySol      = $('btn-copy-solution');
const btnNextDefi     = $('btn-next-defi');
const btnBackLanding  = $('btn-back-landing');

// Stats
const elStatDone      = $('stat-done');
const elStatSuccess   = $('stat-success');
const elStatRemaining = $('stat-remaining');
const elSessionBar    = $('session-bar');

// Loader
const elLoader        = $('global-loader');

// ─── SESSION ──────────────────────────────────────────────
const session = {
  seenIds     : new Set(),
  done        : 0,
  success     : 0,
  totalCount  : 0,
  currentDefi : null,
  allMeta     : [],
  filters     : { techno: '', niveau: '' },
  timerInterval : null,
  timerSeconds  : 0,
  timerRunning  : false,
};

// ─── COULEURS PAR TECHNO ──────────────────────────────────
const TECHNO_COLORS = {
  'JavaScript' : '#f0db4f',
  'TypeScript' : '#3178c6',
  'React'      : '#61dafb',
  'Angular'    : '#dd1b16',
  'Express'    : '#68a063',
  'HTML/CSS'   : '#e34c26',
  'MySQL'      : '#00758f',
  'PHP'        : '#8892be',
  'Symfony'    : '#1a171b',
};

const TECHNO_ICONS = {
  'JavaScript' : '☀️',
  'TypeScript' : '🔷',
  'React'      : '⚛️',
  'Angular'    : '🔺',
  'Express'    : '🚂',
  'HTML/CSS'   : '🎨',
  'MySQL'      : '🗄️',
  'PHP'        : '🐘',
  'Symfony'    : '🎼',
};

// ════════════════════════════════════════════════════════════
//  INITIALISATION
// ════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async () => {
  await loadCatalog();
  wireEvents();
});

async function loadCatalog() {
  showLoader(true);
  try {
    const [statsRes, metaRes] = await Promise.all([
      fetch('/api/defis/stats'),
      fetch('/api/defis'),
    ]);

    const stats = await statsRes.json();
    const meta  = await metaRes.json();

    if (!stats.success || !meta.success) throw new Error('Données invalides');

    session.totalCount = stats.total;
    session.allMeta    = meta.defis;

    renderTechnoGrid(stats.byTechno);
    renderTechnoChips(stats.technos);
    renderCatalog();

  } catch (err) {
    console.error('[Défis] loadCatalog :', err);
    elLandingError.style.display = '';
  } finally {
    showLoader(false);
  }
}

// ════════════════════════════════════════════════════════════
//  LANDING — RENDU
// ════════════════════════════════════════════════════════════

function renderTechnoGrid(byTechno) {
  elTechnoGrid.innerHTML = byTechno.map(t => `
    <button class="techno-card" data-techno="${escHtml(t.techno)}"
            style="--tc:${TECHNO_COLORS[t.techno] || '#58a6ff'}">
      <span class="tc-icon">${TECHNO_ICONS[t.techno] || '💻'}</span>
      <span class="tc-name">${escHtml(t.techno)}</span>
      <span class="tc-count">${t.count}</span>
      <div class="tc-bar">
        <span class="tc-facile" style="width:${t.facile / t.count * 100}%"></span>
      </div>
    </button>
  `).join('');

  // Clic sur une techno-card → filtre + scroll
  elTechnoGrid.addEventListener('click', e => {
    const card = e.target.closest('.techno-card');
    if (!card) return;
    const techno = card.dataset.techno;
    setFilter('techno', techno === session.filters.techno ? '' : techno);
    document.querySelector('.filters-row').scrollIntoView({ behavior: 'smooth' });
  });
}

function renderTechnoChips(technos) {
  technos.forEach(t => {
    const btn = document.createElement('button');
    btn.className       = 'chip';
    btn.dataset.techno  = t;
    btn.innerHTML       = `${TECHNO_ICONS[t] || ''} ${t}`;
    elTechnoChips.appendChild(btn);
  });
}

function renderCatalog() {
  const { techno, niveau } = session.filters;
  const filtered = session.allMeta.filter(d => {
    if (techno && d.techno !== techno) return false;
    if (niveau && d.niveau !== niveau) return false;
    return true;
  });

  const available = filtered.filter(d => !session.seenIds.has(d.id));
  elCtaSub.textContent  = `${available.length} défi${available.length > 1 ? 's' : ''} disponible${available.length > 1 ? 's' : ''}`;
  elCatalogLabel.textContent = `${filtered.length} défi${filtered.length > 1 ? 's' : ''} (${available.length} non faits)`;

  elCatalogGrid.innerHTML = filtered.map(d => {
    const done  = session.seenIds.has(d.id);
    const color = TECHNO_COLORS[d.techno] || '#58a6ff';
    return `
      <div class="catalog-card ${done ? 'done' : ''}"
           data-id="${d.id}"
           style="--tc:${color}">
        <div class="cc-header">
          <span class="cc-techno">${TECHNO_ICONS[d.techno] || '💻'} ${escHtml(d.techno)}</span>
          <span class="cc-niveau ${d.niveau.toLowerCase()}">${d.niveau}</span>
          ${done ? '<span class="cc-done">✓</span>' : ''}
        </div>
        <p class="cc-titre">${escHtml(d.titre)}</p>
        <p class="cc-duration">⏱ ${escHtml(d.duree)}</p>
        <div class="cc-tags">
          ${(d.tags || []).slice(0, 3).map(t => `<span class="micro-tag">${escHtml(t)}</span>`).join('')}
        </div>
      </div>`;
  }).join('');

  elCatalogGrid.querySelectorAll('.catalog-card').forEach(card => {
    card.addEventListener('click', () => loadDefiById(card.dataset.id));
  });
}

// ════════════════════════════════════════════════════════════
//  FILTRES
// ════════════════════════════════════════════════════════════

function setFilter(type, value) {
  session.filters[type] = value;

  // Sync chips
  document.querySelectorAll(`[data-${type}]`).forEach(el => {
    el.classList.toggle('active', (el.dataset[type] || '') === value);
  });

  // Sync techno-cards
  elTechnoGrid.querySelectorAll('.techno-card').forEach(card => {
    card.classList.toggle('selected', card.dataset.techno === value);
  });

  renderCatalog();
}

// ════════════════════════════════════════════════════════════
//  CÂBLAGE DES ÉVÉNEMENTS
// ════════════════════════════════════════════════════════════

function wireEvents() {
  // CTAs génération
  btnGenerate.addEventListener('click', loadRandomDefi);
  btnHeaderRandom.addEventListener('click', loadRandomDefi);
  btnSkip.addEventListener('click', loadRandomDefi);
  btnNextDefi.addEventListener('click', loadRandomDefi);

  // Génération IA
  const btnIA = $('btn-generate-ia');
  if (btnIA) btnIA.addEventListener('click', generateWithIA);

  // Navigation
  btnReveal.addEventListener('click', revealSolution);
  btnBackLanding.addEventListener('click', () => {
    stopTimer();
    showView('landing');
    renderCatalog(); // rafraîchir les badges "Fait"
  });

  // Filtres chips techno
  elTechnoChips.addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    setFilter('techno', chip.dataset.techno || '');
  });

  // Filtres chips niveau
  elNiveauChips.addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    setFilter('niveau', chip.dataset.niveau || '');
  });

  // Timer
  btnTimerStart.addEventListener('click', toggleTimer);
  btnTimerReset.addEventListener('click', resetTimer);

  // Copier solution
  btnCopySol.addEventListener('click', () => {
    const code = elSCode.textContent;
    navigator.clipboard.writeText(code).then(() => {
      btnCopySol.textContent = '✅ Copié !';
      setTimeout(() => { btnCopySol.textContent = '📋 Copier'; }, 2000);
    });
  });

  // Auto-évaluation
  $('eval-section')?.addEventListener('click', e => handleEval(e));
  document.addEventListener('click', e => {
    if (e.target.closest('.eval-btn')) handleEval(e);
  });
}

function handleEval(e) {
  const btn = e.target.closest('.eval-btn');
  if (!btn) return;

  // Désactiver tous les boutons d'éval
  document.querySelectorAll('.eval-btn').forEach(b => {
    b.classList.remove('selected');
    b.disabled = true;
  });
  btn.classList.add('selected');

  const score = parseInt(btn.dataset.score, 10);
  session.done++;
  if (score === 2) session.success++;

  if (session.currentDefi) session.seenIds.add(session.currentDefi.id);
  updateSessionBar();
  stopTimer();
}

// ════════════════════════════════════════════════════════════
//  CHARGEMENT D'UN DÉFI
// ════════════════════════════════════════════════════════════

async function loadRandomDefi() {
  showLoader(true);
  scrollTop();
  stopTimer();
  resetTimer();

  try {
    const params = new URLSearchParams();
    if (session.filters.techno) params.set('techno', session.filters.techno);
    if (session.filters.niveau) params.set('niveau', session.filters.niveau);
    if (session.seenIds.size > 0) params.set('exclude', [...session.seenIds].join(','));

    const url = '/api/defis/random' + (params.toString() ? '?' + params : '');
    const res  = await fetch(url);
    const data = await res.json();

    if (!data.success) throw new Error(data.error || 'Erreur serveur');

    renderDefi(data.defi);
    showView('defi');
    btnHeaderRandom.style.display = '';
    elSessionBar.style.display    = '';

  } catch (err) {
    console.error('[Défis] random :', err);
    alert('Impossible de charger un défi : ' + err.message);
  } finally {
    showLoader(false);
  }
}

async function loadDefiById(id) {
  showLoader(true);
  scrollTop();
  stopTimer();
  resetTimer();

  try {
    const res  = await fetch(`/api/defis/${id}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    renderDefi(data.defi);
    showView('defi');
    btnHeaderRandom.style.display = '';
    elSessionBar.style.display    = '';

  } catch (err) {
    console.error('[Défis] byId :', err);
  } finally {
    showLoader(false);
  }
}

// ════════════════════════════════════════════════════════════
//  RENDU DU DÉFI
// ════════════════════════════════════════════════════════════

function renderDefi(defi) {
  session.currentDefi = defi;
  const color = TECHNO_COLORS[defi.techno] || '#58a6ff';

  // Méta
  elDTechno.textContent  = `${TECHNO_ICONS[defi.techno] || ''} ${defi.techno}`;
  elDTechno.style.setProperty('--tc', color);
  elDNiveau.textContent  = defi.niveau;
  elDNiveau.className    = `badge-niveau ${defi.niveau.toLowerCase()}`;
  elDDuration.textContent = `⏱ ${defi.duree}`;
  elDDuree.textContent    = defi.duree;

  // Tags
  elDTags.innerHTML = (defi.tags || []).map(t =>
    `<span class="tag">${escHtml(t)}</span>`
  ).join('');

  // Contenu
  elDTitle.textContent    = defi.titre;
  elDObjectif.textContent = defi.objectif;
  elDEnonce.innerHTML     = defi.enonce
    .split('\n')
    .map(p => p.trim() ? `<p>${escHtml(p)}</p>` : '')
    .join('');

  // Contraintes
  elDContraintes.innerHTML = defi.contraintes.map((c, i) =>
    `<li><span class="c-num">${i + 1}</span><span>${escHtml(c)}</span></li>`
  ).join('');

  // Ressources
  elDRessources.innerHTML = defi.ressources.map(r =>
    `<span class="ressource-chip">📖 ${escHtml(r)}</span>`
  ).join('');

  // Réinitialiser solution
  views.solution.style.display = 'none';
  btnReveal.disabled    = false;
  btnReveal.textContent = '💡 Voir la solution';

  // Réinitialiser éval
  document.querySelectorAll('.eval-btn').forEach(b => {
    b.classList.remove('selected');
    b.disabled = false;
  });

  updateSessionBar();
}

// ════════════════════════════════════════════════════════════
//  RÉVÉLATION DE LA SOLUTION
// ════════════════════════════════════════════════════════════

function revealSolution() {
  const defi = session.currentDefi;
  if (!defi?.solution) return;

  const sol = defi.solution;

  // Méthodologie
  elSMethodo.innerHTML = sol.methodologie
    .split('\n')
    .map(p => p.trim() ? `<p>${escHtml(p)}</p>` : '')
    .join('');

  // Code avec Prism
  const lang = sol.langage || 'javascript';
  elSCode.textContent = sol.code;
  elSCode.className   = `language-${lang}`;
  elSLangBadge.textContent = lang.toUpperCase();

  if (window.Prism) Prism.highlightElement(elSCode);

  // Explications numérotées
  elSExplications.innerHTML = sol.explications.map((exp, i) => `
    <li>
      <span class="exp-num">${i + 1}</span>
      <div class="exp-text">${escHtml(exp)}</div>
    </li>
  `).join('');

  // Afficher + scroller
  views.solution.style.display = '';
  btnReveal.disabled    = true;
  btnReveal.textContent = '✅ Solution révélée';

  stopTimer();

  setTimeout(() => {
    views.solution.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 80);
}

// ════════════════════════════════════════════════════════════
//  TIMER
// ════════════════════════════════════════════════════════════

function toggleTimer() {
  if (session.timerRunning) {
    // Pause
    clearInterval(session.timerInterval);
    session.timerRunning  = false;
    btnTimerStart.textContent = '▶ Reprendre';
  } else {
    // Démarrer
    session.timerRunning = true;
    btnTimerStart.textContent = '⏸ Pause';
    btnTimerReset.style.display = '';
    session.timerInterval = setInterval(() => {
      session.timerSeconds++;
      elTimerDisplay.textContent = formatTime(session.timerSeconds);

      // Clignotement si dépassement
      const [min] = session.currentDefi?.duree?.match(/\d+/) || [999];
      if (session.timerSeconds > parseInt(min) * 60) {
        elTimerDisplay.classList.add('overtime');
      }
    }, 1000);
  }
}

function stopTimer() {
  clearInterval(session.timerInterval);
  session.timerRunning = false;
  btnTimerStart.textContent = '▶ Démarrer';
}

function resetTimer() {
  stopTimer();
  session.timerSeconds = 0;
  elTimerDisplay.textContent = '00:00';
  elTimerDisplay.classList.remove('overtime');
  btnTimerReset.style.display = 'none';
  btnTimerStart.textContent = '▶ Démarrer';
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// ════════════════════════════════════════════════════════════
//  UI HELPERS
// ════════════════════════════════════════════════════════════

function showView(name) {
  Object.entries(views).forEach(([key, el]) => {
    el.style.display = key === name ? '' : 'none';
  });
  // La solution est sous le défi, gérée indépendamment
  if (name !== 'defi') views.solution.style.display = 'none';
}

function showLoader(on) {
  elLoader.style.display = on ? '' : 'none';
}

function updateSessionBar() {
  const remaining = session.totalCount - session.seenIds.size;
  elStatDone.textContent      = `${session.done} fait`;
  elStatSuccess.textContent   = `${session.success} ✓`;
  elStatRemaining.textContent = `${Math.max(0, remaining)} restants`;
}

function scrollTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ════════════════════════════════════════════════════════════
//  GÉNÉRATION IA — appelle /api/generate/defi
// ════════════════════════════════════════════════════════════
async function generateWithIA() {
  const btnIA   = $('btn-generate-ia');
  const noteEl  = $('ia-note');
  const origTxt = btnIA?.textContent || '🤖 Générer par IA';

  if (btnIA) { btnIA.disabled = true; btnIA.textContent = '⏳ Gemini génère…'; }
  showLoader(true);
  scrollTop();

  const payload = {
    techno : session.filters.techno || null,
    niveau : session.filters.niveau || null,
  };

  try {
    const res = await fetch('/api/generate/defi', {
      method  : 'POST',
      headers : { 'Content-Type': 'application/json' },
      body    : JSON.stringify(payload),
    });

    const data = await res.json();

    if (data.code === 'NO_API_KEY') {
      if (noteEl) noteEl.style.display = '';
      alert('Clé Gemini manquante.\nAjoute dans .env :\nGEMINI_API_KEY=ta_clé\nPuis relance npm start.');
      return;
    }
    if (!data.success) throw new Error(data.error || 'Erreur Gemini');

    renderDefi(data.defi);
    showView('defi');
    if (btnHeaderRandom) btnHeaderRandom.style.display = '';
    if (elSessionBar)    elSessionBar.style.display    = '';

  } catch(err) {
    console.error('[Défis IA]', err);
    alert('Erreur : ' + err.message);
  } finally {
    if (btnIA) { btnIA.disabled = false; btnIA.textContent = origTxt; }
    showLoader(false);
  }
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
