'use strict';
// ── Gestion du token JWT côté client ──────────────────────
const AUTH = {
  getToken:   () => localStorage.getItem('jarvis_token'),
  getUser:    () => { try { return JSON.parse(localStorage.getItem('jarvis_user')||'null'); } catch { return null; }},
  setSession: (token, user) => { localStorage.setItem('jarvis_token', token); localStorage.setItem('jarvis_user', JSON.stringify(user)); },
  clear:      () => { localStorage.removeItem('jarvis_token'); localStorage.removeItem('jarvis_user'); },
  headers:    () => ({ 'Content-Type':'application/json', 'Authorization':'Bearer ' + AUTH.getToken() }),
  isLoggedIn: () => !!AUTH.getToken(),
  logout:     () => { AUTH.clear(); window.location.href = '/login.html'; },

  // Vérifie le token sur les pages protégées — redirige vers login si invalide
  requireLogin() {
    if (!AUTH.isLoggedIn()) { window.location.href = '/login.html'; return false; }
    return true;
  },

  // Appel API authentifié — redirige vers login si 401
  async apiFetch(url, options = {}) {
    const res = await fetch(url, { ...options, headers: { ...AUTH.headers(), ...(options.headers||{}) }});
    if (res.status === 401) { AUTH.logout(); return null; }
    return res;
  },
};

// ── Exposer globalement ────────────────────────────────────
window.AUTH = AUTH;

// ── Page Login : logique des formulaires ──────────────────
if (document.getElementById('btn-login')) {
  // Rediriger si déjà connecté
  if (AUTH.isLoggedIn()) window.location.href = '/';

  // Switch tabs
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.auth-form').forEach(f => f.classList.add('hidden'));
      document.getElementById('form-' + tab.dataset.tab).classList.remove('hidden');
    });
  });

  // Toggle password visibility
  document.querySelectorAll('.pw-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = btn.previousElementSibling;
      input.type = input.type === 'password' ? 'text' : 'password';
      btn.textContent = input.type === 'password' ? '👁' : '🙈';
    });
  });

  // LOGIN
  document.getElementById('btn-login').addEventListener('click', async () => {
    const email    = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const errEl    = document.getElementById('login-error');
    errEl.textContent = '';
    if (!email || !password) { errEl.textContent = 'Email et mot de passe requis.'; return; }
    const btn = document.getElementById('btn-login');
    btn.disabled = true; btn.textContent = 'Connexion…';
    try {
      const res  = await fetch('/api/auth/login', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email,password}) });
      const data = await res.json();
      if (!data.success) { errEl.textContent = data.error || 'Erreur connexion'; return; }
      AUTH.setSession(data.token, data.user);
      window.location.href = '/';
    } catch(e) { errEl.textContent = 'Serveur inaccessible. Vérifier que npm start est lancé.'; }
    finally { btn.disabled = false; btn.textContent = 'Se connecter'; }
  });

  // REGISTER
  document.getElementById('btn-register').addEventListener('click', async () => {
    const username = document.getElementById('reg-username').value.trim();
    const email    = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const errEl    = document.getElementById('register-error');
    errEl.textContent = '';
    if (!username || !email || !password) { errEl.textContent = 'Tous les champs sont requis.'; return; }
    const btn = document.getElementById('btn-register');
    btn.disabled = true; btn.textContent = 'Création…';
    try {
      const res  = await fetch('/api/auth/register', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({username,email,password}) });
      const data = await res.json();
      if (!data.success) { errEl.textContent = data.error || 'Erreur inscription'; return; }
      AUTH.setSession(data.token, data.user);
      window.location.href = '/';
    } catch(e) { errEl.textContent = 'Serveur inaccessible.'; }
    finally { btn.disabled = false; btn.textContent = 'Créer mon compte'; }
  });

  // Enter key
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const loginVisible = !document.getElementById('form-login').classList.contains('hidden');
    if (loginVisible) document.getElementById('btn-login').click();
    else document.getElementById('btn-register').click();
  });
}
