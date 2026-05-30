/* ─── KaloriAI – app.js ─────────────────────────────────────────────── */
const API = 'http://localhost:8000';

/* ══════════════════════════════════════
   STATE
   ══════════════════════════════════════ */
let currentUser = null;
let lastResult  = null;
let activeDetailItem = null;

/* ══════════════════════════════════════
   INIT
   ══════════════════════════════════════ */
(function init() {
  const saved = localStorage.getItem('kai_user');
  if (saved) {
    currentUser = JSON.parse(saved);
    enterApp();
  }
})();

/* ══════════════════════════════════════
   AUTH
   ══════════════════════════════════════ */
function switchTab(tab) {
  const isLogin = tab === 'login';
  document.getElementById('tab-login').classList.toggle('active', isLogin);
  document.getElementById('tab-register').classList.toggle('active', !isLogin);
  document.getElementById('form-login').classList.toggle('hidden', !isLogin);
  document.getElementById('form-register').classList.toggle('hidden', isLogin);
}

function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-pass').value;
  const err   = document.getElementById('login-error');

  // Demo user
  if (email === 'test@kalori.ai' && pass === '123456') {
    loginAs({ name: 'Demo Kullanıcı', email });
    return;
  }

  // Check registered users
  const users = JSON.parse(localStorage.getItem('kai_users') || '[]');
  const found = users.find(u => u.email === email && u.pass === pass);
  if (found) {
    loginAs(found);
  } else {
    err.textContent = 'E-posta veya şifre hatalı.';
  }
}

function handleRegister(e) {
  e.preventDefault();
  const name  = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const pass  = document.getElementById('reg-pass').value;
  const err   = document.getElementById('reg-error');

  const users = JSON.parse(localStorage.getItem('kai_users') || '[]');
  if (users.find(u => u.email === email)) {
    err.textContent = 'Bu e-posta zaten kayıtlı.';
    return;
  }
  users.push({ name, email, pass });
  localStorage.setItem('kai_users', JSON.stringify(users));
  loginAs({ name, email });
}

function loginAs(user) {
  currentUser = user;
  localStorage.setItem('kai_user', JSON.stringify(user));
  enterApp();
}

function handleLogout() {
  localStorage.removeItem('kai_user');
  currentUser = null;
  document.getElementById('screen-auth').classList.remove('hidden');
  document.getElementById('screen-auth').classList.add('active');
  document.getElementById('screen-app').classList.add('hidden');
  showToast('Çıkış yapıldı');
}

function enterApp() {
  document.getElementById('screen-auth').classList.remove('active');
  document.getElementById('screen-auth').classList.add('hidden');
  document.getElementById('screen-app').classList.remove('hidden');
  document.getElementById('screen-app').classList.add('active');
  showPage('dashboard');
  refreshStats();
  loadProfileForm();
}

/* ══════════════════════════════════════
   NAVIGATION
   ══════════════════════════════════════ */
function showPage(name) {
  ['dashboard', 'history', 'profile'].forEach(p => {
    document.getElementById('page-' + p).classList.remove('active');
    document.getElementById('page-' + p).classList.add('hidden');
    document.getElementById('nav-' + p).classList.remove('active');
  });
  document.getElementById('page-' + name).classList.add('active');
  document.getElementById('page-' + name).classList.remove('hidden');
  document.getElementById('nav-' + name).classList.add('active');

  if (name === 'history') renderHistory();
  if (name === 'profile') renderProfileStats();
  if (name === 'dashboard') refreshStats();
}

/* ══════════════════════════════════════
   UPLOAD & PREDICT
   ══════════════════════════════════════ */
function handleDragOver(e) {
  e.preventDefault();
  document.getElementById('upload-zone').classList.add('drag-over');
}
function handleDragLeave() {
  document.getElementById('upload-zone').classList.remove('drag-over');
}
function handleDrop(e) {
  e.preventDefault();
  document.getElementById('upload-zone').classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) processFile(file);
}
function handleFileSelect(e) {
  const file = e.target.files[0];
  if (file) processFile(file);
}

