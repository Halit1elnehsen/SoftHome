import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { JSDOM } from "jsdom";

const html = await readFile(
  new URL("../../frontend/index.html", import.meta.url),
  "utf8",
);
const source = await readFile(
  new URL("../../frontend/js/app.js", import.meta.url),
  "utf8",
);
const until = async (predicate) => {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("UI update did not complete");
};

test("Database names are rendered and the receipt travels in the same expense request", async () => {
  const dom = new JSDOM(html, {
    url: "https://softhome.test/",
    runScripts: "outside-only",
  });
  const w = dom.window;
  w.Headers = Headers;
  w.scrollTo = () => {};
  w.crypto.randomUUID = randomUUID;
  w.URL.createObjectURL = () => "blob:receipt-test";
  w.URL.revokeObjectURL = () => {};
  w.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.open = false;
    this.dispatchEvent(new w.Event("close"));
  };
  const workspace = {
    me: { id: 11, name: "Kayıtlı Hesap", email: "registered@example.org" },
    household: { id: 2, name: "Kayıtlı Ev", ownerId: 11, budgetCents: 3000000 },
    members: [
      { id: 11, name: "Kayıtlı Hesap" },
      { id: 12, name: "Diğer Kayıtlı Hesap" },
    ],
    expenses: [],
    payments: [],
  };
  let upload;
  w.fetch = async (path, options = {}) => {
    if (path === "/api/auth/csrf") return Response.json({ token: "test-csrf" });
    if (path === "/api/workspace" && !options.method)
      return Response.json(workspace);
    if (path === "/api/workspace/expenses" && options.method === "POST") {
      assert.equal(options.headers.get("X-CSRF-TOKEN"), "test-csrf");
      assert.ok(options.body instanceof w.FormData);
      const payload = JSON.parse(options.body.get("payload"));
      assert.equal(payload.payerId, 11);
      assert.deepEqual(payload.participantIds, [11, 12]);
      assert.equal(payload.cents, 15025);
      assert.equal(payload.name, "Fotoğraflı harcama");
      assert.equal(options.body.get("receipt").name, "fatura.png");
      upload = payload;
      const saved = {
        id: 50,
        name: payload.name,
        cents: payload.cents,
        category: payload.category,
        payer: 11,
        date: payload.date,
        split: [11, 12],
        receiptUrl: "/api/workspace/expenses/50/receipt",
      };
      workspace.expenses.push(saved);
      return Response.json(saved, { status: 201 });
    }
    throw new Error("Unexpected request: " + path);
  };
  try {
    w.eval(source);
    await until(() => !w.document.querySelector("#app-shell").hidden);
    assert.equal(
      w.document.querySelector("#profile-name").textContent,
      "Kayıtlı Hesap",
    );
    assert.equal(
      w.document.querySelector("[data-house-name]").textContent,
      "Kayıtlı Ev",
    );
    assert.doesNotMatch(
      w.document.querySelector("#app-shell").textContent,
      /Halid|Ayşe|Deniz|Çınar/,
    );
    w.document.querySelector('[data-action="add"]').click();
    assert.equal(w.document.querySelector("#expense-dialog").open, true);
    w.document.querySelector("#expense-name").value = "Fotoğraflı harcama";
    w.document.querySelector("#expense-amount").value = "150,25";
    const file = new w.File(
      [Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])],
      "fatura.png",
      { type: "image/png" },
    );
    Object.defineProperty(
      w.document.querySelector("#expense-receipt"),
      "files",
      { value: [file], configurable: true },
    );
    w.document
      .querySelector("#expense-receipt")
      .dispatchEvent(new w.Event("change", { bubbles: true }));
    assert.equal(w.document.querySelector("#receipt-preview").hidden, false);
    w.document
      .querySelector("#expense-form")
      .dispatchEvent(
        new w.Event("submit", { bubbles: true, cancelable: true }),
      );
    await until(() => upload && w.document.querySelector('[data-detail="50"]'));
    assert.equal(w.document.querySelector("#expense-dialog").open, false);
    w.document.querySelector('[data-detail="50"]').click();
    assert.equal(w.document.querySelector("#info-dialog").open, true);
    assert.equal(
      w.document.querySelector(".saved-receipt img").getAttribute("src"),
      "/api/workspace/expenses/50/receipt",
    );
    assert.equal(w.localStorage.getItem("softhome_users"), null);
    assert.equal(w.localStorage.getItem("softhome_expenses"), null);
  } finally {
    dom.window.close();
  }
});

