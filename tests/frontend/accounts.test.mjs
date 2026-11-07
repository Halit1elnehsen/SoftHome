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