function processFile(file) {
  const reader = new FileReader();
  reader.onload = (ev) => {
    // Show card with preview
    const card = document.getElementById('result-card');
    document.getElementById('result-img').src = ev.target.result;
    card.classList.remove('hidden');

    // Start scanner scan animation
    const imgWrap = document.getElementById('result-img-wrap');
    if (imgWrap) imgWrap.classList.add('scanning');

    document.getElementById('result-loading').classList.remove('hidden');
    document.getElementById('result-data').classList.add('hidden');

    // Scroll to result
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    // Send to API
    const formData = new FormData();
    formData.append('file', file);

    fetch(`${API}/predict`, { method: 'POST', body: formData })
      .then(r => {
        if (!r.ok) throw new Error('Sunucu hatası');
        return r.json();
      })
      .then(data => displayResult(data))
      .catch(err => {
        // Stop scanner on error
        const imgWrap = document.getElementById('result-img-wrap');
        if (imgWrap) imgWrap.classList.remove('scanning');
        document.getElementById('result-loading').classList.add('hidden');
        showToast('⚠️ Bağlantı hatası: Backend çalışıyor mu?');
        console.error(err);
      });
  };
  reader.readAsDataURL(file);
}

function updatePredictionUI(prediction, calories, confidence) {
  document.getElementById('result-food-name').textContent = prediction;
  document.getElementById('result-calories').textContent = calories;
  document.getElementById('result-confidence').textContent = confidence + '%';

  // Confidence bar animation
  setTimeout(() => {
    const fill = document.getElementById('confidence-fill');
    if (fill) fill.style.width = Math.min(confidence, 100) + '%';
  }, 100);
}

function renderAlternativeChips(top3List, currentPrediction) {
  const top3Wrap = document.getElementById('top3-wrap');
  if (!top3Wrap) return;
  top3Wrap.innerHTML = '';

  if (top3List) {
    top3List.forEach(item => {
      const chip = document.createElement('div');
      const isSelected = item.name_tr === currentPrediction;
      chip.className = 'top3-chip' + (isSelected ? ' selected' : '');
      chip.innerHTML = `🍽️ <span>${item.name_tr}</span> <small>${item.confidence}%</small>`;

      // Select Alternative Prediction
      chip.onclick = () => {
        if (!lastResult) return;
        // Update selection in state
        lastResult.prediction = item.name_tr;
        lastResult.calories = item.calories_per_serving;
        lastResult.confidence = item.confidence;
        lastResult.class = item.class;

        // Update main result view
        updatePredictionUI(item.name_tr, item.calories_per_serving, item.confidence);
        
        // Re-render chips to update the active selection border/styling
        renderAlternativeChips(top3List, item.name_tr);
      };

      top3Wrap.appendChild(chip);
    });
  }
}

function displayResult(data) {
  lastResult = data;

  // Stop scanner scan animation
  const imgWrap = document.getElementById('result-img-wrap');
  if (imgWrap) imgWrap.classList.remove('scanning');

  document.getElementById('result-loading').classList.add('hidden');
  document.getElementById('result-data').classList.remove('hidden');

  // Load Primary predictions
  updatePredictionUI(data.prediction, data.calories, data.confidence);

  // Render Top-3 interactive chips
  renderAlternativeChips(data.top3, data.prediction);

  refreshStats();
}

function saveToHistory() {
  if (!lastResult) return;
  
  // Ensure the object has timestamp and unique ID
  if (!lastResult.timestamp) lastResult.timestamp = new Date().toISOString();
  if (!lastResult.id) lastResult.id = 'kai_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  
  const history = getHistory();
  
  // Clean duplicates if trying to log the same request
  const idx = history.findIndex(h => h.id === lastResult.id);
  if (idx !== -1) {
    history[idx] = lastResult; // update
  } else {
    history.unshift(lastResult); // prepend
  }
  
  localStorage.setItem('kai_history', JSON.stringify(history.slice(0, 100)));
  showToast('✅ Günlüğe kaydedildi!');
  refreshStats();
}

/* ══════════════════════════════════════
   HISTORY
   ══════════════════════════════════════ */
function getHistory() {
  return JSON.parse(localStorage.getItem('kai_history') || '[]');
}

function renderHistory() {
  // Reset filters
  const searchInput = document.getElementById('history-search');
  const filterSelect = document.getElementById('history-filter');
  if (searchInput) searchInput.value = '';
  if (filterSelect) filterSelect.value = 'all';

  filterHistory();
}

