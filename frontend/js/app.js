/**
 * SOFTHOME - Progressive Web App (PWA) Core Application Logic
 * Backend API Entegrasyonu (GET /api/users, GET /api/expenses, POST /api/expenses)
 */

// --- API VE SUNUCU KONFİGÜRASYONU ---
let API_BASE_URL = localStorage.getItem("softhome_api_url") || "http://localhost:5000";
let isApiConnected = false;

const HOUSE_INFO = {
  name: "Güneş Apt. No:4",
  inviteCode: "SOFTHOME-4821",
  currency: "₺"
};

// Çevrimdışı / İlk yükleme için varsayılan yedek üyeler (Backend'den dinamik çekilene kadar)
const FALLBACK_MEMBERS = [
  { id: 1, name: "Halit", email: "halit@softhome.com", avatar: "https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?auto=format&fit=crop&w=150&q=80", role: "Ev Sahibi" },
  { id: 2, name: "Nedim", email: "nedim@softhome.com", avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80", role: "Ev Yöneticisi" },
  { id: 3, name: "Muhammed", email: "muhammed@softhome.com", avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80", role: "Üye" }
];

// --- UYGULAMA DURUMU (STATE) ---
let currentUserId = 2; // Aktif oturum: Nedim
let members = [];
let expenses = [];
let settlements = [];
let activeFilter = "Tümü";
let selectedCategory = { icon: "fa-utensils", name: "Yemek" };
let currentPhotoBase64 = "";

// --- BAŞLATMA ---
document.addEventListener("DOMContentLoaded", async () => {
  initTheme();
  initStorage();
  initServiceWorker();

  const apiUrlInput = document.getElementById("apiUrlInput");
  if (apiUrlInput) apiUrlInput.value = API_BASE_URL;

  // 1. Önce yerel verileri render et (hızlı açılış)
  renderApp();
  calculateRealTime();

  // 2. Ardından Backend API'ye bağlan ve canlı verileri çek
  await syncWithBackend();
});

// --- BACKEND API ENTEGRASYONU (fetch()) ---

/**
 * Backend API ile tam senkronizasyon:
 * - GET /api/users (Dinamik üye listesi)
 * - GET /api/expenses (Dinamik harcama listesi)
 */
async function syncWithBackend() {
  updateApiStatusUI("checking", "Kontrol Ediliyor...");
  
  try {
    // 1. ÜYE LİSTESİNİ ÇEK: GET /api/users
    const usersSuccess = await fetchUsersFromApi();

    // 2. HARCAMALARI ÇEK: GET /api/expenses
    const expensesSuccess = await fetchExpensesFromApi();

    if (usersSuccess || expensesSuccess) {
      setApiOnline(true);
      showToast("Backend API ile senkronize edildi (🟢)");
    } else {
      setApiOnline(false);
    }
  } catch (error) {
    console.warn("Backend API senkronizasyon hatası:", error);
    setApiOnline(false);
  }

  // Arayüzü güncel verilerle yeniden çiz
  renderApp();
  calculateRealTime();
}

/**
 * ÜYE LİSTESİNİ GET /api/users'DAN ÇEK (Hardcoded olmasın kuralı)
 */
async function fetchUsersFromApi() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/users`, {
      method: "GET",
      headers: { "Accept": "application/json" }
    });

    if (!response.ok) {
      throw new Error(`GET /api/users yanıt vermedi: ${response.status}`);
    }

    const data = await response.json();
    if (Array.isArray(data) && data.length > 0) {
      members = data.map((u, index) => {
        const uId = u.id || u.Id;
        const uName = u.username || u.Username || `Kullanıcı ${uId}`;
        const uEmail = u.email || u.Email || `${uName.toLowerCase()}@softhome.com`;
        
        return {
          id: uId,
          name: uName,
          email: uEmail,
          avatar: getAvatarForUser(uName, index),
          role: uName.toLowerCase() === "halit" ? "Ev Sahibi" : uName.toLowerCase() === "nedim" ? "Ev Yöneticisi" : "Üye"
        };
      });

      // Nedim kullanıcısını aktif oturum olarak eşle (eğer listede varsa)
      const nedimUser = members.find(m => m.name.toLowerCase() === "nedim");
      if (nedimUser) {
        currentUserId = nedimUser.id;
      }

      localStorage.setItem("softhome_members", JSON.stringify(members));
      return true;
    }
    return false;
  } catch (err) {
    console.warn("GET /api/users çağrılamadı, yerel kullanıcılar kullanılıyor:", err.message);
    return false;
  }
}

/**
 * HARCAMA LİSTESİNİ GET /api/expenses'DEN ÇEK
 */
async function fetchExpensesFromApi() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/expenses`, {
      method: "GET",
      headers: { "Accept": "application/json" }
    });

    if (!response.ok) {
      throw new Error(`GET /api/expenses yanıt vermedi: ${response.status}`);
    }

    const data = await response.json();
    if (Array.isArray(data)) {
      expenses = data.map(e => {
        const participants = e.participants || e.Participants || [];
        const participantIds = participants.map(p => p.userId || p.UserId);

        return {
          id: String(e.id || e.Id),
          title: e.title || e.Title || "Harcama",
          amount: parseFloat(e.totalAmount || e.TotalAmount || 0),
          payerId: e.payerId || e.PayerId,
          category: detectCategoryIcon(e.title || e.Title),
          categoryName: detectCategoryName(e.title || e.Title),
          participantIds: participantIds.length > 0 ? participantIds : members.map(m => m.id),
          date: e.createdAt || e.CreatedAt || new Date().toISOString(),
          receiptUrl: "",
          note: e.title || e.Title
        };
      });

      localStorage.setItem("softhome_expenses", JSON.stringify(expenses));
      return true;
    }
    return false;
  } catch (err) {
    console.warn("GET /api/expenses çağrılamadı, yerel harcamalar kullanılıyor:", err.message);
    return false;
  }
}