test("Invalid email is blocked before sending a login request", async () => {
  const dom = new JSDOM(html, {
      url: "https://softhome.test/",
      runScripts: "outside-only",
    }),
    w = dom.window;
  w.Headers = Headers;
  w.scrollTo = () => {};
  w.crypto.randomUUID = randomUUID;
  let loginCalls = 0;
  w.fetch = async (path) => {
    if (path === "/api/auth/csrf") return Response.json({ token: "test-csrf" });
    if (path === "/api/workspace") return Response.json({}, { status: 401 });
    loginCalls++;
    return Response.json({ message: "Denied" }, { status: 401 });
  };
  try {
    w.eval(source);
    await new Promise((r) => setTimeout(r, 20));
    w.document.querySelector("#auth-email").value = "wrong-address";
    w.document.querySelector("#auth-password").value = "test-only-password";
    w.document
      .querySelector("#auth-form")
      .dispatchEvent(
        new w.Event("submit", { bubbles: true, cancelable: true }),
      );
    assert.equal(loginCalls, 0);
    assert.equal(w.document.querySelector("#auth-message").hidden, false);
    assert.match(
      w.document.querySelector("#auth-message").textContent,
      /Geçerli bir e-posta/,
    );
  } finally {
    dom.window.close();
  }
});

test("A housemate's changes refresh automatically, preserve drafts, and remain unread until opened", async () => {
  const dom = new JSDOM(html, {
    url: "https://softhome.test/",
    runScripts: "outside-only",
  });
  const w = dom.window;
  w.Headers = Headers;
  w.scrollTo = () => {};
  w.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  const workspace = {
    revision: 0,
    me: { id: 11, name: "Ben", email: "me@example.org" },
    household: { id: 2, name: "Ortak Ev", ownerId: 11, budgetCents: 3000000 },
    members: [
      { id: 11, name: "Ben" },
      { id: 12, name: "Arkadaşım" },
    ],
    expenses: [],
    payments: [],
  };
  const feed = { householdId: 2, latestId: 0, unreadCount: 0, items: [] };
  let tick,
    readThrough,
    offline = false,
    feedCalls = 0;
  const nativeTimeout = w.setTimeout.bind(w);
  w.setTimeout = (callback, delay, ...args) => {
    if (delay === 3000) {
      tick = callback;
      return 123456;
    }
    return nativeTimeout(callback, delay, ...args);
  };
  w.fetch = async (path, options = {}) => {
    if (path === "/api/auth/csrf") return Response.json({ token: "csrf" });
    if (path === "/api/workspace") return Response.json(workspace);
    if (path === "/api/workspace/notifications") {
      feedCalls++;
      if (offline) throw new Error("offline");
      return Response.json(feed);
    }
    if (path === "/api/workspace/notifications/read") {
      assert.equal(options.headers.get("X-CSRF-TOKEN"), "csrf");
      readThrough = JSON.parse(options.body).throughId;
      feed.unreadCount = 0;
      feed.items.forEach((item) => {
        item.unread = false;
      });
      return new Response(null, { status: 204 });
    }
    if (path === "/api/auth/logout") return new Response(null, { status: 204 });
    throw new Error("Unexpected request: " + path);
  };
  try {
    w.eval(source);
    await until(
      () =>
        w.document.querySelector("#sync-status").textContent ===
        "Ev ile bağlantı güncel",
    );
    assert.equal(
      w.document.querySelector(".notification-button i").hidden,
      true,
    );
    w.document.querySelector('[data-action="add"]').click();
    w.document.querySelector("#expense-name").value = "Kaybolmayan taslak";
    workspace.revision = feed.latestId = 1;
    feed.unreadCount = 1;
    feed.items = [
      {
        id: 1,
        message: "Arkadaşım “<img src=x onerror=alert(1)>” harcamasını ekledi.",
        createdAt: "2026-11-16T12:00:00Z",
        unread: true,
      },
    ];
    workspace.expenses.push({
      id: 70,
      name: "Arkadaşımın harcaması",
      cents: 4000,
      category: "market",
      payer: 12,
      date: new Date().toISOString().slice(0, 10),
      split: [11, 12],
      receiptUrl: null,
    });
    await tick();
    assert.equal(
      w.document.querySelector("#expense-name").value,
      "Kaybolmayan taslak",
    );
    assert.equal(w.document.querySelector("#expense-dialog").open, true);
    assert.equal(
      w.document.querySelector(".notification-button i").hidden,
      false,
    );
    assert.match(
      w.document.querySelector("#toast-text").textContent,
      /Arkadaşım/,
    );
    w.document.querySelector("#expense-dialog").close();
    await tick();
    assert.ok(w.document.querySelector('[data-detail="70"]'));
    w.document.querySelector('[data-action="notifications"]').click();
    await until(
      () =>
        readThrough === 1 &&
        w.document.querySelector(".notification-button i").hidden,
    );
    assert.match(
      w.document.querySelector(".notification-list").textContent,
      /<img src=x/,
    );
    assert.equal(w.document.querySelector(".notification-list img"), null);
    w.document.querySelector("#info-dialog").close();
    offline = true;
    await tick();
    assert.match(
      w.document.querySelector("#sync-status").textContent,
      /Bağlantı kesildi/,
    );
    offline = false;
    await tick();
    assert.equal(
      w.document.querySelector("#sync-status").textContent,
      "Ev ile bağlantı güncel",
    );
    w.document.querySelector('[data-action="logout"]').click();
    await until(() => !w.document.querySelector("#auth-shell").hidden);
    const calls = feedCalls;
    await tick();
    assert.equal(feedCalls, calls);
  } finally {
    dom.window.close();
  }
});

