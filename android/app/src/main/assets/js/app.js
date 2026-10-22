/* =====================================================
   SoftHome - Ortak Ev Bütçe Takibi
   Giriş sistemi + sadeleştirilmiş ayarlar
   ===================================================== */

// ---------- STATE ----------
let currentUser = null;
let users = [];
let expenses = [];
let settlements = [];
let selectedCategory = { icon: 'fa-utensils', name: 'Yemek' };
let selectedSplitIds = [];
let currentFilter = 'Tümü';
let photoData = null;

// ---------- STORAGE HELPERS ----------
function loadFromStorage() {
  try {
    users = JSON.parse(localStorage.getItem('softhome_users') || '[]');
    expenses = JSON.parse(localStorage.getItem('softhome_expenses') || '[]');
    settlements = JSON.parse(localStorage.getItem('softhome_settlements') || '[]');
    const savedUser = localStorage.getItem('softhome_currentUser');
    if (savedUser) currentUser = JSON.parse(savedUser);
  } catch (e) {
    users = [];
    expenses = [];
    settlements = [];
    currentUser = null;
  }
}

function saveUsers() {
  localStorage.setItem('softhome_users', JSON.stringify(users));
}
function saveExpenses() {
  localStorage.setItem('softhome_expenses', JSON.stringify(expenses));
}
function saveSettlements() {
  localStorage.setItem('softhome_settlements', JSON.stringify(settlements));
}
function saveCurrentUser() {
  if (currentUser) {
    localStorage.setItem('softhome_currentUser', JSON.stringify(currentUser));
  } else {
    localStorage.removeItem('softhome_currentUser');
  }
}

// ---------- AUTH ----------
function switchAuthTab(tab) {
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const tabLogin = document.getElementById('tabLogin');
  const tabRegister = document.getElementById('tabRegister');

  if (tab === 'login') {
    loginForm.style.display = 'block';
    registerForm.style.display = 'none';
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
  } else {
    loginForm.style.display = 'none';
    registerForm.style.display = 'block';
    tabLogin.classList.remove('active');
    tabRegister.classList.add('active');
  }
}

function handleRegister() {
  const name = document.getElementById('regName').value.trim();
  const email = document.getElementById('regEmail').value.trim().toLowerCase();
  const password = document.getElementById('regPassword').value;

  if (!name || !email || !password) {
    showToast('Lütfen tüm alanları doldurun.', 'error');
    return;
  }
  if (password.length < 4) {
    showToast('Şifre en az 4 karakter olmalı.', 'error');
    return;
  }
  if (users.some(u => u.email === email)) {
    showToast('Bu e-posta zaten kayıtlı.', 'error');
    return;
  }

  const newUser = {
    id: 'u_' + Date.now(),
    name,
    email,
    password, // basit localStorage demo – gerçek uygulamada hash gerekir
    createdAt: new Date().toISOString()
  };
  users.push(newUser);
  saveUsers();

  currentUser = { id: newUser.id, name: newUser.name, email: newUser.email };
  saveCurrentUser();
  showToast('Kayıt başarılı! Hoş geldin ' + name);
  enterApp();
}

function handleLogin() {
  const email = document.getElementById('loginEmail').value.trim().toLowerCase();
  const password = document.getElementById('loginPassword').value;

  if (!email || !password) {
    showToast('E-posta ve şifre girin.', 'error');
    return;
  }

  const found = users.find(u => u.email === email && u.password === password);
  if (!found) {
    showToast('E-posta veya şifre hatalı.', 'error');
    return;
  }

  currentUser = { id: found.id, name: found.name, email: found.email };
  saveCurrentUser();
  showToast('Hoş geldin ' + found.name);
  enterApp();
}

function handleLogout() {
  currentUser = null;
  saveCurrentUser();
  document.getElementById('appShell').style.display = 'none';
  document.getElementById('authScreen').style.display = 'flex';
  // formları temizle
  document.getElementById('loginEmail').value = '';
  document.getElementById('loginPassword').value = '';
  document.getElementById('regName').value = '';
  document.getElementById('regEmail').value = '';
  document.getElementById('regPassword').value = '';
  switchAuthTab('login');
  showToast('Çıkış yapıldı.');
}

