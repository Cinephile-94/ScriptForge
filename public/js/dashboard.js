/* dashboard.js — Script listing, create, delete, auth forms */

// ── Auth State ──
const authModal = document.getElementById('auth-modal');
const appDiv = document.getElementById('app');

function initDashboard() {
  if (Auth.isLoggedIn()) {
    showApp();
  } else {
    showAuthModal();
  }
}

function showApp() {
  authModal.classList.remove('active');
  authModal.classList.add('hidden');
  appDiv.classList.remove('hidden');
  loadUserBadge();
  loadScripts();
}

function showAuthModal() {
  authModal.classList.add('active');
  authModal.classList.remove('hidden');
  appDiv.classList.add('hidden');
}

function loadUserBadge() {
  const user = Auth.getUser();
  if (!user) return;
  document.getElementById('user-name-display').textContent = user.displayName;
  const avatar = document.getElementById('user-avatar');
  avatar.textContent = user.displayName.charAt(0).toUpperCase();
  avatar.style.background = user.color || '#c9a84c';
}

function logout() {
  Auth.clearSession();
  showAuthModal();
}

// ── Tab Switching ──
function switchTab(tab) {
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  document.getElementById('tab-login').classList.toggle('active', tab === 'login');
  document.getElementById('tab-register').classList.toggle('active', tab === 'register');
  loginForm.classList.toggle('hidden', tab !== 'login');
  registerForm.classList.toggle('hidden', tab !== 'register');
  clearErrors();
}

function clearErrors() {
  ['login-error', 'reg-error'].forEach(id => {
    const el = document.getElementById(id);
    el.textContent = '';
    el.classList.add('hidden');
  });
}

function showError(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.classList.remove('hidden');
}

// ── Login ──
async function handleLogin(e) {
  e.preventDefault();
  clearErrors();
  const btn = document.getElementById('login-btn');
  btn.disabled = true;
  btn.querySelector('span').textContent = 'Signing in…';

  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) { showError('login-error', data.error || 'Login failed'); return; }
    Auth.setSession(data.token, data.user);
    showApp();
  } catch {
    showError('login-error', 'Network error. Is the server running?');
  } finally {
    btn.disabled = false;
    btn.querySelector('span').textContent = 'Sign In';
  }
}

// ── Register ──
async function handleRegister(e) {
  e.preventDefault();
  clearErrors();
  const btn = document.getElementById('reg-btn');
  btn.disabled = true;
  btn.querySelector('span').textContent = 'Creating…';

  const displayName = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, displayName })
    });
    const data = await res.json();
    if (!res.ok) { showError('reg-error', data.error || 'Registration failed'); return; }
    Auth.setSession(data.token, data.user);
    showApp();
  } catch {
    showError('reg-error', 'Network error. Is the server running?');
  } finally {
    btn.disabled = false;
    btn.querySelector('span').textContent = 'Create Account';
  }
}

// ── Scripts ──
async function loadScripts() {
  const res = await Auth.apiFetch('/api/scripts');
  if (!res) return;
  const { scripts } = await res.json();
  renderScripts(scripts);
}

function renderScripts(scripts) {
  const grid = document.getElementById('scripts-grid');
  const empty = document.getElementById('empty-state');
  grid.innerHTML = '';

  if (!scripts || scripts.length === 0) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  scripts.forEach(script => {
    const date = new Date(script.updated_at * 1000).toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric'
    });

    const card = document.createElement('div');
    card.className = 'script-card';
    card.innerHTML = `
      <div class="script-card-icon">📜</div>
      <div class="script-card-title" title="${escHtml(script.title)}">${escHtml(script.title)}</div>
      <div class="script-card-meta">
        <span>by ${escHtml(script.owner_name)}</span>
        <span>${script.scene_count || 0} scenes</span>
        <span>${script.word_count || 0} words</span>
        <span>Edited ${date}</span>
      </div>
      <div class="script-card-actions">
        <button class="btn-accent" onclick="openScript('${script.id}')">Open</button>
        <button class="btn-ghost" onclick="confirmDelete('${script.id}', event)">Delete</button>
      </div>
    `;
    grid.appendChild(card);
  });
}

function openScript(id) {
  window.location.href = `/editor/${id}`;
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── New Script Modal ──
function openNewScriptModal() {
  document.getElementById('new-script-modal').classList.remove('hidden');
  setTimeout(() => document.getElementById('new-title').focus(), 50);
}

function closeNewScriptModal() {
  document.getElementById('new-script-modal').classList.add('hidden');
  document.getElementById('new-title').value = '';
}

async function createScript(e) {
  e.preventDefault();
  const title = document.getElementById('new-title').value.trim() || 'Untitled Script';
  const res = await Auth.apiFetch('/api/scripts', { method: 'POST', body: { title } });
  if (!res) return;
  const data = await res.json();
  if (data.id) window.location.href = `/editor/${data.id}`;
}

// ── Delete Modal ──
let pendingDeleteId = null;

function confirmDelete(id, e) {
  e.stopPropagation();
  pendingDeleteId = id;
  document.getElementById('delete-modal').classList.remove('hidden');
  document.getElementById('confirm-delete-btn').onclick = doDelete;
}

function closeDeleteModal() {
  document.getElementById('delete-modal').classList.add('hidden');
  pendingDeleteId = null;
}

async function doDelete() {
  if (!pendingDeleteId) return;
  const res = await Auth.apiFetch(`/api/scripts/${pendingDeleteId}`, { method: 'DELETE' });
  closeDeleteModal();
  if (res) loadScripts();
}

// ── Close modals on overlay click ──
document.getElementById('new-script-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('new-script-modal')) closeNewScriptModal();
});
document.getElementById('delete-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('delete-modal')) closeDeleteModal();
});

// ── Init ──
initDashboard();