/**
 * YENİ HARCAMA EKLE: POST /api/expenses
 */
async function saveExpense() {
  const amount = getRawAmount();
  const descInput = document.getElementById("descInput");
  const desc = (descInput ? descInput.value.trim() : "") || selectedCategory.name;

  if (amount <= 0) {
    showToast("Lütfen geçerli bir tutar girin.");
    return;
  }

  const activeNodes = document.querySelectorAll(".avatar-opt:not(.excluded)");
  if (activeNodes.length === 0) {
    showToast("Lütfen gideri bölüştürmek için en az 1 kişi seçin.");
    return;
  }

  const participantIds = Array.from(activeNodes).map(node => parseInt(node.getAttribute("data-id")));

  // Ödeyen kişiyi seçiciden al (varsayılan aktif kullanıcı)
  const payerSelect = document.getElementById("payerSelect");
  const payerId = payerSelect ? parseInt(payerSelect.value) : currentUserId;

  // Backend DTO formatı: { expense: { title, totalAmount, payerId }, participantIds: [...] }
  const payload = {
    expense: {
      title: desc,
      totalAmount: amount,
      payerId: payerId
    },
    participantIds: participantIds
  };

  let apiSuccess = false;

  // 1. Backend'e POST /api/expenses isteği gönder
  try {
    const response = await fetch(`${API_BASE_URL}/api/expenses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      apiSuccess = true;
      setApiOnline(true);
      showToast("Harcama API'ye kaydedildi! (POST /api/expenses)");
      // Sunucudan güncel listeyi yeniden çek
      await fetchExpensesFromApi();
    } else {
      console.warn("POST /api/expenses başarısız status:", response.status);
    }
  } catch (apiErr) {
    console.warn("POST /api/expenses ağ hatası:", apiErr.message);
  }

  // 2. Eğer API kapalıysa veya hata verdiyse yerel olarak kaydet (çevrimdışı güvence)
  if (!apiSuccess) {
    const localExpense = {
      id: "exp_" + Date.now(),
      title: desc,
      amount: amount,
      payerId: payerId,
      category: selectedCategory.icon,
      categoryName: selectedCategory.name,
      participantIds: participantIds,
      date: new Date().toISOString(),
      receiptUrl: currentPhotoBase64,
      note: desc
    };

    expenses.unshift(localExpense);
    saveState();
    showToast("Çevrimdışı kaydedildi (API ulaşılamadı)");
  }

  // Formu sıfırla ve ana ekrana dön
  resetAddForm();
  renderApp();
  goToTab("screen-home", "Ev Özetin", "nav-home");
}

/**
 * HARCAMA SİL: DELETE /api/expenses/{id}
 */
async function deleteExpense(expenseId) {
  if (!confirm("Bu harcamayı silmek istediğinize emin misiniz?")) return;

  const numericId = parseInt(expenseId);
  let apiDeleted = false;

  if (!isNaN(numericId) && isApiConnected) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/expenses/${numericId}`, {
        method: "DELETE"
      });
      if (response.ok) {
        apiDeleted = true;
        await fetchExpensesFromApi();
        showToast("Harcama API'den silindi (DELETE)");
      }
    } catch (err) {
      console.warn("DELETE /api/expenses hatası:", err);
    }
  }

  if (!apiDeleted) {
    expenses = expenses.filter(e => e.id !== expenseId);
    saveState();
    showToast("Harcama yerel olarak silindi.");
  }

  closeModal("detailModal");
  renderApp();
}

