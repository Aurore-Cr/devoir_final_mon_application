'use strict';

// ============================================================
//  JARVIS — anglais.js
//
//  États (vues) :
//    landing   → catalogue + filtres + bouton aléatoire
//    exercise  → texte + code + traduction + questions
//    correction→ corrigé + lexique + auto-évaluation
//
//  Session (mémoire volatile, reset à la fermeture de l'onglet) :
//    seenIds     → Set — exercices déjà tirés, pour l'anti-répétition
//    score       → { done, correct } — auto-évaluation
//    totalCount  → nombre total d'exercices dans la base
// ============================================================

// ─── ÉLÉMENTS DOM ─────────────────────────────────────────
const $ = id => document.getElementById(id);

const views = {
  landing    : $('view-landing'),
  exercise   : $('view-exercise'),
  correction : $('view-correction'),
};

const elLoader         = $('global-loader');
const elSessionBar     = $('session-bar');
const elBtnNewRandom   = $('btn-new-random');
const elStatDone       = $('stat-done');
const elStatCorrect    = $('stat-correct');
const elStatRemaining  = $('stat-remaining');

// Filtres
const elCategoryChips  = $('category-chips');
const elDifficultyChips = $('difficulty-chips');
const elCatalogCount   = $('catalog-count');
const elCatalogList    = $('catalog-list');

// Exercice
const elExCategory     = $('ex-category');
const elExDifficulty   = $('ex-difficulty');
const elExId           = $('ex-id');
const elExTitle        = $('ex-title');
const elExIntro        = $('ex-intro');
const elExText         = $('ex-text');
const elCodeSection    = $('code-section');
const elCodeLang       = $('code-lang-badge');
const elExCode         = $('ex-code');
const elBtnCopyCode    = $('btn-copy-code');
const elTransChallenge = $('ex-translation-challenge');
const elAnswerTransl   = $('answer-translation');
const elCharTransl     = $('char-translation');
const elQuestionsSection = $('questions-section');

// Correction
const elModelTransl    = $('model-translation');
const elDisplayTransl  = $('display-translation');
const elCorrQList      = $('correction-questions-list');
const elLexiconGrid    = $('lexicon-grid');

// Boutons
const elBtnStartRandom = $('btn-start-random');
const elBtnReveal      = $('btn-reveal');
const elBtnSkip        = $('btn-skip');
const elBtnNext        = $('btn-next-exercise');
const elBtnBackCatalog = $('btn-back-catalog');
const elLandingError   = $('landing-error');

// ─── ÉTAT DE SESSION ──────────────────────────────────────
const session = {
  seenIds       : new Set(),  // anti-répétition
  done          : 0,          // exercices terminés (corrigé vu)
  correct       : 0,          // auto-évaluation ✅
  totalCount    : 0,
  currentEx     : null,       // exercice courant
  activeCategory: '',
  activeDifficulty: '',
  allExercises  : [],         // méta pour le catalogue
};

// ─── POINT D'ENTRÉE ───────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);

async function init() {
  await loadCatalog();
  wireButtons();
}

// ════════════════════════════════════════════════════════════
//  CHARGEMENT DU CATALOGUE
// ════════════════════════════════════════════════════════════

async function loadCatalog() {
  showLoader(true);
  try {
    // Catégories disponibles
    const catRes  = await fetch('/api/anglais/categories');
    const catData = await catRes.json();
    if (!catData.success) throw new Error(catData.error);

    session.totalCount   = catData.total;
    session.allExercises = [];

    // Injecter les chips de catégorie
    renderCategoryChips(catData.categories);
    renderDifficultyChips(catData.difficulties);

    // Charger les méta du catalogue
    const allRes  = await fetch('/api/anglais');
    const allData = await allRes.json();
    if (!allData.success) throw new Error(allData.error);

    session.allExercises = allData.exercises;
    renderCatalog(allData.exercises);

  } catch (err) {
    console.error('[Anglais] Catalogue :', err);
    elLandingError.style.display = '';
  } finally {
    showLoader(false);
  }
}

function renderCategoryChips(categories) {
  categories.forEach(cat => {
    const btn = document.createElement('button');
    btn.className      = 'chip';
    btn.dataset.category = cat;
    btn.textContent    = cat;
    elCategoryChips.appendChild(btn);
  });
}

