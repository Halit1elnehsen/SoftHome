const paths = {
  home: "M3 10 12 3l9 7M5 9v11h5v-6h4v6h5V9",
  building: "M4 21V7l8-4 8 4v14M8 21v-4h8v4M8 9h1m6 0h1M8 13h1m6 0h1",
  grid: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  receipt: "M5 3v18l3-2 4 2 4-2 3 2V3l-3 2-4-2-4 2-3-2M9 9h6M9 13h6",
  arrows: "M4 7h15m-4-4 4 4-4 4M20 17H5m4-4-4 4 4 4",
  users:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M17 5a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.9M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  heart:
    "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8",
  help: "M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2-3 4M12 17h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  moon: "M21 12.8A9 9 0 0 1 11.2 3 9 9 0 1 0 21 12.8",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M9 3l-1 3-3 1-2 3 2 2-1 3 2 3 3-1 2 4h3l1-3 3-1 2-3-2-2 1-3-2-3-3 1-2-4z",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4",
  plus: "M12 5v14M5 12h14",
  x: "M6 6l12 12M6 18 18 6",
  check: "M5 12l4 4L19 6",
  split:
    "M12 3v6M5 21v-5a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v5M2 18l3 3 3-3M16 18l3 3 3-3",
  search: "M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  wallet: "M20 8V5H5a3 3 0 0 0 0 6h16v9H5a3 3 0 0 1-3-3V8M16 14h5M16 14v3h5",
  arrow: "M4 12h16m-6-6 6 6-6 6",
  up: "M7 17 17 7M7 7h10v10",
  down: "M7 7l10 10M7 17h10V7",
  info: "M12 11v6M12 7h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  market: "M3 8h18l-2 12H5L3 8M8 8l4-6 4 6M9 12v4M15 12v4",
  bolt: "M13 2 3 14h8l-1 8 11-13h-8z",
  food: "M4 3v6a3 3 0 0 0 6 0V3M7 3v18M20 21V3c-4 2-5 6-5 10h5",
  internet:
    "M2 8a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0M8.5 16a5.5 5.5 0 0 1 7 0M12 20h.01",
  leaf: "M20 3C9 1 3 8 4 14c4 10 18 4 16-11M4 21 15 10",
  sun: "M12 3V1M12 23v-2M3 12H1M23 12h-2M4 4l2 2M18 18l2 2M20 4l-2 2M6 18l-2 2M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0",
  "chevron-down": "m6 9 6 6 6-6",
};
const icon = (name) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true">${(paths[name] || paths.home)
    .split("|")
    .map((d) => `<path d="${d}"/>`)
    .join("")}</svg>`;
const $ = (s) => document.querySelector(s);
const escapeHTML = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const money = (cents) =>
  new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
const shortMoney = (cents) =>
  new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  }).format(cents / 100);
const monthName = (m) =>
  new Intl.DateTimeFormat("tr-TR", { month: "long", year: "numeric" }).format(
    new Date(m + "-15T12:00:00"),
  );
const dateName = (d) =>
  new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short" }).format(
    new Date(d + "T12:00:00"),
  );
const categories = [
  { id: "home", name: "Kira", icon: "home", color: "#648362" },
  { id: "market", name: "Market", icon: "market", color: "#b6c68d" },
  { id: "bill", name: "Faturalar", icon: "bolt", color: "#aaa1c0" },
  { id: "food", name: "Yeme içme", icon: "food", color: "#cfaa8c" },
  { id: "internet", name: "İnternet", icon: "internet", color: "#92b1b4" },
  { id: "other", name: "Diğer", icon: "leaf", color: "#b3baaa" },
];
let data = {
  members: [],
  expenses: [],
  payments: [],
  theme: localStorage.getItem("softhome_theme") || "light",
  household: null,
};
let month = new Date().toISOString().slice(0, 7),
  page = "overview",
  filter = "all",
  search = "",
  toastTimer,
  lastFocus;
const getMember = (id) =>
  data.members.find((m) => m.id === id) || {
    id,
    name: "Eski ev arkadaşı",
    className: "avatar-new",
  };
const avatar = (id, size = "") => {
  const m = getMember(id);
  return `<span class="avatar ${escapeHTML(m.className || "avatar-new")} ${size}" aria-hidden="true">${escapeHTML(m.name.charAt(0))}</span>`;
};
const currentExpenses = () =>
  data.expenses
    .filter((e) => e.date.startsWith(month))
    .sort((a, b) => b.date.localeCompare(a.date));
const persist = () => {
  try {
    localStorage.setItem("softhome_theme", data.theme);
  } catch {}
};
function hydrate() {
  document
    .querySelectorAll("[data-icon]")
    .forEach((el) => (el.innerHTML = icon(el.dataset.icon)));
  if (data.household) {
    document
      .querySelectorAll("[data-house-name]")
      .forEach((el) => (el.textContent = data.household.name));
    const me = getMember("me");
    $("#profile-name").textContent = me.name;
    $("#profile-role").textContent = me.role;
    $("#profile-initial").textContent = me.name.charAt(0);
    $(".profile-button").textContent = me.name.charAt(0);
  }
}

function totals() {
  const totals = Object.fromEntries(
    data.members.map((m) => [m.id, { paid: 0, share: 0, net: 0 }]),
  );
  for (const e of currentExpenses()) {
    if (!totals[e.payer]) continue;
    totals[e.payer].paid += e.cents;
    const valid = e.split.filter((id) => totals[id]);
    if (!valid.length) continue;
    const quotient = Math.floor(e.cents / valid.length),
      remainder = e.cents % valid.length;
    valid.forEach(
      (id, index) =>
        (totals[id].share += quotient + (index < remainder ? 1 : 0)),
    );
  }
  Object.values(totals).forEach((t) => (t.net = t.paid - t.share));
  for (const p of data.payments.filter((p) => p.month === month)) {
    if (totals[p.from]) totals[p.from].net += p.cents;
    if (totals[p.to]) totals[p.to].net -= p.cents;
  }
  return totals;
}
function transfers() {
  const t = totals(),
    owed = Object.entries(t)
      .filter(([, v]) => v.net < 0)
      .map(([id, v]) => ({ id, cents: -v.net }))
      .sort((a, b) => b.cents - a.cents),
    due = Object.entries(t)
      .filter(([, v]) => v.net > 0)
      .map(([id, v]) => ({ id, cents: v.net }))
      .sort((a, b) => b.cents - a.cents);
  const result = [];
  let i = 0,
    j = 0;
  while (i < owed.length && j < due.length) {
    const cents = Math.min(owed[i].cents, due[j].cents);
    if (cents > 0) result.push({ from: owed[i].id, to: due[j].id, cents });
    owed[i].cents -= cents;
    due[j].cents -= cents;
    if (owed[i].cents === 0) i++;
    if (due[j].cents === 0) j++;
  }
  return result;
}
function heading(title, subtitle) {
  const months = [
    ...new Set([
      new Date().toISOString().slice(0, 7),
      month,
      ...data.expenses.map((e) => e.date.slice(0, 7)),
    ]),
  ]
    .sort()
    .reverse();
  return `<div class="page-heading"><div><p class="greeting">Merhaba ${escapeHTML(getMember("me").name.split(" ")[0])}, evine hoş geldin.</p><h1>${title}</h1><p class="page-subtitle">${subtitle}</p></div><div class="heading-actions"><select class="month-picker" id="month-picker" aria-label="Görüntülenecek ay">${months.map((m) => `<option value="${m}" ${m === month ? "selected" : ""}>${monthName(m)}</option>`).join("")}</select><button class="button button-primary" data-action="add">${icon("plus")}Harcama ekle</button></div></div>`;
}
function transactionRows(list) {
  return list
    .map((e) => {
      const cat = categories.find((c) => c.id === e.category) || categories[5];
      return `<button class="transaction-row" data-detail="${escapeHTML(e.id)}" aria-label="${escapeHTML(e.name)}, ${money(e.cents)}, ayrıntıları göster"><span class="transaction-main"><span class="category-icon cat-${cat.id}">${icon(cat.icon)}</span><span style="min-width:0"><strong>${escapeHTML(e.name)}</strong><small>${dateName(e.date)} <span aria-hidden="true">·</span> ${cat.name}${e.receiptUrl ? " · Fatura eklendi" : ""}</small></span></span><span class="transaction-payer">${avatar(e.payer)}${escapeHTML(getMember(e.payer).name)}</span><span class="transaction-amount">${money(e.cents)}</span></button>`;
    })
    .join("");
}
function transactionPanel(list, full = false) {
  return `<div class="transaction-panel ${full ? "full-list" : ""}"><div class="transaction-head"><span>Harcama</span><span>Ödeyen</span><span>Tutar</span></div>${list.length ? transactionRows(list) : `<div class="empty-message">${icon("receipt")}<strong>Henüz gösterilecek harcama yok.</strong><p>İlk harcamanı ekle veya arama ve kategori seçimini değiştir.</p><button class="button button-primary" data-action="add">Harcama ekle</button></div>`}</div>`;
}
function overview() {
  const list = currentExpenses(),
    sum = list.reduce((s, e) => s + e.cents, 0),
    t = totals(),
    me = t.me,
    budget = data.household.budgetCents,
    cats = categories
      .map((c) => ({
        ...c,
        cents: list
          .filter((e) => e.category === c.id)
          .reduce((s, e) => s + e.cents, 0),
      }))
      .filter((c) => c.cents > 0);
  const budgetPercent = Math.round((sum / budget) * 100);
  const totalParts = money(sum).split(",");
  return (
    heading(
      "Evde hesaplar net.",
      "Birlikte yaşamanın güzel taraflarına daha çok zaman.",
    ) +
    `