async function authWindow(url = "https://softhome.test/") {
  const dom = new JSDOM(html, { url, runScripts: "outside-only" });
  const w = dom.window;
  w.Headers = Headers;
  w.scrollTo = () => {};
  const requests = [];
  w.fetch = async (path, options = {}) => {
    if (path === "/api/auth/csrf") return Response.json({ token: "csrf" });
    if (path === "/api/workspace") return Response.json({}, { status: 401 });
    requests.push({
      path,
      body: JSON.parse(options.body),
      csrf: options.headers.get("X-CSRF-TOKEN"),
    });
    return Response.json({ message: "İşlem tamamlandı." }, { status: 202 });
  };
  w.eval(source);
  await until(
    () =>
      w.document.querySelector("#auth-title").textContent ===
      (url.includes("reset=")
        ? "Yeni bir şifre belirle."
        : "Evine hoş geldin."),
  );
  // Let boot finish obtaining the CSRF token before interacting.
  await new Promise((resolve) => setTimeout(resolve, 20));
  return { dom, w, requests };
}

test("Recovery sends only the email and registration rejects mismatched passwords accessibly", async () => {
  const { dom, w, requests } = await authWindow();
  try {
    const d = w.document;
    d.querySelector("#auth-email").value = "housemate@example.org";
    d.querySelector("#forgot-password").click();
    assert.equal(d.querySelector("#password-group").hidden, true);
    assert.equal(d.querySelector("#auth-email").value, "housemate@example.org");
    d.querySelector("#auth-form").dispatchEvent(
      new w.Event("submit", { bubbles: true, cancelable: true }),
    );
    await until(
      () => d.querySelector("#auth-form").getAttribute("aria-busy") === "false",
    );
    assert.equal(requests[0].path, "/api/auth/forgot-password");
    assert.deepEqual(requests[0].body, { email: "housemate@example.org" });
    assert.equal(requests[0].csrf, "csrf");
    d.querySelector("#auth-back").click();
    d.querySelector("#register-tab").click();
    d.querySelector("#auth-name").value = "Ev Arkadaşı";
    d.querySelector("#auth-password").value = "Long-test-password-2026";
    d.querySelector("#auth-password-confirm").value = "different";
    d.querySelector("#auth-form").dispatchEvent(
      new w.Event("submit", { bubbles: true, cancelable: true }),
    );
    assert.equal(requests.length, 1);
    assert.equal(
      d.querySelector("#auth-password-confirm").getAttribute("aria-invalid"),
      "true",
    );
    assert.match(d.querySelector("#confirm-error").textContent, /eşleşmiyor/);
    assert.equal(d.activeElement.id, "auth-password-confirm");
    d.querySelector("#auth-password-confirm").value = "Long-test-password-2026";
    d.querySelector("#auth-form").dispatchEvent(
      new w.Event("submit", { bubbles: true, cancelable: true }),
    );
    await until(
      () =>
        requests.length === 2 &&
        d.querySelector("#auth-title").textContent === "Evine hoş geldin.",
    );
    assert.equal(requests[1].path, "/api/auth/register");
    assert.equal(d.querySelector("#auth-password").value, "");
  } finally {
    dom.window.close();
  }
});

