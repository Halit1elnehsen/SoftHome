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
const until = async (fn) => {
  for (let i = 0; i < 100; i++) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw Error("UI timeout");
};
function state() {
  return {
    me: { id: 11, name: "Synthetic Owner", email: "owner@example.invalid" },
    household: {
      id: 1,
      name: "Synthetic Home",
      ownerId: 11,
      budgetCents: 3000000,
      setupComplete: true,
    },
    members: [
      { id: 11, name: "Synthetic Owner" },
      { id: 12, name: "Synthetic Housemate" },
    ],
    revision: 1,
    expenses: [],
    payments: [],
  };
}
function harness(workspace = state(), override) {
  const dom = new JSDOM(html, {
      url: "https://softhome.test/",
      runScripts: "outside-only",
    }),
    w = dom.window,
    d = w.document;
  w.Headers = Headers;
  w.scrollTo = () => {};
  w.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.open = false;
    this.dispatchEvent(new w.Event("close"));
  };
  const calls = [];
  w.SoftHomeRemote = {
    disconnect: () => {},
    subscribe: () => {},
    request: async (path, options = {}) => {
      calls.push({
        path,
        body: options.body ? JSON.parse(options.body) : null,
      });
      if (path === "/api/auth/csrf") return { token: "bearer" };
      if (override) {
        const answer = override(path, options);
        if (answer !== undefined) return answer;
      }
      if (path === "/api/workspace") return structuredClone(workspace);
      if (path === "/api/workspace/notifications")
        return {
          householdId: workspace.household.id,
          latestId: workspace.revision,
          items: [],
          unreadCount: 0,
        };
      throw Error("Unexpected " + path);
    },
  };
  w.eval(source);
  return { dom, w, d, calls, workspace };
}
const submit = (w, id) =>
  w.document
    .querySelector(id)
    .dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