function enterApp() {
  document.getElementById('authScreen').style.display = 'none';
  document.getElementById('appShell').style.display = 'contents';
  // profile güncelle
  updateProfileUI();
  renderPayerSelect();
  renderSplitAvatars();
  renderExpenseList();
  updateWallet();
  updateMemberCount();
  goToTab('screen-home', 'Ev Özetin', 'nav-home');
}

function updateProfileUI() {
  if (!currentUser) return;
  document.getElementById('profileName').textContent = currentUser.name;
  document.getElementById('profileEmail').textContent = currentUser.email;
  const initial = currentUser.name.charAt(0).toUpperCase();
  document.getElementById('profileAvatar').textContent = initial;
}

function updateMemberCount() {
  document.getElementById('memberCount').textContent = users.length;
}

// ---------- THEME ----------
function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.getAttribute('data-theme') === 'dark';
  if (isDark) {
    html.removeAttribute('data-theme');
    localStorage.setItem('softhome_theme', 'light');
  } else {
    html.setAttribute('data-theme', 'dark');
    localStorage.setItem('softhome_theme', 'dark');
  }
  updateThemeUI();
}

function updateThemeUI() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const sw = document.getElementById('themeSwitch');
  const icon = document.getElementById('headerThemeIcon');
  if (sw) sw.classList.toggle('on', isDark);
  if (icon) {
    icon.className = isDark ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
  }
}

function initTheme() {
  const saved = localStorage.getItem('softhome_theme');
  if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
  updateThemeUI();
}

// ---------- NAVIGATION ----------
function goToTab(screenId, title, navId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(screenId).classList.add('active');
  document.getElementById('pageTitle').textContent = title;

  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (navId) {
    const el = document.getElementById(navId);
    if (el) el.classList.add('active');
  }

  if (screenId === 'screen-add') {
    renderPayerSelect();
    renderSplitAvatars();
    calculateRealTime();
  }
  if (screenId === 'screen-home') {
    renderExpenseList();
    updateWallet();
  }
  if (screenId === 'screen-profile') {
    updateProfileUI();
  }
}

// ---------- MODALS ----------
function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.add('show');

  if (id === 'settlementsModal') renderSettlements();
  if (id === 'settlementHistoryModal') renderSettlementHistory();
  if (id === 'householdModal') renderHousehold();
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('show');
}

// ---------- TOAST ----------
function showToast(msg, type) {
  // type: 'success' (varsayılan) veya 'error'
  const notif = document.getElementById('notification');
  const text = document.getElementById('notifText');
  const icon = document.getElementById('notifIcon');
  text.textContent = msg;

  if (type === 'error') {
    icon.className = 'fa-solid fa-circle-xmark';
    icon.style.color = 'var(--danger)';
  } else {
    icon.className = 'fa-solid fa-circle-check';
    icon.style.color = 'var(--success)';
  }

  notif.classList.add('show');
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => {
    notif.classList.remove('show');
  }, 2500);
}

// ---------- CATEGORY ----------
function selectCategory(el, icon, name) {
  document.querySelectorAll('.opt-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  selectedCategory = { icon, name };
}

// ---------- PHOTO ----------
function handlePhoto(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    photoData = e.target.result;
    document.getElementById('previewImage').src = photoData;
    document.getElementById('photoPreview').classList.add('show');
    document.getElementById('uploadBox').style.display = 'none';
  };
  reader.readAsDataURL(file);
}

function removePhoto() {
  photoData = null;
  document.getElementById('cameraInput').value = '';
  document.getElementById('photoPreview').classList.remove('show');
  document.getElementById('uploadBox').style.display = 'flex';
}

// ---------- CURRENCY FORMAT ----------
function formatCurrency(input) {
  let val = input.value.replace(/[^\d.,]/g, '').replace(',', '.');
  input.value = val;
  calculateRealTime();
}