function renderDifficultyChips(difficulties) {
  // Les chips B2/C1 sont déjà dans le HTML ; on s'assure que seules
  // les difficultés présentes dans la base sont affichées
  elDifficultyChips.querySelectorAll('[data-difficulty]').forEach(chip => {
    const d = chip.dataset.difficulty;
    if (d && !difficulties.includes(d)) chip.style.display = 'none';
  });
}

function renderCatalog(exercises) {
  const category   = session.activeCategory;
  const difficulty = session.activeDifficulty;

  const filtered = exercises.filter(e => {
    if (category   && e.category   !== category)   return false;
    if (difficulty && e.difficulty !== difficulty) return false;
    return true;
  });

  elCatalogCount.textContent =
    `${filtered.length} exercice${filtered.length > 1 ? 's' : ''} disponible${filtered.length > 1 ? 's' : ''}`;

  elCatalogList.innerHTML = filtered.map(e => `
    <li class="catalog-item ${session.seenIds.has(e.id) ? 'seen' : ''}"
        data-id="${e.id}">
      <div class="catalog-item-meta">
        <span class="meta-difficulty badge ${e.difficulty.toLowerCase()}">${e.difficulty}</span>
        <span class="catalog-category">${escHtml(e.category)}</span>
        ${session.seenIds.has(e.id) ? '<span class="seen-badge">✓ Fait</span>' : ''}
      </div>
      <p class="catalog-title">${escHtml(e.title)}</p>
    </li>
  `).join('');

  // Clic sur un exercice spécifique du catalogue
  elCatalogList.querySelectorAll('.catalog-item').forEach(item => {
    item.addEventListener('click', () => loadExerciseById(item.dataset.id));
  });
}

// ════════════════════════════════════════════════════════════
//  CÂBLAGE DES ÉVÉNEMENTS
// ════════════════════════════════════════════════════════════

function wireButtons() {
  // Bouton aléatoire (landing + header)
  elBtnStartRandom.addEventListener('click', loadRandomExercise);
  elBtnNewRandom.addEventListener('click',   loadRandomExercise);

  // Bouton génération IA
  const btnIA = $('btn-generate-ia');
  if (btnIA) btnIA.addEventListener('click', generateWithIA);

  // Boutons exercice
  elBtnReveal.addEventListener('click', revealCorrection);
  elBtnSkip.addEventListener('click',   loadRandomExercise);

  // Boutons correction
  elBtnNext.addEventListener('click',       loadRandomExercise);
  elBtnBackCatalog.addEventListener('click', () => showView('landing'));

  // Compteur de caractères — traduction
  elAnswerTransl.addEventListener('input', () => {
    elCharTransl.textContent = `${elAnswerTransl.value.length} caractère${elAnswerTransl.value.length > 1 ? 's' : ''}`;
  });

  // Filtres catégorie
  elCategoryChips.addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    elCategoryChips.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    session.activeCategory = chip.dataset.category || '';
    renderCatalog(session.allExercises);
  });

  // Filtres difficulté
  elDifficultyChips.addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    elDifficultyChips.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    session.activeDifficulty = chip.dataset.difficulty || '';
    renderCatalog(session.allExercises);
  });

  // Copier le code
  elBtnCopyCode.addEventListener('click', () => {
    const code = elExCode.textContent;
    navigator.clipboard.writeText(code).then(() => {
      elBtnCopyCode.textContent = '✅ Copié !';
      setTimeout(() => { elBtnCopyCode.textContent = '📋 Copier'; }, 2000);
    });
  });

  // Auto-évaluation
  $('self-eval').addEventListener('click', e => {
    const btn = e.target.closest('.eval-btn');
    if (!btn) return;

    $('self-eval').querySelectorAll('.eval-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');

    const score = parseInt(btn.dataset.score, 10);
    session.done++;
    if (score === 2) session.correct++;
    updateSessionBar();
    btn.disabled = true;

    // Marquer l'exercice comme vu
    if (session.currentEx) session.seenIds.add(session.currentEx.id);
    renderCatalog(session.allExercises);
  });
}

// ════════════════════════════════════════════════════════════
//  CHARGEMENT D'UN EXERCICE
// ════════════════════════════════════════════════════════════