function filterHistory() {
  const history = getHistory();
  const query = document.getElementById('history-search').value.toLowerCase().trim();
  const filter = document.getElementById('history-filter').value;
  const grid = document.getElementById('history-grid');
  const empty = document.getElementById('history-empty');

  if (!grid) return;
  grid.innerHTML = '';

  let filtered = history;

  // 1. Search Query
  if (query) {
    filtered = filtered.filter(item => item.prediction.toLowerCase().includes(query));
  }

  // 2. Calorie filter dropdown
  if (filter === 'low') {
    filtered = filtered.filter(item => (item.calories || 0) < 200);
  } else if (filter === 'medium') {
    filtered = filtered.filter(item => (item.calories || 0) >= 200 && (item.calories || 0) <= 500);
  } else if (filter === 'high') {
    filtered = filtered.filter(item => (item.calories || 0) > 500);
  }

  // 3. Grid status check
  if (!filtered.length) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  filtered.forEach(item => {
    const div = document.createElement('div');
    div.className = 'history-item';

    const date = new Date(item.timestamp);
    const dateStr = date.toLocaleDateString('tr-TR', { day:'2-digit', month:'short', year:'numeric' })
                  + ' ' + date.toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit' });

    div.innerHTML = `
      <img src="${item.thumbnail || ''}" alt="${item.prediction}" onerror="this.style.display='none'" />
      <div class="history-item-info">
        <div class="history-item-name">${item.prediction}</div>
        <div class="history-item-cal">🔥 ${item.calories} kcal</div>
        <div class="history-item-date">${dateStr}</div>
      </div>`;
      
    // Clicking card opens the detail modal
    div.onclick = () => openDetailModal(item.id);
    
    grid.appendChild(div);
  });
}

function clearHistory() {
  if (!confirm('Tüm geçmiş silinsin mi?')) return;
  localStorage.removeItem('kai_history');
  renderHistory();
  refreshStats();
  showToast('Geçmiş temizlendi');
}

/* ══════════════════════════════════════
   RECENT UPLOADS (Dashboard Quick-view)
   ══════════════════════════════════════ */
function renderRecentUploads() {
  const history = getHistory();
  const section = document.getElementById('recent-uploads-section');
  const grid = document.getElementById('recent-uploads-grid');
  
  if (!grid || !section) return;
  
  if (history.length === 0) {
    section.classList.add('hidden');
    return;
  }
  
  section.classList.remove('hidden');
  grid.innerHTML = '';
  
  // Render the last 3 uploaded meals
  const recents = history.slice(0, 3);
  recents.forEach(item => {
    const div = document.createElement('div');
    div.className = 'recent-card-item';
    
    const date = new Date(item.timestamp);
    const dateStr = date.toLocaleDateString('tr-TR', { day:'2-digit', month:'short' })
                  + ' ' + date.toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit' });
                  
    div.innerHTML = `
      <div class="recent-img-container">
        <img src="${item.thumbnail || ''}" alt="${item.prediction}" onerror="this.style.display='none'" />
      </div>
      <div class="recent-item-info">
        <div class="recent-item-name">${item.prediction}</div>
        <div class="recent-item-cal">🔥 ${item.calories} kcal</div>
        <div class="recent-item-date">${dateStr}</div>
      </div>
    `;
    
    // Open detailed modal
    div.onclick = () => openDetailModal(item.id);
    
    grid.appendChild(div);
  });
}

/* ══════════════════════════════════════
   DETAIL MODAL & SINGLE-ITEM DELETE
   ══════════════════════════════════════ */
function openDetailModal(id) {
  const history = getHistory();
  const item = history.find(h => h.id === id);
  if (!item) return;
  
  activeDetailItem = item;
  
  document.getElementById('modal-title').textContent = item.prediction;
  document.getElementById('modal-food-name').textContent = item.prediction;
  document.getElementById('modal-calories').textContent = item.calories + ' kcal';
  document.getElementById('modal-confidence').textContent = item.confidence + '%';
  
  const date = new Date(item.timestamp);
  const dateStr = date.toLocaleDateString('tr-TR', { day:'2-digit', month:'long', year:'numeric' })
                + ' ' + date.toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit' });
  document.getElementById('modal-date').textContent = dateStr;
  
  const img = document.getElementById('modal-img');
  if (img) img.src = item.thumbnail || '';
  
  // Render alternative choices breakdown
  const alternativesWrap = document.getElementById('modal-alternatives');
  if (alternativesWrap) {
    alternativesWrap.innerHTML = '';
    if (item.top3) {
      item.top3.forEach(alt => {
        const chip = document.createElement('div');
        chip.className = 'top3-chip';
        if (alt.name_tr === item.prediction) chip.className += ' selected';
        chip.innerHTML = `🍽️ <span>${alt.name_tr}</span> <small>${alt.confidence}%</small>`;
        alternativesWrap.appendChild(chip);
      });
    } else {
      alternativesWrap.innerHTML = '<p style="font-size:13px; color:var(--text-3)">Alternatif bulunamadı.</p>';
    }
  }
  
  document.getElementById('detail-modal').classList.add('active');
}

function closeDetailModal(e) {
  if (e && e.target !== e.currentTarget && !e.target.classList.contains('modal-close')) return;
  document.getElementById('detail-modal').classList.remove('active');
  activeDetailItem = null;
}