// --- API DURUM VE URL YÖNETİMİ ---
function setApiOnline(online) {
  isApiConnected = online;
  const statusIcon = document.getElementById("apiStatusIcon");
  const statusPill = document.getElementById("apiStatusPill");
  const modalStatus = document.getElementById("apiModalStatusText");

  if (online) {
    if (statusIcon) {
      statusIcon.style.color = "var(--success)";
      statusIcon.className = "fa-solid fa-server";
    }
    if (statusPill) {
      statusPill.style.background = "var(--success-bg)";
      statusPill.style.color = "var(--success)";
      statusPill.innerText = "Bağlı (Canlı)";
    }
    if (modalStatus) {
      modalStatus.style.color = "var(--success)";
      modalStatus.innerHTML = `<i class="fa-solid fa-circle" style="font-size:8px;"></i> Bağlı (${API_BASE_URL})`;
    }
  } else {
    if (statusIcon) {
      statusIcon.style.color = "var(--warning)";
      statusIcon.className = "fa-solid fa-server";
    }
    if (statusPill) {
      statusPill.style.background = "var(--warning-bg)";
      statusPill.style.color = "var(--warning)";
      statusPill.innerText = "Çevrimdışı (Yerel)";
    }
    if (modalStatus) {
      modalStatus.style.color = "var(--warning)";
      modalStatus.innerHTML = `<i class="fa-solid fa-circle" style="font-size:8px;"></i> Çevrimdışı (Yerel Depolama)`;
    }
  }
}

function updateApiStatusUI(type, text) {
  const modalStatus = document.getElementById("apiModalStatusText");
  if (modalStatus) {
    modalStatus.innerHTML = `<i class="fa-solid fa-spinner fa-spin" style="font-size:10px;"></i> ${text}`;
  }
}

async function testAndSaveApiUrl() {
  const input = document.getElementById("apiUrlInput");
  if (!input) return;

  let url = input.value.trim();
  if (!url) url = "http://localhost:5000";
  if (url.endsWith("/")) url = url.slice(0, -1);

  API_BASE_URL = url;
  localStorage.setItem("softhome_api_url", API_BASE_URL);

  updateApiStatusUI("checking", "Bağlanıyor...");
  showToast("API bağlantısı test ediliyor...");

  await syncWithBackend();

  if (isApiConnected) {
    showToast(`Bağlantı başarılı: ${API_BASE_URL}`);
    closeModal("apiConfigModal");
  } else {
    showToast(`Sunucuya ulaşılamadı: ${API_BASE_URL}`);
  }
}

// --- DİNAMİK AVATAR VE KULLANICI YARDIMCILARI ---
function getAvatarForUser(name, index) {
  const lower = (name || "").toLowerCase();
  if (lower.includes("nedim")) {
    return "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80";
  } else if (lower.includes("halit")) {
    return "https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?auto=format&fit=crop&w=150&q=80";
  } else if (lower.includes("muhammed")) {
    return "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80";
  } else if (lower.includes("ali")) {
    return "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=150&q=80";
  }
  return `https://i.pravatar.cc/150?u=${encodeURIComponent(name || String(index))}`;
}

function detectCategoryIcon(title) {
  const t = (title || "").toLowerCase();
  if (t.includes("yemek") || t.includes("dürüm") || t.includes("restoran") || t.includes("burger")) return "fa-utensils";
  if (t.includes("fatura") || t.includes("internet") || t.includes("elektrik") || t.includes("su") || t.includes("gaz")) return "fa-bolt";
  if (t.includes("market") || t.includes("alışveriş") || t.includes("migros") || t.includes("ev")) return "fa-house";
  if (t.includes("kafe") || t.includes("kahve") || t.includes("özel")) return "fa-mug-hot";
  if (t.includes("taksi") || t.includes("ulaşım") || t.includes("benzin") || t.includes("yol")) return "fa-car";
  return "fa-box-open";
}

function detectCategoryName(title) {
  const t = (title || "").toLowerCase();
  if (t.includes("yemek") || t.includes("restoran")) return "Yemek";
  if (t.includes("fatura") || t.includes("internet")) return "Fatura";
  if (t.includes("market") || t.includes("alışveriş")) return "Market";
  if (t.includes("kafe") || t.includes("kahve")) return "Kafe & Özel";
  if (t.includes("ulaşım") || t.includes("benzin")) return "Ulaşım";
  return "Gider";
}

// --- LOCALSTORAGE & VERİ YÖNETİMİ ---
function initStorage() {
  try {
    const storedMembers = localStorage.getItem("softhome_members");
    const storedExpenses = localStorage.getItem("softhome_expenses");
    const storedSettlements = localStorage.getItem("softhome_settlements");

    members = storedMembers ? JSON.parse(storedMembers) : [...FALLBACK_MEMBERS];
    expenses = storedExpenses ? JSON.parse(storedExpenses) : [];
    settlements = storedSettlements ? JSON.parse(storedSettlements) : [];
    saveState();
  } catch (e) {
    console.error("Storage yüklenirken hata:", e);
    members = [...FALLBACK_MEMBERS];
    expenses = [];
    settlements = [];
  }
}