async function loadRandomExercise() {
  showLoader(true);
  scrollTop();

  try {
    let url = '/api/anglais/random';
    const params = new URLSearchParams();

    if (session.activeCategory)   params.set('category',   session.activeCategory);
    if (session.activeDifficulty) params.set('difficulty', session.activeDifficulty);

    // Anti-répétition : envoyer les IDs déjà vus
    if (session.seenIds.size > 0) {
      params.set('exclude', [...session.seenIds].join(','));
    }
    if ([...params].length) url += '?' + params.toString();

    const res  = await fetch(url);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    renderExercise(data.exercise);
    showView('exercise');

  } catch (err) {
    console.error('[Anglais] Chargement exercice :', err);
    alert('Impossible de charger un exercice : ' + err.message);
  } finally {
    showLoader(false);
  }
}

async function loadExerciseById(id) {
  showLoader(true);
  scrollTop();

  try {
    const res  = await fetch(`/api/anglais/${id}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    renderExercise(data.exercise);
    showView('exercise');

  } catch (err) {
    console.error('[Anglais] Chargement exercice :', err);
  } finally {
    showLoader(false);
  }
}

// ════════════════════════════════════════════════════════════
//  RENDU DE L'EXERCICE
// ════════════════════════════════════════════════════════════

function renderExercise(ex) {
  session.currentEx = ex;

  // ─ Méta
  elExCategory.textContent  = ex.category;
  elExDifficulty.textContent = ex.difficulty;
  elExDifficulty.className   = `meta-difficulty badge ${ex.difficulty.toLowerCase()}`;
  elExId.textContent         = ex.id;
  elExTitle.textContent      = ex.title;
  elExIntro.textContent      = ex.intro;

  // ─ Texte anglais (paragraphes)
  elExText.innerHTML = ex.text
    .split('\n\n')
    .map(p => `<p>${escHtml(p)}</p>`)
    .join('');

  // ─ Bloc de code
  if (ex.code) {
    elExCode.textContent = ex.code;
    elExCode.className   = `language-${ex.language || 'javascript'}`;
    elCodeLang.textContent = (ex.language || 'javascript').toUpperCase();
    elCodeSection.style.display = '';
    // Lancer Prism sur le bloc
    if (window.Prism) Prism.highlightElement(elExCode);
  } else {
    elCodeSection.style.display = 'none';
  }

  // ─ Défi traduction
  elTransChallenge.textContent = ex.translation_challenge;

  // ─ Réinitialiser la zone de réponse
  elAnswerTransl.value      = '';
  elCharTransl.textContent  = '0 caractères';

  // ─ Questions
  elQuestionsSection.innerHTML = `
    <p class="section-label">❓ Questions de compréhension</p>
    <p class="questions-note">Réponds en anglais, de façon développée.</p>
    ${ex.questions.map((q, i) => `
      <div class="question-block" data-qid="${q.id}">
        <p class="question-label">Q${i + 1}</p>
        <p class="question-text">${escHtml(q.question)}</p>
        <label class="answer-label" for="answer-q${i + 1}">Ta réponse :</label>
        <textarea
          id="answer-q${i + 1}"
          class="answer-area answer-question"
          data-qid="${q.id}"
          placeholder="Answer in English…"
          rows="5"
          spellcheck="true"
          lang="en"
        ></textarea>
        <div class="char-count q-char-count" id="char-q${i + 1}">0 characters</div>
      </div>
    `).join('')}
  `;

  // Compteurs de caractères pour les questions
  ex.questions.forEach((_, i) => {
    const ta      = $(`answer-q${i + 1}`);
    const counter = $(`char-q${i + 1}`);
    if (ta && counter) {
      ta.addEventListener('input', () => {
        counter.textContent = `${ta.value.length} character${ta.value.length > 1 ? 's' : ''}`;
      });
    }
  });

  // Réinitialiser la section correction
  views.correction.style.display = 'none';
  // Réactiver le bouton révéler
  elBtnReveal.disabled     = false;
  elBtnReveal.textContent  = '🔍 Révéler le corrigé';

  // Afficher le header action
  elBtnNewRandom.style.display = '';
  elSessionBar.style.display   = '';
  updateSessionBar();
}

// ════════════════════════════════════════════════════════════
//  RÉVÉLATION DU CORRIGÉ
// ════════════════════════════════════════════════════════════

function revealCorrection() {
  const ex = session.currentEx;
  if (!ex) return;

  // ─ Traduction : ta réponse vs modèle
  const userTransl   = elAnswerTransl.value.trim();
  elDisplayTransl.textContent  = userTransl || '(aucune réponse saisie)';
  elDisplayTransl.className    = `your-answer-display ${userTransl ? '' : 'empty'}`;
  elModelTransl.innerHTML = ex.model_translation
    .split('\n\n')
    .map(p => `<p>${escHtml(p)}</p>`)
    .join('');

  // ─ Questions
  elCorrQList.innerHTML = ex.questions.map((q, i) => {
    const ta        = $(`answer-q${i + 1}`);
    const userAns   = ta ? ta.value.trim() : '';
    const modelAns  = ex.model_answers[i] || '—';

    return `
      <div class="correction-qa">
        <p class="correction-q-label">Q${i + 1} — ${escHtml(q.question)}</p>
        <div class="comparison-grid compact">
          <div class="comparison-col">
            <p class="col-label your-label">Ta réponse</p>
            <div class="your-answer-display ${userAns ? '' : 'empty'}">
              ${escHtml(userAns) || '(aucune réponse)'}
            </div>
          </div>
          <div class="comparison-col">
            <p class="col-label model-label">Réponse de référence</p>
            <div class="model-answer-display">${escHtml(modelAns)}</div>
          </div>
        </div>
      </div>`;
  }).join('');

  // ─ Lexique
  elLexiconGrid.innerHTML = ex.lexicon.map(entry => `
    <div class="lexicon-card">
      <p class="lex-term">${escHtml(entry.term)}</p>
      <p class="lex-french">🇫🇷 ${escHtml(entry.french)}</p>
      <p class="lex-def">${escHtml(entry.definition)}</p>
    </div>
  `).join('');

  // ─ Réinitialiser l'auto-éval
  $('self-eval').querySelectorAll('.eval-btn').forEach(b => {
    b.classList.remove('selected');
    b.disabled = false;
  });

  // Afficher la correction et y scroller
  views.correction.style.display = '';
  elBtnReveal.disabled    = true;
  elBtnReveal.textContent = '✅ Corrigé révélé';

  setTimeout(() => {
    views.correction.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 80);
}

// ════════════════════════════════════════════════════════════
//  HELPERS UI
// ════════════════════════════════════════════════════════════

function showView(name) {
  Object.entries(views).forEach(([key, el]) => {
    el.style.display = key === name ? '' : 'none';
  });
  // La vue correction se gère indépendamment (elle est sous exercise)
  if (name !== 'exercise') views.correction.style.display = 'none';
}

function showLoader(visible) {
  elLoader.style.display = visible ? '' : 'none';
}

function updateSessionBar() {
  const remaining = session.totalCount - session.seenIds.size;
  elStatDone.textContent      = `${session.done} fait`;
  elStatCorrect.textContent   = `${session.correct} ✓`;
  elStatRemaining.textContent = `${Math.max(0, remaining)} restants`;
}

function scrollTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Génération IA ──────────────────────────────────────────
async function generateWithIA() {
  const btnIA   = $('btn-generate-ia');
  const noteEl  = $('ia-note');
  const origTxt = btnIA?.textContent || '🤖 Générer par IA';

  if (btnIA) { btnIA.disabled = true; btnIA.textContent = '⏳ Gemini génère…'; }
  showLoader(true);
  scrollTop();

  try {
    const res = await fetch('/api/generate/anglais', {
      method  : 'POST',
      headers : { 'Content-Type': 'application/json' },
      body    : JSON.stringify({}),
    });

    const data = await res.json();

    if (data.code === 'NO_API_KEY') {
      if (noteEl) noteEl.style.display = '';
      alert('Clé Gemini manquante.\nAjoute dans .env :\nGEMINI_API_KEY=ta_clé\nPuis relance npm start.');
      return;
    }
    if (!data.success) throw new Error(data.error || 'Erreur Gemini');

    renderExercise(data.exercise);
    showView('exercise');
    if (elBtnNewRandom) elBtnNewRandom.style.display = '';
    if (elSessionBar)   elSessionBar.style.display   = '';

  } catch (err) {
    console.error('[Anglais IA]', err);
    alert('Erreur : ' + err.message);
  } finally {
    if (btnIA) { btnIA.disabled = false; btnIA.textContent = origTxt; }
    showLoader(false);
  }
}

// ── Loader (réutilisé depuis loadCatalog) ─────────────────
function showLoader(on) {
  const el = $('global-loader') || $('state-loading');
  if (el) el.style.display = on ? '' : 'none';
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