function parseAmount() {
  const raw = document.getElementById('calcAmount').value.replace(',', '.').replace(/[^\d.]/g, '');
  return parseFloat(raw) || 0;
}

// ---------- PAYER & SPLIT ----------
function renderPayerSelect() {
  const sel = document.getElementById('payerSelect');
  if (!sel) return;
  sel.innerHTML = users.map(u =>
    `<option value="${u.id}" ${currentUser && u.id === currentUser.id ? 'selected' : ''}>${u.name}</option>`
  ).join('');
  if (users.length === 0) {
    sel.innerHTML = '<option value="">Kullanıcı yok</option>';
  }
}

function renderSplitAvatars() {
  const container = document.getElementById('avatarsSplitContainer');
  if (!container) return;

  // varsayılan: herkes seçili
  if (selectedSplitIds.length === 0 && users.length > 0) {
    selectedSplitIds = users.map(u => u.id);
  }

  container.innerHTML = users.map(u => {
    const selected = selectedSplitIds.includes(u.id);
    const initial = u.name.charAt(0).toUpperCase();
    return `
      <div class="avatar-chip ${selected ? 'selected' : ''}" onclick="toggleSplit('${u.id}')">
        <div class="av-circle">${initial}</div>
        <span>${u.name}</span>
      </div>
    `;
  }).join('');

  if (users.length === 0) {
    container.innerHTML = '<p style="font-size:13px;color:var(--text-muted);">Henüz kayıtlı kullanıcı yok.</p>';
  }
}

function toggleSplit(id) {
  if (selectedSplitIds.includes(id)) {
    if (selectedSplitIds.length <= 1) return; // en az 1 kişi
    selectedSplitIds = selectedSplitIds.filter(x => x !== id);
  } else {
    selectedSplitIds.push(id);
  }
  renderSplitAvatars();
  calculateRealTime();
}

function calculateRealTime() {
  const amount = parseAmount();
  const count = selectedSplitIds.length || 1;
  const per = amount / count;
  const box = document.getElementById('liveResult');
  if (box) {
    box.innerHTML = `Kişi başı: <strong>${per.toFixed(2)} ₺</strong>`;
  }
}

// ---------- SAVE EXPENSE ----------
function saveExpense() {
  const amount = parseAmount();
  if (amount <= 0) {
    showToast('Geçerli bir tutar girin.', 'error');
    return;
  }
  const desc = document.getElementById('descInput').value.trim() || selectedCategory.name;
  const payerId = document.getElementById('payerSelect').value;
  if (!payerId) {
    showToast('Ödeyen kişi seçin.', 'error');
    return;
  }
  if (selectedSplitIds.length === 0) {
    showToast('En az bir kişi seçin.', 'error');
    return;
  }

  const expense = {
    id: 'e_' + Date.now(),
    amount,
    description: desc,
    category: selectedCategory.name,
    categoryIcon: selectedCategory.icon,
    payerId,
    splitIds: [...selectedSplitIds],
    photo: photoData,
    createdAt: new Date().toISOString(),
    createdBy: currentUser ? currentUser.id : null
  };

  expenses.unshift(expense);
  saveExpenses();

  // formu sıfırla
  document.getElementById('calcAmount').value = '';
  document.getElementById('descInput').value = '';
  removePhoto();
  selectedCategory = { icon: 'fa-utensils', name: 'Yemek' };
  document.querySelectorAll('.opt-btn').forEach((b, i) => {
    b.classList.toggle('active', i === 0);
  });
  selectedSplitIds = users.map(u => u.id);
  calculateRealTime();

  // SADECE "Kaydedildi" – offline/API mesajı yok
  showToast('Kaydedildi');

  // ana ekrana dön
  setTimeout(() => {
    goToTab('screen-home', 'Ev Özetin', 'nav-home');
  }, 400);
}

// ---------- EXPENSE LIST ----------
function applyFilter(filter) {
  currentFilter = filter;
  document.getElementById('activeFilterText').textContent = filter;
  closeModal('filterModal');
  renderExpenseList();
}