function saveState() {
  localStorage.setItem("softhome_members", JSON.stringify(members));
  localStorage.setItem("softhome_expenses", JSON.stringify(expenses));
  localStorage.setItem("softhome_settlements", JSON.stringify(settlements));
}

function resetDemoData() {
  if (confirm("Tüm harcamalar ve veriler başlangıç durumuna sıfırlansın mı?")) {
    members = [...FALLBACK_MEMBERS];
    expenses = [];
    settlements = [];
    saveState();
    renderApp();
    showToast("Veriler sıfırlandı.");
    syncWithBackend();
  }
}

// --- TEMA (DARK / LIGHT MODE) ---
function initTheme() {
  const savedTheme = localStorage.getItem("softhome_theme");
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const isDark = savedTheme ? savedTheme === "dark" : prefersDark;
  applyTheme(isDark);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme") === "dark";
  applyTheme(!current);
}

function applyTheme(isDark) {
  const root = document.documentElement;
  const themeSwitch = document.getElementById("themeSwitch");
  const headerThemeIcon = document.getElementById("headerThemeIcon");

  if (isDark) {
    root.setAttribute("data-theme", "dark");
    if (themeSwitch) themeSwitch.classList.add("active");
    if (headerThemeIcon) headerThemeIcon.className = "fa-solid fa-sun";
    localStorage.setItem("softhome_theme", "dark");
  } else {
    root.removeAttribute("data-theme");
    if (themeSwitch) themeSwitch.classList.remove("active");
    if (headerThemeIcon) headerThemeIcon.className = "fa-solid fa-moon";
    localStorage.setItem("softhome_theme", "light");
  }
}

// --- NAVİGASYON ---
function goToTab(screenId, title, navId) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  const targetScreen = document.getElementById(screenId);
  if (targetScreen) targetScreen.classList.add("active");

  const pageTitle = document.getElementById("pageTitle");
  if (pageTitle) pageTitle.innerText = title;

  document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
  if (navId) {
    const navElem = document.getElementById(navId);
    if (navElem) navElem.classList.add("active");
  }

  const content = document.querySelector(".content");
  if (content) content.scrollTop = 0;
}

// --- HESAPLAMA & BORÇ SADELEŞTİRME ALGORİTMASI ---
function computeNetBalances() {
  const balances = {};
  members.forEach(m => { balances[m.id] = 0; });

  // 1. Harcamalardan gelen borç/alacak dengeleri
  expenses.forEach(exp => {
    const payerId = exp.payerId;
    const parts = exp.participantIds;
    if (!parts || parts.length === 0) return;

    const split = exp.amount / parts.length;

    parts.forEach(pId => {
      if (pId !== payerId) {
        balances[payerId] = (balances[payerId] || 0) + split;
        balances[pId] = (balances[pId] || 0) - split;
      }
    });
  });

  // 2. Yapılan ödeşmeler (Settlements)
  settlements.forEach(st => {
    balances[st.fromId] = (balances[st.fromId] || 0) + st.amount;
    balances[st.toId] = (balances[st.toId] || 0) - st.amount;
  });

  return balances;
}

function calculateMinimumCashFlow() {
  const balances = computeNetBalances();

  // Alacaklılar (Pozitif bakiye)
  const creditors = Object.keys(balances)
    .filter(id => balances[id] > 0.01)
    .map(id => ({ userId: parseInt(id), amount: balances[id] }))
    .sort((a, b) => b.amount - a.amount);

  // Borçlular (Negatif bakiye)
  const debtors = Object.keys(balances)
    .filter(id => balances[id] < -0.01)
    .map(id => ({ userId: parseInt(id), amount: Math.abs(balances[id]) }))
    .sort((a, b) => b.amount - a.amount);

  const transactions = [];
  let dIdx = 0;
  let cIdx = 0;

  while (dIdx < debtors.length && cIdx < creditors.length) {
    const debtor = debtors[dIdx];
    const creditor = creditors[cIdx];

    const settleAmount = Math.min(debtor.amount, creditor.amount);

    if (settleAmount > 0.01) {
      const fromUser = members.find(m => m.id === debtor.userId) || { name: `Kullanıcı ${debtor.userId}` };
      const toUser = members.find(m => m.id === creditor.userId) || { name: `Kullanıcı ${creditor.userId}` };

      transactions.push({
        fromId: debtor.userId,
        fromName: fromUser.name,
        fromAvatar: fromUser.avatar,
        toId: creditor.userId,
        toName: toUser.name,
        toAvatar: toUser.avatar,
        amount: Math.round(settleAmount * 100) / 100
      });
    }

    debtor.amount -= settleAmount;
    creditor.amount -= settleAmount;

    if (debtor.amount <= 0.01) dIdx++;
    if (creditor.amount <= 0.01) cIdx++;
  }

  return { balances, transactions };
}