test("A restored session never flashes login; profile identifies the account and owner settings stay out of the home page", async () => {
  let resolve;
  const pending = new Promise((r) => (resolve = r)),
    s = state();
  const { w, d } = harness(s, (path) =>
    path === "/api/workspace" ? pending : undefined,
  );
  try {
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(d.querySelector("#auth-shell").hidden, true);
    assert.equal(d.querySelector("#boot-shell").hidden, false);
    resolve(s);
    await until(() => !d.querySelector("#app-shell").hidden);
    assert.equal(d.querySelector("#auth-shell").hidden, true);
    assert.equal(d.querySelector("#boot-shell").hidden, true);
    assert.equal(d.querySelector(".topbar [data-action=logout]"), null);
    d.querySelector(".profile-button").click();
    await until(() => d.querySelector(".account-email"));
    assert.equal(d.querySelector(".account-email").textContent, s.me.email);
    assert.ok(d.querySelector("#page [data-action=logout]"));
    d.querySelector("[data-action=house-settings]").click();
    assert.equal(d.querySelector("#info-dialog").open, true);
    assert.ok(d.querySelector("#info-dialog #house-form"));
    d.querySelector("#info-dialog").close();
    w.location.hash = "#house";
    await until(() => d.querySelector(".house-members"));
    assert.equal(d.querySelector("#page #house-form"), null);
    assert.equal(d.querySelector("#join-form"), null);
  } finally {
    w.close();
  }
});
test("Temporary startup failure preserves the session and retries without showing registration", async () => {
  let offline = true;
  const { w, d, calls } = harness(state(), (path) => {
    if (path === "/api/workspace" && offline)
      return Promise.reject(
        Object.assign(Error("Offline retry"), { status: 503 }),
      );
  });
  try {
    await until(() => !d.querySelector("#boot-retry").hidden);
    assert.equal(d.querySelector("#auth-shell").hidden, true);
    assert.match(d.querySelector("#boot-message").textContent, /Offline/);
    offline = false;
    d.querySelector("#boot-retry").click();
    await until(() => !d.querySelector("#app-shell").hidden);
    assert.equal(
      calls.some((c) => c.path === "/api/auth/logout"),
      false,
    );
  } finally {
    w.close();
  }
});
test("New users choose join without a house name; errors retain the form and joined members cannot edit the owner settings", async () => {
  const s = state();
  s.household.setupComplete = false;
  s.members = s.members.slice(0, 1);
  let attempt = 0;
  const { w, d, calls } = harness(s, (path) => {
    if (path === "/api/workspace/household/join") {
      attempt++;
      if (attempt === 1) return Promise.reject(Error("Geçersiz davet kodu"));
      s.household = {
        id: 2,
        name: "Joined Home",
        ownerId: 12,
        budgetCents: 100000,
        setupComplete: true,
      };
      s.members.push({ id: 12, name: "House Founder" });
      return Promise.resolve(null);
    }
  });
  try {
    await until(() => !d.querySelector("#setup-shell").hidden);
    assert.equal(d.querySelector("#auth-house"), null);
    assert.equal(d.querySelector("#app-shell").hidden, true);
    d.querySelector("[data-setup-choice=join]").click();
    assert.equal(d.querySelector("#home-create-form").hidden, true);
    assert.equal(d.querySelector("#home-join-form").hidden, false);
    d.querySelector("#setup-code").value = "INVALID";
    submit(w, "#home-join-form");
    await until(() => !d.querySelector("#setup-message").hidden);
    assert.match(d.querySelector("#setup-message").textContent, /Geçersiz/);
    d.querySelector("#setup-code").value = "VALID";
    submit(w, "#home-join-form");
    await until(() => !d.querySelector("#app-shell").hidden);
    assert.deepEqual(
      calls.filter((c) => c.path.endsWith("/join")).map((c) => c.body),
      [{ code: "INVALID" }, { code: "VALID" }],
    );
    d.querySelector(".profile-button").click();
    await until(() => d.querySelector(".account-card"));
    assert.equal(d.querySelector("[data-action=house-settings]"), null);
    assert.match(d.querySelector(".account-facts").textContent, /Ev arkadaşı/);
  } finally {
    w.close();
  }
});
test("Creating a home sends the chosen name and budget once and opens the workspace", async () => {
  const s = state();
  s.household.setupComplete = false;
  s.members = s.members.slice(0, 1);
  const { w, d, calls } = harness(s, (path, options) => {
    if (path === "/api/workspace/household/setup") {
      const body = JSON.parse(options.body);
      s.household.name = body.name;
      s.household.budgetCents = body.budgetCents;
      s.household.setupComplete = true;
      return Promise.resolve(null);
    }
  });
  try {
    await until(() => !d.querySelector("#setup-shell").hidden);
    d.querySelector("[data-setup-choice=create]").click();
    d.querySelector("#setup-house-name").value = "Chosen Home";
    d.querySelector("#setup-budget").value = "12500";
    submit(w, "#home-create-form");
    submit(w, "#home-create-form");
    await until(() => !d.querySelector("#app-shell").hidden);
    assert.equal(calls.filter((c) => c.path.endsWith("/setup")).length, 1);
    assert.equal(
      d.querySelector("[data-house-name]").textContent,
      "Chosen Home",
    );
  } finally {
    w.close();
  }
});
test("Sharing shows purchases and settlement directions; manual refresh coalesces requests and preserves dialogs", async () => {
  const s = state();
  s.expenses = [
    {
      id: 1,
      name: "Synthetic groceries",
      cents: 10000,
      category: "market",
      payer: 11,
      date: new Date().toISOString().slice(0, 10),
      split: [11, 12],
      receiptUrl: null,
    },
  ];
  let nextResolve,
    delay = false;
  const { w, d, calls } = harness(s, (path) =>
    path === "/api/workspace" && delay
      ? new Promise((r) => (nextResolve = r))
      : undefined,
  );
  try {
    await until(() => !d.querySelector("#app-shell").hidden);
    w.location.hash = "#balances";
    await until(() => d.querySelector(".settlement-first"));
    assert.doesNotMatch(
      d.querySelector("#page").textContent,
      /Toplam ortak harcama/,
    );
    assert.match(
      d.querySelector(".purchase-list").textContent,
      /Synthetic groceries/,
    );
    const transfer = d.querySelector(".transfer-people").textContent;
    assert.ok(transfer.indexOf("Housemate") < transfer.indexOf("Owner"));
    delay = true;
    const before = calls.filter((c) => c.path === "/api/workspace").length;
    d.querySelector("[data-action=refresh]").click();
    d.querySelector("[data-action=refresh]").click();
    await until(() => nextResolve);
    assert.equal(
      calls.filter((c) => c.path === "/api/workspace").length,
      before + 1,
    );
    assert.equal(d.querySelector("#pull-refresh").hidden, false);
    nextResolve(s);
    await until(() => d.querySelector("#pull-refresh").hidden);
    d.querySelector(".profile-button").click();
    await until(() => d.querySelector("[data-action=house-settings]"));
    d.querySelector("[data-action=house-settings]").click();
    d.querySelector("#house-name").value = "Unsaved name";
    const count = calls.filter((c) => c.path === "/api/workspace").length;
    d.querySelector("[data-action=refresh]").click();
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(d.querySelector("#house-name").value, "Unsaved name");
    assert.equal(
      calls.filter((c) => c.path === "/api/workspace").length,
      count,
    );
  } finally {
    w.close();
  }
});
test("Pull-to-refresh requires a deliberate downward pull and cancellation never reloads", async () => {
  const { w, d, calls } = harness();
  const touch = (type, y) => {
    const event = new w.Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, "touches", {
      value:
        type === "touchend" || type === "touchcancel"
          ? []
          : [{ clientX: 100, clientY: y }],
    });
    d.querySelector("#page").dispatchEvent(event);
  };
  try {
    await until(() => !d.querySelector("#app-shell").hidden);
    let before = calls.filter((c) => c.path === "/api/workspace").length;
    touch("touchstart", 100);
    touch("touchmove", 140);
    touch("touchend", 140);
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(
      calls.filter((c) => c.path === "/api/workspace").length,
      before,
    );
    assert.equal(d.querySelector("#pull-refresh").hidden, true);
    touch("touchstart", 100);
    touch("touchmove", 270);
    assert.equal(d.querySelector("#pull-refresh").hidden, false);
    touch("touchcancel", 270);
    assert.equal(
      calls.filter((c) => c.path === "/api/workspace").length,
      before,
    );
    assert.equal(d.querySelector("#pull-refresh").hidden, true);
    touch("touchstart", 100);
    touch("touchmove", 270);
    touch("touchend", 270);
    await until(
      () =>
        calls.filter((c) => c.path === "/api/workspace").length ===
          before + 1 && d.querySelector("#pull-refresh").hidden,
    );
  } finally {
    w.close();
  }
});
test("Android back closes owner settings before navigation and returns onboarding forms to the choice", async () => {
  const first = harness();
  try {
    await until(() => !first.d.querySelector("#app-shell").hidden);
    first.d.querySelector(".profile-button").click();
    await until(() => first.d.querySelector("[data-action=house-settings]"));
    first.d.querySelector("[data-action=house-settings]").click();
    assert.equal(first.d.querySelector("#info-dialog").open, true);
    assert.equal(first.w.SoftHomeBack(), true);
    assert.equal(first.d.querySelector("#info-dialog").open, false);
    assert.equal(first.w.location.hash, "#profile");
    assert.equal(first.w.SoftHomeBack(), false);
  } finally {
    first.w.close();
  }
  const s = state();
  s.household.setupComplete = false;
  const second = harness(s);
  try {
    await until(() => !second.d.querySelector("#setup-shell").hidden);
    second.d.querySelector("[data-setup-choice=join]").click();
    assert.equal(second.d.querySelector("#setup-choices").hidden, true);
    assert.equal(second.w.SoftHomeBack(), true);
    assert.equal(second.d.querySelector("#setup-choices").hidden, false);
    assert.equal(second.d.querySelector("#home-join-form").hidden, true);
  } finally {
    second.w.close();
  }
});
