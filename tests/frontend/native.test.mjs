import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
  throw Error("UI timeout");
};
const submit = (w) =>
  w.document
    .querySelector("#auth-form")
    .dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
test("Native registration opens code screen, rejects invalid and wrong codes, then opens the verified home", async () => {
  const dom = new JSDOM(html, {
      url: "https://softhome.test/",
      runScripts: "outside-only",
    }),
    w = dom.window,
    d = w.document;
  w.scrollTo = () => {};
  w.Headers = Headers;
  let signedIn = false,
    verificationCalls = 0,
    changed;
  const state = {
    me: { id: 1, name: "Synthetic", email: "test@example.invalid" },
    household: { id: 1, name: "Private home", ownerId: 1, budgetCents: 100000 },
    members: [{ id: 1, name: "Synthetic" }],
    expenses: [],
    payments: [],
    revision: 0,
  };
  w.SoftHomeRemote = {
    subscribe: (_, fn) => (changed = fn),
    disconnect: () => {},
    request: async (path, options) => {
      if (path === "/api/auth/csrf") return { token: "bearer" };
      if (path === "/api/workspace") {
        if (!signedIn) throw Object.assign(Error("login"), { status: 401 });
        return structuredClone(state);
      }
      if (path === "/api/auth/register")
        return { requiresVerification: true, message: "Kod gönderildi." };
      if (path === "/api/auth/verify-code") {
        verificationCalls++;
        if (JSON.parse(options.body).code !== "123456")
          throw Error("Kod yanlış.");
        signedIn = true;
        return {};
      }
      if (path === "/api/workspace/notifications")
        return {
          householdId: 1,
          latestId: state.revision,
          unreadCount: 0,
          items: [],
        };
      throw Error(path);
    },
  };
  try {
    w.eval(source);
    await new Promise((r) => setTimeout(r, 20));
    d.querySelector("#register-tab").click();
    d.querySelector("#auth-name").value = "Synthetic";
    d.querySelector("#auth-email").value = "test@example.invalid";
    d.querySelector("#auth-password").value = d.querySelector(
      "#auth-password-confirm",
    ).value = "synthetic-password-2026";
    submit(w);
    await until(() => !d.querySelector("#otp-group").hidden);
    assert.equal(d.querySelector("#password-group").hidden, true);
    assert.equal(d.querySelector("#auth-email").readOnly, true);
    assert.equal(d.querySelector("#app-shell").hidden, true);
    d.querySelector("#auth-code").value = "123";
    submit(w);
    assert.equal(verificationCalls, 0);
    assert.equal(d.activeElement.id, "auth-code");
    d.querySelector("#auth-code").value = "000000";
    submit(w);
    await until(
      () => d.querySelector("#auth-message").textContent === "Kod yanlış.",
    );
    assert.equal(d.querySelector("#app-shell").hidden, true);
    d.querySelector("#auth-code").value = "123456";
    submit(w);
    await until(() => !d.querySelector("#app-shell").hidden);
    assert.equal(verificationCalls, 2);
    assert.match(d.querySelector("#toast-text").textContent, /başarıyla/);
    state.revision = 1;
    state.expenses.push({
      id: 1,
      name: "Realtime synthetic",
      cents: 100,
      category: "other",
      payer: 1,
      date: new Date().toISOString().slice(0, 10),
      split: [1],
    });
    changed();
    await until(() => d.querySelector('[data-detail="1"]'));
  } finally {
    w.close();
  }
});
test("Native recovery submits the email code and matching new password", async () => {
  const dom = new JSDOM(html, {
      url: "https://softhome.test/",
      runScripts: "outside-only",
    }),
    w = dom.window,
    d = w.document;
  w.scrollTo = () => {};
  w.Headers = Headers;
  let reset;
  w.SoftHomeRemote = {
    disconnect: () => {},
    request: async (path, options) => {
      if (path === "/api/auth/csrf") return { token: "bearer" };
      if (path === "/api/workspace")
        throw Object.assign(Error("login"), { status: 401 });
      if (path === "/api/auth/forgot-password")
        return { requiresRecoveryCode: true, message: "Kod gönderildi." };
      if (path === "/api/auth/reset-code") {
        reset = JSON.parse(options.body);
        return { message: "Şifre yenilendi." };
      }
      throw Error(path);
    },
  };
  try {
    w.eval(source);
    await new Promise((r) => setTimeout(r, 20));
    d.querySelector("#auth-email").value = "test@example.invalid";
    d.querySelector("#forgot-password").click();
    submit(w);
    await until(() => !d.querySelector("#otp-group").hidden);
    assert.equal(d.querySelector("#password-group").hidden, false);
    d.querySelector("#auth-code").value = "123456";
    d.querySelector("#auth-password").value = d.querySelector(
      "#auth-password-confirm",
    ).value = "new-synthetic-password";
    submit(w);
    await until(
      () =>
        reset &&
        d.querySelector("#auth-title").textContent === "Evine hoş geldin.",
    );
    assert.deepEqual(reset, {
      email: "test@example.invalid",
      code: "123456",
      password: "new-synthetic-password",
    });
  } finally {
    w.close();
  }
});