function getFilteredExpenses() {
  const now = new Date();
  return expenses.filter(e => {
    const d = new Date(e.createdAt);
    if (currentFilter === 'Bugün') {
      return d.toDateString() === now.toDateString();
    }
    if (currentFilter === 'Son Hafta') {
      return (now - d) < 7 * 24 * 60 * 60 * 1000;
    }
    if (currentFilter === 'Son Ay') {
      return (now - d) < 30 * 24 * 60 * 60 * 1000;
    }
    if (currentFilter === 'Son 3 Ay') {
      return (now - d) < 90 * 24 * 60 * 60 * 1000;
    }
    return true;
  });
}

function renderExpenseList() {
  const list = document.getElementById('expenseList');
  if (!list) return;
  const filtered = getFilteredExpenses();

  if (filtered.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-receipt"></i>
        <p>Henüz harcama yok</p>
      </div>
    `;
    return;
  }

  list.innerHTML = filtered.map(e => {
    const payer = users.find(u => u.id === e.payerId);
    const payerName = payer ? payer.name : '?';
    const dateStr = new Date(e.createdAt).toLocaleDateString('tr-TR', {
      day: 'numeric', month: 'short'
    });
    return `
      <div class="expense-item" onclick="showExpenseDetail('${e.id}')">
        <div class="expense-icon"><i class="fa-solid ${e.categoryIcon || 'fa-box-open'}"></i></div>
        <div class="expense-info">
          <h4>${escapeHtml(e.description)}</h4>
          <p>${payerName} · ${dateStr} · ${e.category}</p>
        </div>
        <div class="expense-amount">${e.amount.toFixed(2)} ₺</div>
      </div>
    `;
  }).join('');
}

function showExpenseDetail(id) {
  const e = expenses.find(x => x.id === id);
  if (!e) return;
  const payer = users.find(u => u.id === e.payerId);
  const splitNames = e.splitIds.map(sid => {
    const u = users.find(x => x.id === sid);
    return u ? u.name : '?';
  }).join(', ');
  const per = e.amount / (e.splitIds.length || 1);

  const content = document.getElementById('detailModalContent');
  content.innerHTML = `
    <div style="margin-bottom:16px;">
      <div style="font-size:28px;font-weight:800;margin-bottom:4px;">${e.amount.toFixed(2)} ₺</div>
      <div style="font-size:14px;color:var(--text-muted);">${escapeHtml(e.description)}</div>
    </div>
    <div style="display:flex;flex-direction:column;gap:10px;font-size:13px;">
      <div style="display:flex;justify-content:space-between;"><span style="color:var(--text-muted);">Kategori</span><span>${e.category}</span></div>
      <div style="display:flex;justify-content:space-between;"><span style="color:var(--text-muted);">Ödeyen</span><span>${payer ? payer.name : '?'}</span></div>
      <div style="display:flex;justify-content:space-between;"><span style="color:var(--text-muted);">Bölüşülen</span><span>${splitNames}</span></div>
      <div style="display:flex;justify-content:space-between;"><span style="color:var(--text-muted);">Kişi başı</span><span>${per.toFixed(2)} ₺</span></div>
      <div style="display:flex;justify-content:space-between;"><span style="color:var(--text-muted);">Tarih</span><span>${new Date(e.createdAt).toLocaleString('tr-TR')}</span></div>
    </div>
    ${e.photo ? `<img src="${e.photo}" style="width:100%;border-radius:12px;margin-top:14px;border:1px solid var(--border-color);">` : ''}
    <button class="btn-main" style="background:var(--danger);margin-top:16px;" onclick="deleteExpense('${e.id}')">
      <i class="fa-solid fa-trash"></i> Harcamayı Sil
    </button>
  `;
  openModal('detailModal');
}

function deleteExpense(id) {
  expenses = expenses.filter(e => e.id !== id);
  saveExpenses();
  closeModal('detailModal');
  renderExpenseList();
  updateWallet();
  showToast('Harcama silindi.');
}

// ---------- WALLET / BALANCES ----------
function computeBalances() {
  // her kullanıcının net bakiyesi: ödediği - payı
  const bal = {};
  users.forEach(u => { bal[u.id] = 0; });

  expenses.forEach(e => {
    const share = e.amount / (e.splitIds.length || 1);
    // ödeyen +amount alır
    if (bal[e.payerId] !== undefined) bal[e.payerId] += e.amount;
    // her bölüşülen -share
    e.splitIds.forEach(sid => {
      if (bal[sid] !== undefined) bal[sid] -= share;
    });
  });
  return bal;
}

function updateWallet() {
  if (!currentUser) return;
  const bal = computeBalances();
  const myBal = bal[currentUser.id] || 0;

  // istatistikler
  let totalExpense = 0;
  let myPaid = 0;
  let myShare = 0;

  expenses.forEach(e => {
    totalExpense += e.amount;
    if (e.payerId === currentUser.id) myPaid += e.amount;
    if (e.splitIds.includes(currentUser.id)) {
      myShare += e.amount / e.splitIds.length;
    }
  });

  document.getElementById('walletBalance').textContent = Math.abs(myBal).toFixed(2);
  document.getElementById('statTotalExpense').textContent = totalExpense.toFixed(2) + ' ₺';
  document.getElementById('statMyPaid').textContent = myPaid.toFixed(2) + ' ₺';
  document.getElementById('statMyShare').textContent = myShare.toFixed(2) + ' ₺';

  const statusEl = document.getElementById('walletStatus');
  if (myBal > 0.01) {
    statusEl.innerHTML = '<i class="fa-solid fa-arrow-down-left"></i> Evden Toplam Alacağın Var';
  } else if (myBal < -0.01) {
    statusEl.innerHTML = '<i class="fa-solid fa-arrow-up-right"></i> Eve Toplam Borcun Var';
  } else {
    statusEl.innerHTML = '<i class="fa-solid fa-check"></i> Hesaplar Denk';
  }

  // debt count
  const transfers = minimizeTransfers(bal);
  const badge = document.getElementById('debtActionCount');
  if (badge) {
    badge.textContent = transfers.length === 0 ? 'Denk' : transfers.length + ' transfer';
  }
}

// ---------- SETTLEMENTS (minimum transfer) ----------
function minimizeTransfers(balances) {
  const debtors = [];
  const creditors = [];
  Object.keys(balances).forEach(id => {
    const v = Math.round(balances[id] * 100) / 100;
    if (v < -0.01) debtors.push({ id, amount: -v });
    else if (v > 0.01) creditors.push({ id, amount: v });
  });

  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  const transfers = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amount, creditors[j].amount);
    transfers.push({
      from: debtors[i].id,
      to: creditors[j].id,
      amount: Math.round(pay * 100) / 100
    });
    debtors[i].amount -= pay;
    creditors[j].amount -= pay;
    if (debtors[i].amount < 0.01) i++;
    if (creditors[j].amount < 0.01) j++;
  }
  return transfers;
}

function renderSettlements() {
  const container = document.getElementById('settlementsListContainer');
  const bal = computeBalances();
  const transfers = minimizeTransfers(bal);

  if (transfers.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-check-circle" style="color:var(--success);"></i>
        <p>Herkesin hesabı denk!</p>
      </div>
    `;
    return;
  }

  container.innerHTML = transfers.map(t => {
    const from = users.find(u => u.id === t.from);
    const to = users.find(u => u.id === t.to);
    return `
      <div class="settle-item">
        <div class="av">${(from ? from.name : '?').charAt(0)}</div>
        <div class="settle-info">
          <h4>${from ? from.name : '?'} → ${to ? to.name : '?'}</h4>
          <p>Ödeme yapılacak</p>
        </div>
        <div class="settle-amount">${t.amount.toFixed(2)} ₺</div>
      </div>
    `;
  }).join('');
}

