import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
const source = await readFile(
  new URL("../../frontend/js/supabase-api.js", import.meta.url),
  "utf8",
);
test("Recovery verifies a recovery OTP, retries password failure without reusing the OTP, and signs out all sessions", async () => {
  const dom = new JSDOM("", { runScripts: "outside-only" }),
    w = dom.window;
  let verify = 0,
    updates = 0,
    signouts = 0;
  w.SOFTHOME_CONFIG = {
    mode: "supabase",
    url: "https://example.invalid",
    publishableKey: "synthetic-public-key",
  };
  w.SoftHomeSupabase = {
    createClient: () => ({
      auth: {
        verifyOtp: async (body) => {
          verify++;
          assert.equal(body.type, "recovery");
          assert.equal(body.token, "123456");
          return { data: { session: { access_token: "synthetic-only" } } };
        },
        updateUser: async (body) => {
          updates++;
          assert.equal(body.password, "new-synthetic-password");
          return updates === 1
            ? { error: { code: "weak_password", status: 400 } }
            : { error: null };
        },
        signOut: async (body) => {
          signouts++;
          assert.equal(body.scope, "global");
          return { error: null };
        },
      },
    }),
  };
  try {
    w.eval(source);
    const options = {
      method: "POST",
      body: JSON.stringify({
        email: "synthetic@example.invalid",
        code: "123456",
        password: "new-synthetic-password",
      }),
    };
    await assert.rejects(
      w.SoftHomeRemote.request("/api/auth/reset-code", options),
    );
    assert.equal(signouts, 0);
    const result = await w.SoftHomeRemote.request(
      "/api/auth/reset-code",
      options,
    );
    assert.match(result.message, /Şifren yenilendi/);
    assert.equal(verify, 1);
    assert.equal(updates, 2);
    assert.equal(signouts, 1);
  } finally {
    w.close();
  }
});