<div class="overview-top"><section class="home-balance" aria-label="Evin toplam gideri"><div class="hero-topline"><span class="hero-label">Bu ay evin toplam gideri</span><span class="hero-period">${monthName(month)}</span></div><div class="home-total">${totalParts[0]}<span class="money-decimal">,${totalParts[1] || "00"}</span></div><p class="hero-caption">${list.length} harcama, ${data.members.length} ev arkadaşı. Her şey kayıt altında.</p><div class="house-art" aria-hidden="true"><svg viewBox="0 0 160 125"><path d="m15 45 65-32 65 32v66H15V45ZM15 45l65 32 65-32M80 77v34M46 61V30m68 30V30M47 62l33-17 34 16M80 45V13"/><path d="M96 94h21v17M32 81h19v21H32zM108 75v9m-5-4h10"/></svg></div><div class="hero-footer"><div class="hero-footer-left"><div class="member-stack">${data.members
      .slice(0, 4)
      .map((m) => avatar(m.id))
      .join(
        "",
      )}</div><span><strong>Bizim evimiz</strong> · ${data.members.length} kişi paylaşıyoruz</span></div><span class="hero-spark">${icon("check")}Güncel</span></div></section>
<section class="personal-balance" aria-label="Senin bakiyen"><div class="section-topline"><span class="small-label">Senin bakiyen</span><span class="status-tag">${icon(me.net < 0 ? "up" : "check")}${me.net < 0 ? "Ödemen var" : me.net > 0 ? "Alacağın var" : "Hesaplar tamam"}</span></div><div class="personal-value">${money(Math.abs(me.net))}</div><p class="personal-caption">${me.net < 0 ? "Ev arkadaşlarına yapacağın toplam ödeme." : me.net > 0 ? "Ev arkadaşlarından alacağın toplam tutar." : "Bu ay için açık bakiyen bulunmuyor."}</p><div class="personal-bottom"><span>Senin payın <strong>${money(me.share)}</strong></span><button class="text-button" data-action="balances">Detayları gör${icon("arrow")}</button></div></section></div>
<div class="content-grid"><section><div class="section-heading"><div><h2>Son harcamalar</h2><p class="section-note">Evin gündelik küçük hesapları.</p></div><button class="text-button" data-action="expenses">Tümünü gör${icon("arrow")}</button></div>${transactionPanel(list.slice(0, 4))}<section class="household-section"><div class="section-heading"><h2>Ev arkadaşların</h2><button class="text-button" data-action="house">Evimiz${icon("arrow")}</button></div><div class="household-row">${data.members
      .slice(0, 3)
      .map(
        (m) =>
          `<div class="member-card">${avatar(m.id)}<div><h3>${escapeHTML(m.name)}${m.id === "me" ? '<span class="me-tag">Sen</span>' : ""}</h3><p>${shortMoney(t[m.id]?.paid || 0)} ödedi</p></div><span class="member-status">${icon("check")}</span></div>`,
      )
      .join("")}</div></section></section>