function renderSettlementHistory() {
  const container = document.getElementById('settlementHistoryContainer');
  if (settlements.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-handshake"></i>
        <p>Henüz ödeşme kaydı yok</p>
      </div>
    `;
    return;
  }
  container.innerHTML = settlements.map(s => `
    <div class="settle-item">
      <div class="av">${s.fromName.charAt(0)}</div>
      <div class="settle-info">
        <h4>${s.fromName} → ${s.toName}</h4>
        <p>${new Date(s.date).toLocaleDateString('tr-TR')}</p>
      </div>
      <div class="settle-amount">${s.amount.toFixed(2)} ₺</div>
    </div>
  `).join('');
}

function renderHousehold() {
  const container = document.getElementById('householdListContainer');
  const bal = computeBalances();

  if (users.length === 0) {
    container.innerHTML = '<p style="color:var(--text-muted);font-size:13px;">Henüz kimse yok. Yukarıdan arkadaş ekle.</p>';
    return;
  }

  container.innerHTML = users.map(u => {
    const b = bal[u.id] || 0;
    const cls = b > 0.01 ? 'positive' : b < -0.01 ? 'negative' : '';
    const label = b > 0.01 ? '+' + b.toFixed(2) + ' ₺' : b < -0.01 ? b.toFixed(2) + ' ₺' : '0.00 ₺';
    const isMe = currentUser && u.id === currentUser.id;
    const isFriend = u.isFriend === true; // sadece isimle eklenenler silinebilir

    return `
      <div class="household-item">
        <div class="av">${u.name.charAt(0).toUpperCase()}</div>
        <div class="hh-info">
          <h4>${escapeHtml(u.name)}${isMe ? ' <span style="font-size:11px;color:var(--primary);">(Sen)</span>' : ''}</h4>
          <p>${u.email || 'Ev arkadaşı'}</p>
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <div class="hh-balance ${cls}">${label}</div>
          ${(!isMe && (isFriend || !u.password)) ? `
            <button onclick="removeFriend('${u.id}')" title="Sil" style="width:32px;height:32px;border-radius:50%;border:none;background:rgba(255,59,48,0.12);color:var(--danger);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:13px;">
              <i class="fa-solid fa-trash"></i>
            </button>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function addFriend() {
  const input = document.getElementById('newFriendName');
  const name = (input.value || '').trim();
  if (!name) {
    showToast('İsim girin.', 'error');
    return;
  }
  // aynı isim var mı?
  if (users.some(u => u.name.toLowerCase() === name.toLowerCase())) {
    showToast('Bu isim zaten listede.', 'error');
    return;
  }

  const friend = {
    id: 'f_' + Date.now(),
    name,
    email: '',
    password: '',
    isFriend: true,
    createdAt: new Date().toISOString()
  };
  users.push(friend);
  saveUsers();

  // bölüşüme de otomatik ekle
  if (!selectedSplitIds.includes(friend.id)) {
    selectedSplitIds.push(friend.id);
  }

  input.value = '';
  renderHousehold();
  updateMemberCount();
  renderPayerSelect();
  renderSplitAvatars();
  showToast(name + ' eklendi');
}

function removeFriend(id) {
  if (currentUser && id === currentUser.id) {
    showToast('Kendini silemezsin.', 'error');
    return;
  }
  const u = users.find(x => x.id === id);
  if (!u) return;

  if (!confirm(u.name + ' listeden silinsin mi?')) return;

  users = users.filter(x => x.id !== id);
  saveUsers();
  selectedSplitIds = selectedSplitIds.filter(x => x !== id);

  renderHousehold();
  updateMemberCount();
  renderPayerSelect();
  renderSplitAvatars();
  updateWallet();
  showToast(u.name + ' silindi');
}

// ---------- UTILS ----------
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------- INIT ----------
document.addEventListener('DOMContentLoaded', () => {
  loadFromStorage();
  initTheme();

  if (currentUser) {
    // oturum açık
    const stillExists = users.some(u => u.id === currentUser.id);
    if (stillExists) {
      enterApp();
    } else {
      currentUser = null;
      saveCurrentUser();
      document.getElementById('authScreen').style.display = 'flex';
    }
  } else {
    document.getElementById('authScreen').style.display = 'flex';
  }
});