function deleteHistoryItem() {
  if (!activeDetailItem) return;
  if (!confirm(`"${activeDetailItem.prediction}" kaydı silinsin mi?`)) return;
  
  let history = getHistory();
  history = history.filter(h => h.id !== activeDetailItem.id);
  localStorage.setItem('kai_history', JSON.stringify(history));
  
  closeDetailModal();
  showToast('🗑️ Kayıt silindi');
  
  // Refresh pages to keep all elements updated
  if (document.getElementById('page-history').classList.contains('active')) {
    filterHistory();
  }
  refreshStats();
}

/* ══════════════════════════════════════
   STATS
   ══════════════════════════════════════ */
function refreshStats() {
  const history = getHistory();
  const today = new Date().toDateString();

  const todayItems = history.filter(h => new Date(h.timestamp).toDateString() === today);
  const todayKcal  = todayItems.reduce((s, h) => s + (h.calories || 0), 0);
  const avgKcal    = history.length ? Math.round(history.reduce((s,h) => s + (h.calories||0), 0) / history.length) : 0;

  // Dashboard
  document.getElementById('daily-total').textContent = todayKcal;
  document.getElementById('stat-today').textContent  = todayKcal + ' kcal';
  document.getElementById('stat-count').textContent  = history.length;
  document.getElementById('stat-avg').textContent    = avgKcal + ' kcal';

  const profile  = getProfile();
  const goal     = profile.goal || 2000;
  const goalPct  = Math.min(Math.round((todayKcal / goal) * 100), 100);
  document.getElementById('stat-goal-pct').textContent = goalPct + '%';

  // Render recent logs on Dashboard
  renderRecentUploads();

  // Greet
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Günaydın' : hour < 18 ? 'İyi günler' : 'İyi akşamlar';
  const name  = currentUser?.name?.split(' ')[0] || 'Hoş geldiniz';
  const greetEl = document.getElementById('greet-text');
  if (greetEl) greetEl.textContent = `${greet}, ${name}! 👋`;
}

/* ══════════════════════════════════════
   PROFILE
   ══════════════════════════════════════ */
function getProfile() {
  return JSON.parse(localStorage.getItem('kai_profile') || '{}');
}

function loadProfileForm() {
  const p = getProfile();
  if (p.name)   document.getElementById('p-name').value   = p.name;
  if (p.age)    document.getElementById('p-age').value    = p.age;
  if (p.height) document.getElementById('p-height').value = p.height;
  if (p.weight) document.getElementById('p-weight').value = p.weight;
  if (p.goal)   document.getElementById('p-goal').value   = p.goal;

  const displayName  = p.name || currentUser?.name || 'Kullanıcı';
  const displayEmail = currentUser?.email || '—';
  document.getElementById('profile-display-name').textContent  = displayName;
  document.getElementById('profile-display-email').textContent = displayEmail;
  document.getElementById('profile-avatar').textContent = displayName.charAt(0).toUpperCase();
}

function saveProfile(e) {
  e.preventDefault();
  const p = {
    name:   document.getElementById('p-name').value,
    age:    document.getElementById('p-age').value,
    height: document.getElementById('p-height').value,
    weight: document.getElementById('p-weight').value,
    goal:   parseInt(document.getElementById('p-goal').value) || 2000,
  };
  localStorage.setItem('kai_profile', JSON.stringify(p));
  loadProfileForm();
  renderProfileStats();
  refreshStats();
  showToast('✅ Profil kaydedildi');
}

function renderProfileStats() {
  const history = getHistory();
  const profile = getProfile();

  const total  = history.length;
  const avg    = total ? Math.round(history.reduce((s,h) => s+(h.calories||0),0)/total) : 0;
  const maxCal = total ? Math.max(...history.map(h => h.calories||0)) : 0;

  document.getElementById('pstat-total').textContent = total;
  document.getElementById('pstat-avg').textContent   = avg + ' kcal';
  document.getElementById('pstat-max').textContent   = maxCal + ' kcal';

  // Ring progress
  const today     = new Date().toDateString();
  const todayKcal = history.filter(h => new Date(h.timestamp).toDateString() === today)
                            .reduce((s,h) => s+(h.calories||0), 0);
  const goal    = profile.goal || 2000;
  const pct     = Math.min((todayKcal / goal) * 100, 100);
  const circumf = 251.2;
  const offset  = circumf - (circumf * pct / 100);

  document.getElementById('ring-fill').style.strokeDashoffset = offset;
  document.getElementById('ring-pct').textContent = Math.round(pct) + '%';
}

/* ══════════════════════════════════════
   TOAST
   ══════════════════════════════════════ */
let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.innerHTML = `<span>💬</span> <span>${msg}</span>`;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}