// --- ARAYÜZÜ YENİLE (RENDER APP) ---
function renderApp() {
  renderMemberAvatars();
  renderPayerSelect();
  renderWalletCard();
  renderExpenseList();
  renderSettlementsModal();
  renderSettlementHistory();
  renderHouseholdModal();
}

/**
 * ÜYE LİSTESİNİ DİNAMİK DOLDUR (Hardcoded olmasın kuralı)
 */
function renderMemberAvatars() {
  const container = document.getElementById("avatarsSplitContainer");
  if (!container) return;

  if (members.length === 0) {
    container.innerHTML = `<p style="font-size:12px; color:var(--text-muted); text-align:center; width:100%;">Üye listesi yükleniyor...</p>`;
    return;
  }

  container.innerHTML = members.map(m => {
    return `
      <div class="avatar-opt" data-id="${m.id}" onclick="togglePerson(this)">
        <div class="avatar-opt-img-wrap">
          <img src="${m.avatar}" alt="${escapeHtml(m.name)}">
          <div class="check-badge"><i class="fa-solid fa-check"></i></div>
        </div>
        <span class="name">${escapeHtml(m.name)}</span>
      </div>
    `;
  }).join("");
}

/**
 * ÖDEYEN KİŞİ SEÇİCİSİNİ DİNAMİK DOLDUR
 */
function renderPayerSelect() {
  const select = document.getElementById("payerSelect");
  if (!select) return;

  const currentVal = select.value;
  select.innerHTML = members.map(m => {
    const isSelected = currentVal ? parseInt(currentVal) === m.id : m.id === currentUserId;
    return `<option value="${m.id}" ${isSelected ? "selected" : ""}>${escapeHtml(m.name)} (${m.role})</option>`;
  }).join("");
}

function renderWalletCard() {
  const { balances, transactions } = calculateMinimumCashFlow();
  const myNet = balances[currentUserId] || 0;

  const balanceEl = document.getElementById("walletBalance");
  const statusEl = document.getElementById("walletStatus");
  const totalHouseExpenseEl = document.getElementById("statTotalExpense");
  const myPaidEl = document.getElementById("statMyPaid");
  const myShareEl = document.getElementById("statMyShare");
  const debtActionCountEl = document.getElementById("debtActionCount");

  const absAmount = Math.abs(myNet).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (balanceEl) balanceEl.innerText = absAmount;

  if (statusEl) {
    if (myNet > 0.01) {
      statusEl.className = "wallet-status";
      statusEl.innerHTML = `<i class="fa-solid fa-arrow-down-left"></i> Evden Toplam Alacağın Var`;
    } else if (myNet < -0.01) {
      statusEl.className = "wallet-status debtor";
      statusEl.innerHTML = `<i class="fa-solid fa-arrow-up-right"></i> Eve Toplam Borcun Var`;
    } else {
      statusEl.className = "wallet-status even";
      statusEl.innerHTML = `<i class="fa-solid fa-circle-check"></i> Hesapların Dengede`;
    }
  }

  const totalExpense = expenses.reduce((sum, e) => sum + e.amount, 0);
  const myPaid = expenses.filter(e => e.payerId === currentUserId).reduce((sum, e) => sum + e.amount, 0);
  
  let myShare = 0;
  expenses.forEach(e => {
    if (e.participantIds && e.participantIds.includes(currentUserId)) {
      myShare += (e.amount / e.participantIds.length);
    }
  });

  if (totalHouseExpenseEl) totalHouseExpenseEl.innerText = totalExpense.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ₺";
  if (myPaidEl) myPaidEl.innerText = myPaid.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ₺";
  if (myShareEl) myShareEl.innerText = myShare.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ₺";

  if (debtActionCountEl) {
    if (transactions.length > 0) {
      debtActionCountEl.innerText = `${transactions.length} transfer`;
      debtActionCountEl.style.display = "inline-block";
    } else {
      debtActionCountEl.innerText = "Dengede";
      debtActionCountEl.style.display = "inline-block";
    }
  }
}

// --- HARCAMA LİSTESİ VE FİLTRELEME ---
function filterExpensesByTime(list, filter) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const oneWeekAgo = now.getTime() - (7 * 24 * 60 * 60 * 1000);
  const oneMonthAgo = now.getTime() - (30 * 24 * 60 * 60 * 1000);
  const threeMonthsAgo = now.getTime() - (90 * 24 * 60 * 60 * 1000);

  return list.filter(item => {
    const itemTime = new Date(item.date).getTime();
    switch (filter) {
      case "Bugün":
        return itemTime >= startOfToday;
      case "Son Hafta":
        return itemTime >= oneWeekAgo;
      case "Son Ay":
        return itemTime >= oneMonthAgo;
      case "Son 3 Ay":
        return itemTime >= threeMonthsAgo;
      case "Tümü":
      default:
        return true;
    }
  });
}