<div class="right-stack"><section class="budget-panel"><div class="budget-top"><h2>Ev bütçesi</h2><span>${monthName(month)}</span></div><div class="budget-total-line"><strong>${shortMoney(sum)}</strong><span>/ ${shortMoney(budget)} bütçe</span></div><div class="budget-bar" role="img" aria-label="Aylık bütçenin yüzde ${budgetPercent} kadarı harcandı">${cats.map((c) => `<span style="width:${Math.min((c.cents / budget) * 100, 100)}%;background:${c.color}"></span>`).join("")}</div><p class="budget-hint">${sum <= budget ? `Bütçenizden <strong>${shortMoney(budget - sum)}</strong> daha var.` : `Bütçe <strong>${shortMoney(sum - budget)}</strong> aşıldı.`}</p><div class="category-list">${cats.map((c) => `<div class="category-line"><span class="category-dot" style="background:${c.color}"></span><span>${c.name}</span><strong>${shortMoney(c.cents)}</strong></div>`).join("")}</div></section><div class="insight-note">${icon("leaf")}<p>Harcama eklerken paylaşıma katılacak kişileri seçebilirsin. Her harcama herkese ait olmak zorunda değil.</p></div></div></div>`
  );
}
function expenses() {
  return (
    heading("Harcamalar", "Kimin ne ödediği, neyin paylaşıldığı burada.") +
    `<div class="filters"><div class="search"><span>${icon("search")}</span><input id="expense-search" type="search" placeholder="Harcamalarda ara..." aria-label="Harcamalarda ara" value="${escapeHTML(search)}"></div><div class="filter-chips" aria-label="Harcama kategorileri">${[{ id: "all", name: "Tümü" }, ...categories.filter((c) => ["home", "market", "bill", "food"].includes(c.id))].map((c) => `<button class="filter-chip" data-filter="${c.id}" aria-pressed="${filter === c.id}">${c.name}</button>`).join("")}</div></div><div id="expense-results">${expenseResults()}</div>`
  );
}
function expenseResults() {
  const list = currentExpenses().filter(
    (e) =>
      (filter === "all" || e.category === filter) &&
      e.name.toLocaleLowerCase("tr").includes(search.toLocaleLowerCase("tr")),
  );
  return `<p class="expense-count">${list.length} harcama <span aria-hidden="true">·</span> Toplam <strong>${money(list.reduce((s, e) => s + e.cents, 0))}</strong></p>${transactionPanel(list, true)}`;
}
function balances() {
  const list = currentExpenses(),
    sum = list.reduce((s, e) => s + e.cents, 0),
    t = totals(),
    debt = transfers();
  return (
    heading(
      "Herkesin payı belli.",
      "Kimin kime ödeme yapacağını tek bakışta gör.",
    ) +
    `<div class="summary-strip"><div><span>Toplam ortak harcama</span><strong>${money(sum)}</strong></div><div><span>Senin ödediğin</span><strong>${money(t.me.paid)}</strong></div><div><span>Senin harcama payın</span><strong>${money(t.me.share)}</strong></div></div><div class="member-balances">${data.members.map((m) => `<section class="balance-person"><div class="person-title">${avatar(m.id)}<div><h3>${escapeHTML(m.name)}${m.id === "me" ? " (Sen)" : ""}</h3><small>${escapeHTML(m.role)}</small></div></div><dl><div><dt>Ödediği</dt><dd>${money(t[m.id].paid)}</dd></div><div><dt>Harcama payı</dt><dd>${money(t[m.id].share)}</dd></div></dl><div class="net-value">${money(Math.abs(t[m.id].net))}<small>${t[m.id].net < 0 ? "Ödemesi gerekiyor" : t[m.id].net > 0 ? "Alacağı bulunuyor" : "Bakiyesi kapandı"}</small></div></section>`).join("")}</div><section class="transfer-panel"><h2>Kim kime ödeyecek?</h2><p class="transfer-intro">Net bakiyeleri kapatmak için ${debt.length} ödeme${debt.length ? " yeterli." : " gerekmiyor."}</p>${debt.length ? debt.map((p, i) => `<div class="transfer"><div class="transfer-people"><span class="person">${avatar(p.from)}<strong>${escapeHTML(getMember(p.from).name)}</strong></span>${icon("arrow")}<span class="person">${avatar(p.to)}<strong>${escapeHTML(getMember(p.to).name)}</strong></span></div><span class="transfer-amount">${money(p.cents)}</span><button class="button button-secondary" data-pay="${i}">${icon("check")}Ödendi olarak işaretle</button></div>`).join("") : `<div class="success-state">${icon("check")}<strong>Hesaplar kapandı.</strong><p>Bu ay için herkesin bakiyesi eşitlendi.</p></div>`}</section>${
      data.payments.filter((p) => p.month === month).length
        ? `<section class="payment-history"><h2>Kaydedilen ödemeler</h2>${data.payments
            .filter((p) => p.month === month)
            .map(
              (p) =>
                `<div class="history-row"><span>${escapeHTML(getMember(p.from).name)} → ${escapeHTML(getMember(p.to).name)}</span><strong>${money(p.cents)} ödendi</strong></div>`,
            )
            .join("")}</section>`
        : ""
    }`
  );
}
function house() {
  const owner = data.household.ownerId === data.meId;
  return (
    heading(
      "Birlikte kurduğumuz ev.",
      "Gerçek hesaplar, ortak harcamalar ve evinizin düzeni.",
    ) +
    `<div class="member-page-grid"><section class="house-info">${icon("building")}<h2>${escapeHTML(data.household.name)}</h2><p>Herkesin payı, herkesin içi rahat.</p><div class="house-facts"><div><strong>${data.members.length}</strong><span>Ev arkadaşı</span></div><div><strong>${currentExpenses().length}</strong><span>Bu ayki harcama</span></div></div>${owner ? `<form id="house-form"><label for="house-name">Evinizin adı</label><input id="house-name" name="name" value="${escapeHTML(data.household.name)}" maxlength="80" required><label for="house-budget">Aylık bütçe (₺)</label><input id="house-budget" name="budget" inputmode="decimal" value="${data.household.budgetCents / 100}" required><button class="button button-secondary" type="submit">Ev bilgilerini kaydet</button></form>` : ""}</section><section class="house-members"><h2>Ev arkadaşları</h2>${data.members.map((m) => `<div class="member-card">${avatar(m.id)}<div><h3>${escapeHTML(m.name)}${m.id === "me" ? '<span class="me-tag">Sen</span>' : ""}</h3><p>${escapeHTML(m.role)}</p></div></div>`).join("")}${owner ? '<button class="button button-primary" id="create-invitation">Katılım kodu oluştur</button><p class="section-note">Ev arkadaşın kendi hesabıyla kayıt olup bu kodla evinize katılabilir. Kod 7 gün geçerlidir; yeni kod eskisini iptal eder.</p><div id="invitation-result" role="status"></div>' : ""}<form id="join-form"><label for="join-code">Bir eve katıl</label><input id="join-code" name="code" placeholder="Ev yöneticisinin verdiği kod" maxlength="100" required><button class="button button-secondary" type="submit">Eve katıl</button><p class="section-note">Yalnızca henüz harcama ve başka üye içermeyen hesabından başka bir eve katılabilirsin.</p></form></section></div>`
  );
}
const titles = {
  overview: "Ev özeti",
  expenses: "Harcamalar",
  balances: "Borç paylaşımı",
  house: "Ev arkadaşları",
};
function render() {
  if (!data.household) return;
  const route = location.hash.slice(1);
  page = Object.hasOwn(titles, route) ? route : "overview";
  $("#page").innerHTML = { overview, expenses, balances, house }[page]();
  $("#crumb-page").textContent = titles[page];
  document.querySelectorAll("[data-page]").forEach((a) => {
    if (a.dataset.page === page) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  document.documentElement.dataset.theme = data.theme || "light";
  $("#theme-label").textContent =
    data.theme === "dark" ? "Açık görünüm" : "Koyu görünüm";
  hydrate();
}
function navigate(target) {
  if (location.hash === "#" + target) render();
  else location.hash = target;
  window.scrollTo({ top: 0, behavior: "instant" });
}
function showToast(message) {
  clearTimeout(toastTimer);
  $("#toast-text").textContent = message;
  $("#toast").hidden = false;
  hydrate();
  toastTimer = setTimeout(() => ($("#toast").hidden = true), 3800);
}
function openDialog(dialog) {
  lastFocus = document.activeElement;
  dialog.showModal();
}
function closeDialog(dialog) {
  dialog.close();
  if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
}
function info(title, html) {
  $("#info-title").textContent = title;
  $("#info-content").innerHTML = html;
  hydrate();
  openDialog($("#info-dialog"));
}
function parseCents(value) {
  let s = String(value).trim().replace(/\s/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return NaN;
  return Math.round(Number(s) * 100);
}
function updateSplit() {
  const cents = parseCents($("#expense-amount").value),
    count = $$("#split-members input:checked").length;
  $("#split-preview-text").textContent =
    Number.isFinite(cents) && cents > 0 && count
      ? `${count} kişi arasında, kişi başı yaklaşık ${money(Math.round(cents / count))}.`
      : "Tutarı gir, kişi başı payı görelim.";
}
function $$(selector) {
  return [...document.querySelectorAll(selector)];
}
function openExpense() {
  const form = $("#expense-form");
  form.reset();
  $("#expense-category").innerHTML = categories
    .map((c) => `<option value="${c.id}">${c.name}</option>`)
    .join("");
  $("#expense-category").value = "market";
  $("#expense-payer").innerHTML = data.members
    .map(
      (m) =>
        `<option value="${escapeHTML(m.id)}">${escapeHTML(m.name)}${m.id === "me" ? " (Sen)" : ""}</option>`,
    )
    .join("");
  $("#split-members").innerHTML = data.members
    .map(
      (m) =>
        `<label><input type="checkbox" name="split" value="${escapeHTML(m.id)}" checked>${escapeHTML(m.name)}${m.id === "me" ? " (Sen)" : ""}</label>`,
    )
    .join("");
  $("#expense-date").value =
    month === new Date().toISOString().slice(0, 7)
      ? new Date().toISOString().slice(0, 10)
      : month + "-01";
  clearReceipt();
  $("#error-summary").hidden = true;
  $$(".field-error").forEach((e) => (e.textContent = ""));
  $$("[aria-invalid]").forEach((e) => e.removeAttribute("aria-invalid"));
  updateSplit();
  openDialog($("#expense-dialog"));
}
function expenseDetail(id) {
  const e = data.expenses.find((e) => String(e.id) === String(id));
  if (!e) return;
  const cat = categories.find((c) => c.id === e.category);
  info(
    e.name,
    `<div class="detail-value">${money(e.cents)}</div><div class="detail-rows"><div><span>Kategori</span><strong>${cat?.name || "Diğer"}</strong></div><div><span>Tarih</span><strong>${dateName(e.date)} ${e.date.slice(0, 4)}</strong></div><div><span>Ödeyen</span><strong>${escapeHTML(getMember(e.payer).name)}</strong></div><div><span>Paylaşanlar</span><strong>${e.split.map((id) => escapeHTML(getMember(id).name)).join(", ")}</strong></div><div><span>Kişi başı pay</span><strong>≈ ${money(Math.round(e.cents / e.split.length))}</strong></div></div><div class="saved-receipt">${e.receiptUrl ? `<h3>Fatura / fiş fotoğrafı</h3><a href="${escapeHTML(e.receiptUrl)}" target="_blank" rel="noopener"><img src="${escapeHTML(e.receiptUrl)}" alt="${escapeHTML(e.name)} harcamasının faturası"><span>Tam boy görüntüle</span></a>` : '<p class="section-note">Bu harcamaya fotoğraf eklenmemiş.</p>'}</div><div class="dialog-actions"><button class="button button-primary" data-close>Tamam</button></div>`,
  );
}
document.addEventListener("click", async (event) => {
  if (event.target.closest(".skip")) {
    event.preventDefault();
    $("#main").focus();
    return;
  }
  const close = event.target.closest("[data-close]");
  if (close) {
    closeDialog(close.closest("dialog"));
    return;
  }
  const detail = event.target.closest("[data-detail]");
  if (detail) {
    expenseDetail(detail.dataset.detail);
    return;
  }
  const chip = event.target.closest("[data-filter]");
  if (chip) {
    filter = chip.dataset.filter;
    render();
    return;
  }
  const pay = event.target.closest("[data-pay]");
  if (pay) {
    const p = transfers()[Number(pay.dataset.pay)];
    if (!p) return;
    info(
      "Ödemeyi kaydet",
      `<div class="info-body"><p><strong>${escapeHTML(getMember(p.from).name)}</strong> tarafından <strong>${escapeHTML(getMember(p.to).name)}</strong> kişisine yapılan <strong>${money(p.cents)}</strong> ödemeyi kayıtlarına ekle.</p><p>Bu işlem para transferi yapmaz; yalnızca evin hesaplarını günceller.</p><button class="button button-primary" data-confirm-payment="${Number(pay.dataset.pay)}">${icon("check")}Ödendi olarak kaydet</button></div>`,
    );
    return;
  }
  const confirm = event.target.closest("[data-confirm-payment]");
  if (confirm) {
    const p = transfers()[Number(confirm.dataset.confirmPayment)];
    if (p) {
      confirm.disabled = true;
      try {
        await api("/api/workspace/payments", {
          method: "POST",
          body: JSON.stringify({
            fromUserId: getMember(p.from).serverId,
            toUserId: getMember(p.to).serverId,
            cents: p.cents,
            month,
            requestId: crypto.randomUUID(),
          }),
        });
        closeDialog($("#info-dialog"));
        await loadWorkspace();
        showToast("Ödeme kaydedildi. Bakiyeler güncellendi.");
      } catch (e) {
        showToast(e.message);
        confirm.disabled = false;
      }
    }
    return;
  }
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (!action) return;
  if (Object.hasOwn(titles, action)) {
    navigate(action);
    return;
  }
  if (action === "add") openExpense();
  if (action === "remove-receipt") clearReceipt();
  if (action === "logout") {
    try {
      await api("/api/auth/logout", { method: "POST" });
      data = {
        members: [],
        expenses: [],
        payments: [],
        household: null,
        theme: data.theme,
      };
      clearReceipt();
      showAuth();
      await loadCsrf();
    } catch (e) {
      showToast(e.message);
    }
    return;
  }
  if (action === "theme") {
    data.theme = data.theme === "dark" ? "light" : "dark";
    persist();
    render();
  }
  if (action === "help")
    info(
      "SoftHome nasıl çalışır?",
      `<div class="info-body"><p><strong>1. Harcamayı ekle.</strong> Tutarı, ödeyen kişiyi ve paylaşıma katılacak ev arkadaşlarını seç.</p><p><strong>2. Payını gör.</strong> SoftHome, her kişinin ödediği tutarı ve harcama payını hesaplar.</p><p><strong>3. Hesapları kapat.</strong> Borç paylaşımı ekranından kimin kime ödeme yapacağını gör ve yapılan ödemeleri kaydet.</p><p>Kayıtlar, hesabına bağlı evin veritabanında tutulur. Fatura fotoğrafı ekleyebilir ve ev arkadaşlarını katılım koduyla aynı eve dahil edebilirsin.</p><button class="button button-primary" data-close>Anladım</button></div>`,
    );
  if (action === "notifications")
    info(
      "Evden haberler",
      `<div class="info-body"><p><strong>Bu ay ${currentExpenses().length} harcama eklendi.</strong><br>Ev özetinden son işlemleri inceleyebilirsin.</p><p><strong>${transfers().length ? transfers().length + " ödeme ile hesaplar kapanabilir." : "Bu ay açık ödeme kalmadı."}</strong><br>Borç paylaşımı ekranında güncel bakiyeleri görebilirsin.</p><button class="button button-primary" data-action="go-balances">Borç paylaşımını aç</button></div>`,
    );
  if (action === "go-balances") {
    closeDialog($("#info-dialog"));
    navigate("balances");
  }
});
document.addEventListener("change", (event) => {
  if (event.target.id === "month-picker") {
    month = event.target.value;
    render();
  }
  if (event.target.closest("#split-members")) updateSplit();
});
document.addEventListener("input", (event) => {
  if (event.target.id === "expense-amount") updateSplit();
  if (event.target.id === "expense-search") {
    search = event.target.value;
    $("#expense-results").innerHTML = expenseResults();
  }
});
$("#expense-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.target),
    name = String(form.get("name") || "").trim(),
    cents = parseCents(form.get("amount")),
    split = form.getAll("split"),
    date = String(form.get("date") || "");
  const errors = [];
  $$(".field-error").forEach((e) => (e.textContent = ""));
  $$("[aria-invalid]").forEach((e) => e.removeAttribute("aria-invalid"));
  if (!name) {
    $("#name-error").textContent = "Harcama için kısa bir açıklama yaz.";
    $("#expense-name").setAttribute("aria-invalid", "true");
    errors.push(["expense-name", "Harcama açıklamasını yaz."]);
  }
  if (!Number.isFinite(cents) || cents <= 0 || cents > 100000000) {
    $("#amount-error").textContent = "0’dan büyük, geçerli bir tutar gir.";
    $("#expense-amount").setAttribute("aria-invalid", "true");
    errors.push(["expense-amount", "Geçerli bir tutar gir."]);
  }
  if (!split.length) {
    $("#split-error").textContent = "En az bir kişi seç.";
    errors.push(["split-members", "Paylaşacak kişileri seç."]);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    errors.push(["expense-date", "Geçerli bir tarih seç."]);
    $("#expense-date").setAttribute("aria-invalid", "true");
  }
  if (receiptInvalid)
    errors.push([
      "expense-receipt",
      "Geçerli bir fatura fotoğrafı seç veya fotoğrafı kaldır.",
    ]);
  if (errors.length) {
    $("#error-summary").innerHTML =
      "<strong>Şu alanları kontrol et:</strong>" +
      errors
        .map(
          ([id, message]) =>
            `<a href="#${id}" data-error-target="${id}">${message}</a>`,
        )
        .join("");
    $("#error-summary").hidden = false;
    $("#error-summary").focus();
    return;
  }
  const button = event.target.querySelector("[type=submit]");
  button.disabled = true;
  button.textContent = "Kaydediliyor…";
  try {
    const body = new FormData();
    body.append(
      "payload",
      JSON.stringify({
        name,
        cents,
        category: String(form.get("category")),
        payerId: getMember(String(form.get("payer"))).serverId,
        date,
        participantIds: split.map((id) => getMember(id).serverId),
      }),
    );
    const file = $("#expense-receipt").files[0];
    if (file) body.append("receipt", file);
    await api("/api/workspace/expenses", { method: "POST", body });
    month = date.slice(0, 7);
    closeDialog($("#expense-dialog"));
    clearReceipt();
    await loadWorkspace();
    showToast("Harcama ve fatura kaydedildi. Herkesin payı güncellendi.");
  } catch (e) {
    $("#error-summary").textContent = e.message;
    $("#error-summary").hidden = false;
    $("#error-summary").focus();
  } finally {
    button.disabled = false;
    button.innerHTML = icon("check") + "Harcamayı kaydet";
  }
});
document.addEventListener("click", (event) => {
  const a = event.target.closest("[data-error-target]");
  if (a) {
    event.preventDefault();
    const target = document.getElementById(a.dataset.errorTarget);
    (target?.matches("input")
      ? target
      : target?.querySelector("input")
    )?.focus();
  }
});
$$("dialog").forEach((dialog) => {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      const r = dialog.getBoundingClientRect();
      if (
        event.clientX < r.left ||
        event.clientX > r.right ||
        event.clientY < r.top ||
        event.clientY > r.bottom
      )
        closeDialog(dialog);
    }
  });
  dialog.addEventListener("cancel", () => {
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
  });
});
window.addEventListener("hashchange", render);

let csrfToken = "",
  authMode = "login",
  receiptObjectUrl = "",
  receiptInvalid = false;

async function loadCsrf() {
  const response = await fetch("/api/auth/csrf", {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error("Sunucuya bağlanılamadı. Biraz sonra tekrar dene.");
  const json = await response.json();
  csrfToken = json.token;
}
async function api(path, options = {}) {
  const headers = new Headers(options.headers || {}),
    method = options.method || "GET";
  if (!["GET", "HEAD"].includes(method)) {
    if (!csrfToken) await loadCsrf();
    headers.set("X-CSRF-TOKEN", csrfToken);
  }
  if (options.body && !(options.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  let response;
  try {
    response = await fetch(path, {
      ...options,
      headers,
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    throw new Error(
      "Sunucuya ulaşılamadı. Bağlantını kontrol edip tekrar dene.",
    );
  }
  let json = null;
  if (response.headers.get("content-type")?.includes("json"))
    json = await response.json();
  if (!response.ok) {
    const error = new Error(
      json?.message ||
        (response.status === 401
          ? "Oturumun sona ermiş veya giriş bilgilerin hatalı."
          : response.status === 413
            ? "Fotoğraf en fazla 5 MB olabilir."
            : response.status === 429
              ? "Çok sık deneme yapıldı. Biraz sonra tekrar dene."
              : "İşlem tamamlanamadı. Sayfayı yenileyip tekrar dene."),
    );
    error.status = response.status;
    throw error;
  }
  return json;
}
function alias(id, current) {
  return Number(id) === Number(current) ? "me" : String(id);
}
async function loadWorkspace() {
  let result;
  try {
    result = await api("/api/workspace");
  } catch (e) {
    if (e.status === 401) showAuth();
    throw e;
  }
  const myId = result.me.id;
  data = {
    theme: data.theme,
    meId: myId,
    email: result.me.email,
    household: result.household,
    members: result.members.map((m, i) => ({
      id: alias(m.id, myId),
      serverId: m.id,
      name: m.name,
      role: m.id === result.household.ownerId ? "Ev yöneticisi" : "Ev arkadaşı",
      className:
        m.id === myId
          ? "avatar-me"
          : ["avatar-ayse", "avatar-deniz", "avatar-new"][i % 3],
    })),
    expenses: result.expenses.map((e) => ({
      ...e,
      payer: alias(e.payer, myId),
      split: e.split.map((id) => alias(id, myId)),
    })),
    payments: result.payments.map((p) => ({
      ...p,
      from: alias(p.from, myId),
      to: alias(p.to, myId),
    })),
  };
  $("#auth-shell").hidden = true;
  $("#app-shell").hidden = false;
  render();
}
function authMessage(message, error = false) {
  const box = $("#auth-message");
  box.textContent = message;
  box.classList.toggle("auth-error", error);
  box.hidden = false;
  box.focus();
}
function setAuthMode(mode) {
  authMode = mode;
  const register = mode === "register";
  $("#register-fields").hidden = !register;
  $("#password-hint").hidden = !register;
  $("#auth-title").textContent = register
    ? "Birlikte yaşamaya bir hesap."
    : "Evine hoş geldin.";
  $("#auth-description").textContent = register
    ? "Kendi bilgilerinle kaydol; e-postanı doğrulayarak başla."
    : "Kayıtlı hesabınla giriş yap.";
  $("#auth-submit").textContent = register ? "Hesap oluştur" : "Giriş yap";
  $("#auth-password").autocomplete = register
    ? "new-password"
    : "current-password";
  $("#auth-note").innerHTML = register
    ? 'Zaten hesabın var mı? <button type="button" data-auth-mode="login">Giriş yap</button>'
    : 'Hesabın yok mu? <button type="button" data-auth-mode="register">Kayıt ol</button>';
  $("#login-tab").classList.toggle("active", !register);
  $("#register-tab").classList.toggle("active", register);
  $("#auth-message").hidden = true;
}
function showAuth() {
  document.querySelectorAll("dialog[open]").forEach((d) => d.close());
  $("#app-shell").hidden = true;
  $("#auth-shell").hidden = false;
  $("#page").innerHTML = "";
  setAuthMode("login");
  hydrate();
}
async function boot() {
  hydrate();
  showAuth();
  try {
    await loadCsrf();
    const url = new URL(location.href),
      token = url.searchParams.get("verify");
    if (token) {
      history.replaceState({}, "", location.pathname + location.hash);
      const response = await api("/api/auth/confirm-email", {
        method: "POST",
        body: JSON.stringify({ token }),
      });
      authMessage(response.message);
      return;
    }
    try {
      await loadWorkspace();
    } catch (e) {
      if (e.status !== 401) authMessage(e.message, true);
    }
  } catch (e) {
    authMessage(e.message, true);
  }
}
document.addEventListener("click", (event) => {
  const mode = event.target.closest("[data-auth-mode]");
  if (mode) setAuthMode(mode.dataset.authMode);
});
$("#toggle-password").addEventListener("click", () => {
  const input = $("#auth-password"),
    show = input.type === "password";
  input.type = show ? "text" : "password";
  $("#toggle-password").textContent = show ? "Gizle" : "Göster";
  $("#toggle-password").setAttribute(
    "aria-label",
    show ? "Şifreyi gizle" : "Şifreyi göster",
  );
});
$("#auth-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = $("#auth-email"),
    password = $("#auth-password"),
    name = $("#auth-name");
  if (
    !email.value.trim() ||
    !email.checkValidity() ||
    !/^\S+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())
  ) {
    authMessage("Geçerli bir e-posta adresi gir.", true);
    email.focus();
    return;
  }
  if (!password.value) {
    authMessage("Şifreni gir.", true);
    password.focus();
    return;
  }
  if (
    authMode === "register" &&
    (!name.value.trim() || password.value.length < 12)
  ) {
    authMessage("Adını ve en az 12 karakterlik şifreni gir.", true);
    (!name.value.trim() ? name : password).focus();
    return;
  }
  const button = $("#auth-submit"),
    register = authMode === "register";
  button.disabled = true;
  button.textContent = register ? "Hesabın hazırlanıyor…" : "Giriş yapılıyor…";
  try {
    const result = await api("/api/auth/" + (register ? "register" : "login"), {
      method: "POST",
      body: JSON.stringify({
        email: email.value.trim(),
        password: password.value,
        ...(register
          ? {
              name: name.value.trim(),
              householdName: $("#auth-house").value.trim(),
            }
          : {}),
      }),
    });
    password.value = "";
    if (register) {
      setAuthMode("login");
      authMessage(result.message);
    } else {
      await loadCsrf();
      await loadWorkspace();
    }
  } catch (e) {
    authMessage(e.message, true);
  } finally {
    button.disabled = false;
    button.textContent =
      authMode === "register" ? "Hesap oluştur" : "Giriş yap";
  }
});
function clearReceipt() {
  if (receiptObjectUrl) URL.revokeObjectURL(receiptObjectUrl);
  receiptObjectUrl = "";
  receiptInvalid = false;
  $("#expense-receipt").value = "";
  $("#receipt-preview").hidden = true;
  $("#receipt-thumbnail").removeAttribute("src");
  $("#receipt-error").textContent = "";
}
$("#expense-receipt").addEventListener("change", () => {
  if (receiptObjectUrl) URL.revokeObjectURL(receiptObjectUrl);
  const file = $("#expense-receipt").files[0];
  receiptInvalid = false;
  $("#receipt-preview").hidden = true;
  $("#receipt-error").textContent = "";
  if (!file) return;
  if (
    file.size > 5 * 1024 * 1024 ||
    !["image/jpeg", "image/png", "image/webp"].includes(file.type)
  ) {
    receiptInvalid = true;
    $("#receipt-error").textContent =
      file.size > 5 * 1024 * 1024
        ? "Fotoğraf en fazla 5 MB olabilir."
        : "JPEG, PNG veya WebP biçiminde bir fotoğraf seç.";
    return;
  }
  receiptObjectUrl = URL.createObjectURL(file);
  $("#receipt-thumbnail").src = receiptObjectUrl;
  $("#receipt-file-name").textContent = file.name;
  $("#receipt-preview").hidden = false;
});
$("#expense-dialog").addEventListener("close", clearReceipt);
$("#receipt-thumbnail").addEventListener("error", () => {
  if (!receiptObjectUrl) return;
  receiptInvalid = true;
  $("#receipt-error").textContent = "Fotoğraf okunamadı. Başka bir dosya seç.";
});
document.addEventListener("click", async (event) => {
  if (!event.target.closest("#create-invitation")) return;
  const button = event.target.closest("button");
  button.disabled = true;
  try {
    const response = await api("/api/workspace/household/invitation", {
      method: "POST",
    });
    const result = $("#invitation-result");
    result.innerHTML =
      '<label for="invitation-code">Ev arkadaşınla paylaşacağın kod</label><input id="invitation-code" readonly><p class="section-note">Bu kodu yalnızca evine katılmasını istediğin kişilerle paylaş.</p>';
    $("#invitation-code").value = response.code;
  } catch (e) {
    showToast(e.message);
  } finally {
    button.disabled = false;
  }
});
document.addEventListener("submit", async (event) => {
  if (!["house-form", "join-form"].includes(event.target.id)) return;
  event.preventDefault();
  const form = new FormData(event.target),
    button = event.target.querySelector("[type=submit]");
  button.disabled = true;
  try {
    if (event.target.id === "house-form") {
      const budgetCents = parseCents(form.get("budget"));
      if (!Number.isFinite(budgetCents) || budgetCents <= 0)
        throw new Error("Geçerli bir aylık bütçe gir.");
      await api("/api/workspace/household", {
        method: "PUT",
        body: JSON.stringify({
          name: String(form.get("name")).trim(),
          budgetCents,
        }),
      });
    } else {
      await api("/api/workspace/household/join", {
        method: "POST",
        body: JSON.stringify({ code: String(form.get("code")).trim() }),
      });
    }
    await loadWorkspace();
    showToast("Ev bilgileri güncellendi.");
  } catch (e) {
    showToast(e.message);
    button.disabled = false;
  }
});

boot();

if ("serviceWorker" in navigator)
  navigator.serviceWorker
    .register("./sw.js", { updateViaCache: "none" })
    .then((r) => r.update())
    .catch(() => {});