test("Reset links are removed from the address bar and submitted with the new matching password", async () => {
  const { dom, w, requests } = await authWindow(
    "https://softhome.test/?reset=one-time-token",
  );
  try {
    const d = w.document;
    assert.equal(w.location.search, "");
    assert.equal(d.querySelector("#email-group").hidden, true);
    d.querySelector("#auth-password").value = "New-test-password-2026";
    d.querySelector("#auth-password-confirm").value = "New-test-password-2026";
    d.querySelector("#toggle-password").click();
    assert.equal(d.querySelector("#auth-password").type, "text");
    assert.equal(
      d.querySelector("#toggle-password").getAttribute("aria-pressed"),
      "true",
    );
    d.querySelector("#auth-form").dispatchEvent(
      new w.Event("submit", { bubbles: true, cancelable: true }),
    );
    await until(
      () =>
        requests.length === 1 &&
        d.querySelector("#auth-title").textContent === "Evine hoş geldin.",
    );
    assert.deepEqual(requests[0].body, {
      token: "one-time-token",
      password: "New-test-password-2026",
    });
    assert.equal(requests[0].path, "/api/auth/reset-password");
    assert.equal(d.querySelector("#auth-password").type, "password");
    assert.equal(d.querySelector("#auth-password-confirm").value, "");
  } finally {
    dom.window.close();
  }
});

test("An initial session check cannot interrupt an already opened recovery form", async () => {
  const dom = new JSDOM(html, {
    url: "https://softhome.test/",
    runScripts: "outside-only",
  });
  const w = dom.window;
  w.Headers = Headers;
  w.scrollTo = () => {};
  let finishSessionCheck;
  w.fetch = async (path) => {
    if (path === "/api/auth/csrf") return Response.json({ token: "csrf" });
    if (path === "/api/workspace")
      return new Promise((resolve) => {
        finishSessionCheck = resolve;
      });
    throw new Error("Unexpected request");
  };
  try {
    w.eval(source);
    await until(() => finishSessionCheck);
    w.document.querySelector("#forgot-password").click();
    w.document.querySelector("#auth-email").value = "housemate@example.org";
    finishSessionCheck(Response.json({}, { status: 401 }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(
      w.document.querySelector("#auth-title").textContent,
      "Şifreni yenileyelim.",
    );
    assert.equal(
      w.document.querySelector("#auth-email").value,
      "housemate@example.org",
    );
  } finally {
    dom.window.close();
  }
});