function renderExpenseList() {
  const listEl = document.getElementById("expenseList");
  if (!listEl) return;

  const filtered = filterExpensesByTime(expenses, activeFilter);

  if (filtered.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-receipt"></i>
        <p>Seçilen dönemde henüz bir harcama bulunmuyor.</p>
      </div>
    `;
    return;
  }

  const sorted = [...filtered].sort((a, b) => new Date(b.date) - new Date(a.date));

  listEl.innerHTML = sorted.map(exp => {
    const payer = members.find(m => m.id === exp.payerId) || { name: `Kullanıcı ${exp.payerId}` };
    const isPayerMe = exp.payerId === currentUserId;
    const payerText = isPayerMe ? "Sen ödedin" : `${payer.name} ödedi`;

    let splitText = "";
    const activeMembers = members.filter(m => exp.participantIds && exp.participantIds.includes(m.id));
    if (activeMembers.length === members.length && members.length > 0) {
      splitText = `<span class="badge" style="color:var(--success); border-color:var(--success-bg);">Herkese bölündü</span>`;
    } else if (activeMembers.length === 1) {
      splitText = `<span class="badge" style="color:var(--text-main);">Sadece ${activeMembers[0].name} ödeyecek</span>`;
    } else if (activeMembers.length > 0) {
      const names = activeMembers.map(m => m.name);
      const namesString = names.slice(0, -1).join(", ") + " ve " + names[names.length - 1];
      splitText = `<span class="badge active-split">${namesString} arasında bölündü</span>`;
    }

    const photoBadge = exp.receiptUrl ? `
      <i class="fa-solid fa-image" style="color:var(--success); font-size:12px; margin-left:4px; cursor:pointer;" 
         onclick="event.stopPropagation(); openReceiptModal('${exp.receiptUrl}', '${escapeHtml(exp.title)}')"></i>
    ` : "";

    const dateFormatted = formatRelativeDate(exp.date);
    const formattedAmount = exp.amount.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    return `
      <div class="expense-item" onclick="showExpenseDetail('${exp.id}')">
        <div class="expense-icon"><i class="fa-solid ${exp.category}"></i></div>
        <div class="expense-info">
          <h4>${escapeHtml(exp.title)} ${photoBadge}</h4>
          <p>${payerText} • ${dateFormatted}<br>${splitText}</p>
        </div>
        <div class="expense-amount">
          <h4>${formattedAmount} ₺</h4>
          <p>${exp.categoryName || "Gider"}</p>
        </div>
      </div>
    `;
  }).join("");
}

function formatRelativeDate(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Bugün";
  if (diffDays === 1) return "Dün";
  if (diffDays < 7) return `${diffDays} gün önce`;
  return date.toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
}

function escapeHtml(str) {
  return (str || "").replace(/[&<>"']/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[m]);
}

// --- FİLTRE MODALI ---
function applyFilter(timeframe) {
  activeFilter = timeframe;
  const filterTextEl = document.getElementById("activeFilterText");
  if (filterTextEl) filterTextEl.innerText = timeframe;

  closeModal("filterModal");
  renderExpenseList();
}

// --- KİM KİME NE VERECEK? MODALI ---
function renderSettlementsModal() {
  const container = document.getElementById("settlementsListContainer");
  if (!container) return;

  const { transactions } = calculateMinimumCashFlow();

  if (transactions.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding:20px 0;">
        <i class="fa-solid fa-handshake" style="color:var(--success); font-size:32px; margin-bottom:8px;"></i>
        <p style="color:var(--text-main); font-weight:700;">Hesaplar Dengede!</p>
        <p style="font-size:12px; margin-top:4px;">Şu anda kimsenin kimseye borcu bulunmuyor.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = transactions.map(t => {
    const isMeDebtor = t.fromId === currentUserId;
    const isMeCreditor = t.toId === currentUserId;

    return `
      <div class="settlement-card">
        <div class="settlement-route">
          <div class="settlement-party">
            <span class="party-name">${t.fromName} ${isMeDebtor ? '<span style="color:var(--danger); font-size:10px;">(Sen)</span>' : ''}</span>
            <span class="party-role">Ödeyen (Borçlu)</span>
          </div>
          <i class="fa-solid fa-arrow-right settlement-arrow"></i>
          <div class="settlement-party">
            <span class="party-name">${t.toName} ${isMeCreditor ? '<span style="color:var(--success); font-size:10px;">(Sen)</span>' : ''}</span>
            <span class="party-role">Alan (Alacaklı)</span>
          </div>
        </div>
        <div class="settlement-right">
          <div class="settlement-amount">${t.amount.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺</div>
          <button class="settle-action-btn" onclick="settleUp(${t.fromId}, ${t.toId}, ${t.amount}, '${escapeHtml(t.fromName)}', '${escapeHtml(t.toName)}')">
            <i class="fa-solid fa-check"></i> Borcu Kapat
          </button>
        </div>
      </div>
    `;
  }).join("");
}

function settleUp(fromId, toId, amount, fromName, toName) {
  if (confirm(`${fromName} kişisinin ${toName} kişisine olan ${amount.toFixed(2)} ₺ borcu kapatılsın mı?`)) {
    const newSettlement = {
      id: "set_" + Date.now(),
      fromId: fromId,
      toId: toId,
      amount: amount,
      date: new Date().toISOString(),
      note: `${fromName} ➔ ${toName} borç kapatması`
    };

    settlements.unshift(newSettlement);
    saveState();
    renderApp();
    showToast(`${fromName} ➔ ${toName} borcu başarıyla kapatıldı!`);
  }
}

// --- ÖDEŞMELER GEÇMİŞİ MODALI ---
function renderSettlementHistory() {
  const container = document.getElementById("settlementHistoryContainer");
  if (!container) return;

  if (settlements.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding:20px 0;">
        <i class="fa-solid fa-clock-rotate-left"></i>
        <p>Henüz tamamlanmış bir ödeşme bulunmuyor.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = settlements.map(s => {
    const from = members.find(m => m.id === s.fromId) || { name: `Kullanıcı ${s.fromId}` };
    const to = members.find(m => m.id === s.toId) || { name: `Kullanıcı ${s.toId}` };
    const dateFormatted = new Date(s.date).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });

    return `
      <div class="settlement-card">
        <div class="settlement-party">
          <span class="party-name">${from.name} ➔ ${to.name}</span>
          <span class="party-role">${dateFormatted} • ${escapeHtml(s.note || "Ödeşme")}</span>
        </div>
        <div class="settlement-amount" style="color:var(--success);">
          +${s.amount.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺
        </div>
      </div>
    `;
  }).join("");
}

// --- EV HALKI YÖNETİMİ MODALI ---
function renderHouseholdModal() {
  const container = document.getElementById("householdListContainer");
  if (!container) return;

  const { balances } = calculateMinimumCashFlow();

  container.innerHTML = members.map(m => {
    const b = balances[m.id] || 0;
    let bClass = "even";
    let bText = "0.00 ₺";
    if (b > 0.01) {
      bClass = "success";
      bText = `+${b.toFixed(2)} ₺`;
    } else if (b < -0.01) {
      bClass = "danger";
      bText = `${b.toFixed(2)} ₺`;
    }

    return `
      <div class="settlement-card" style="margin-bottom:8px;">
        <div style="display:flex; align-items:center; gap:12px;">
          <img src="${m.avatar}" style="width:40px; height:40px; border-radius:12px; object-fit:cover;">
          <div>
            <div style="font-weight:700; font-size:14px; color:var(--text-main);">${escapeHtml(m.name)} ${m.id === currentUserId ? '<span style="font-size:10px; color:var(--text-muted);">(Sen)</span>' : ''}</div>
            <div style="font-size:11px; color:var(--text-muted);">${m.role} • ${escapeHtml(m.email)}</div>
          </div>
        </div>
        <div style="font-weight:700; font-size:13px; color:var(--${bClass === 'success' ? 'success' : bClass === 'danger' ? 'danger' : 'text-muted'});">
          ${bText}
        </div>
      </div>
    `;
  }).join("");
}

function copyInviteCode() {
  const code = HOUSE_INFO.inviteCode;
  navigator.clipboard.writeText(code).then(() => {
    showToast(`Ev davet kodu kopyalandı: ${code}`);
  }).catch(() => {
    showToast(`Davet Kodu: ${code}`);
  });
}

// --- YENİ HARCAMA FORMU İŞLEMLERİ ---
function selectCategory(element, iconClass, categoryName) {
  document.querySelectorAll(".opt-btn").forEach(btn => btn.classList.remove("active"));
  element.classList.add("active");
  selectedCategory = { icon: iconClass, name: categoryName };
}

function togglePerson(element) {
  element.classList.toggle("excluded");
  calculateRealTime();
}

function formatCurrency(input) {
  let val = input.value.replace(/[^\d.]/g, "");
  let parts = val.split(".");
  if (parts.length > 2) parts = [parts[0], parts.slice(1).join("")];
  if (parts[0]) parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  input.value = parts.join(".");
  calculateRealTime();
}

function getRawAmount() {
  const input = document.getElementById("calcAmount");
  if (!input) return 0;
  let raw = input.value.replace(/,/g, "");
  return parseFloat(raw) || 0;
}

function calculateRealTime() {
  const amount = getRawAmount();
  const activeNodes = document.querySelectorAll(".avatar-opt:not(.excluded)");
  const count = activeNodes.length;
  const resultBox = document.getElementById("liveResult");
  if (!resultBox) return;

  if (count === 0) {
    resultBox.innerHTML = `<span style="color:var(--danger); font-weight:700;"><i class="fa-solid fa-triangle-exclamation"></i> Lütfen en az 1 kişi seçin!</span>`;
  } else {
    const split = (amount / count).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    resultBox.innerHTML = `Kişi başı: <strong>${split} ₺</strong> (${count} Kişi)`;
  }
}

function handlePhoto(input) {
  if (input.files && input.files[0]) {
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = function (e) {
      currentPhotoBase64 = e.target.result;
      const previewImg = document.getElementById("previewImage");
      const previewCont = document.getElementById("photoPreview");
      const uploadBox = document.getElementById("uploadBox");

      if (previewImg) previewImg.src = currentPhotoBase64;
      if (previewCont) previewCont.style.display = "block";
      if (uploadBox) uploadBox.style.display = "none";
    };
    reader.readAsDataURL(file);
  }
}

function removePhoto() {
  const cameraInput = document.getElementById("cameraInput");
  const previewCont = document.getElementById("photoPreview");
  const uploadBox = document.getElementById("uploadBox");

  if (cameraInput) cameraInput.value = "";
  currentPhotoBase64 = "";
  if (previewCont) previewCont.style.display = "none";
  if (uploadBox) uploadBox.style.display = "flex";
}

function resetAddForm() {
  const descInput = document.getElementById("descInput");
  const calcAmount = document.getElementById("calcAmount");
  if (descInput) descInput.value = "";
  if (calcAmount) calcAmount.value = "";
  removePhoto();
  document.querySelectorAll(".avatar-opt.excluded").forEach(el => el.classList.remove("excluded"));
  calculateRealTime();
}

// --- HARCAMA DETAYI ---
function showExpenseDetail(expenseId) {
  const exp = expenses.find(e => e.id === expenseId);
  if (!exp) return;

  const payer = members.find(m => m.id === exp.payerId) || { name: `Kullanıcı ${exp.payerId}` };
  const participants = members.filter(m => exp.participantIds && exp.participantIds.includes(m.id)).map(m => m.name).join(", ");

  const receiptHTML = exp.receiptUrl ? `
    <div style="margin: 14px 0;">
      <div style="font-size:11px; font-weight:700; color:var(--text-muted); margin-bottom:6px;">FİŞ / GÖRSEL:</div>
      <img src="${exp.receiptUrl}" style="width:100%; max-height:220px; object-fit:cover; border-radius:14px; border:1px solid var(--border-color);">
    </div>
  ` : "";

  const container = document.getElementById("detailModalContent");
  if (container) {
    const splitCount = exp.participantIds ? exp.participantIds.length : 1;
    container.innerHTML = `
      <div style="text-align:center; margin-bottom:16px;">
        <div class="expense-icon" style="margin: 0 auto 10px; width:54px; height:54px; font-size:24px;">
          <i class="fa-solid ${exp.category}"></i>
        </div>
        <h3 style="font-size:20px; font-weight:700; color:var(--text-main);">${escapeHtml(exp.title)}</h3>
        <div style="font-size:28px; font-weight:800; color:var(--text-main); margin-top:4px;">
          ${exp.amount.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺
        </div>
      </div>

      <div style="background:var(--card-bg); border:1px solid var(--border-color); border-radius:16px; padding:16px; margin-bottom:16px; font-size:13px; line-height:1.8;">
        <div><strong>Ödeyen:</strong> ${escapeHtml(payer.name)}</div>
        <div><strong>Kategori:</strong> ${escapeHtml(exp.categoryName || "Gider")}</div>
        <div><strong>Tarih:</strong> ${new Date(exp.date).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })}</div>
        <div><strong>Bölüşenler:</strong> ${escapeHtml(participants || "Belirtilmemiş")}</div>
        <div><strong>Kişi Başı:</strong> ${(exp.amount / splitCount).toFixed(2)} ₺</div>
      </div>

      ${receiptHTML}

      <button class="btn-main" style="background:var(--danger); color:#FFFFFF; margin-top:10px;" onclick="deleteExpense('${exp.id}')">
        <i class="fa-solid fa-trash"></i> Bu Harcamayı Sil
      </button>
    `;
    openModal("detailModal");
  }
}

function openReceiptModal(url, title) {
  const modalImg = document.getElementById("receiptModalImage");
  const modalTitle = document.getElementById("receiptModalTitle");
  if (modalImg) modalImg.src = url;
  if (modalTitle) modalTitle.innerText = title;
  openModal("receiptModal");
}

// --- MODAL AÇ/KAPAT ---
function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add("show");
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove("show");
}

// --- TOAST BİLDİRİMİ ---
let toastTimeout = null;
function showToast(message) {
  const notif = document.getElementById("notification");
  const notifText = document.getElementById("notifText");
  if (!notif || !notifText) return;

  notifText.innerText = message;
  notif.classList.add("show");

  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    notif.classList.remove("show");
  }, 3200);
}

// --- PWA SERVICE WORKER ---
function initServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js")
        .then(reg => console.log("PWA Service Worker registered:", reg.scope))
        .catch(err => console.log("Service Worker error:", err));
    });
  }
}
