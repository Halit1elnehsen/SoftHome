import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

test("Verified household RPCs isolate homes, split cents, settle once and revoke sessions", async () => {
  const db = new PGlite({ extensions: { pgcrypto } });
  try {
    await db.exec(
      (
        await readFile(
          new URL("./fixtures/initial.sql", import.meta.url),
          "utf8",
        )
      ).replace(/^\uFEFF/, ""),
    );
    await db.exec(
      `CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions;`,
    );
    await db.exec(
      await readFile(
        new URL(
          "../../deploy/sql/upgrade-existing-supabase.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.exec(`
   CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb);
   CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid,not_after timestamptz);
   CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
   CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT (auth.jwt()->>'sub')::uuid $$;
   CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text,name text); ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
   CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql AS $$ SELECT string_to_array($1,'/') $$;
   CREATE SCHEMA realtime; CREATE TABLE realtime.messages(topic text); ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
   CREATE FUNCTION realtime.topic() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_setting('test.topic',true) $$;
   CREATE TABLE realtime.emitted(payload jsonb,event text,topic text,private boolean);
   CREATE FUNCTION realtime.send(jsonb,text,text,boolean) RETURNS void LANGUAGE sql AS $$ INSERT INTO realtime.emitted VALUES ($1,$2,$3,$4) $$;
   GRANT USAGE ON SCHEMA public,storage,realtime TO anon,authenticated;
   GRANT SELECT ON ALL TABLES IN SCHEMA public,storage,realtime TO anon,authenticated;
   INSERT INTO auth.users SELECT ('00000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'native'||i||'@example.invalid',CASE WHEN i<4 THEN now() END,'{"name":"Synthetic","householdId":1,"role":"owner"}' FROM generate_series(1,4) i;
   INSERT INTO auth.sessions SELECT id,id,NULL FROM auth.users;
  `);
    await db.exec(
      await readFile(
        new URL(
          "../../supabase/migrations/20261117173936_free_private_household.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const as = async (i) => {
      await db.exec("RESET ROLE");
      await db.query("SELECT set_config('request.jwt.claims',$1,false)", [
        JSON.stringify({
          sub: `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`,
          session_id: `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`,
        }),
      ]);
      await db.exec("SET ROLE authenticated");
    };
    const call = async (name, args = []) => {
      const placeholders = args.map((_, i) => "$" + (i + 1)).join(",");
      return (
        await db.query(
          `SELECT public.softhome_${name}(${placeholders}) AS data`,
          args,
        )
      ).rows[0].data;
    };
    await as(4);
    await assert.rejects(call("workspace"), /doğrula/);
    await as(1);
    const a = await call("workspace");
    assert.equal(a.members.length, 1);
    await assert.rejects(
      db.query("SELECT softhome_private.activity(1,'fake')"),
      /permission denied/,
    );
    assert.equal(
      (await db.query('SELECT count(*)::int n FROM public."Users"')).rows[0].n,
      0,
    );
    const invite = await call("invite");
    await as(2);
    const b = await call("workspace");
    assert.notEqual(a.household.id, b.household.id);
    await call("join", [invite.code]);
    const joined = await call("workspace");
    assert.equal(joined.household.id, a.household.id);
    assert.equal(joined.members.length, 2);
    await assert.rejects(
      call("update_house", ["Forged owner", 10000]),
      /yönetici/,
    );
    await as(3);
    const c = await call("workspace");
    assert.equal(c.members.length, 1);
    assert.equal(c.expenses.length, 0);
    await as(1);
    const expense = {
      name: "Synthetic cents",
      cents: 10001,
      payerId: a.me.id,
      date: "2026-11-17",
      category: "market",
      participantIds: [a.me.id, b.me.id],
    };
    const created = await call("create_expense", [expense, null, null]);
    await assert.rejects(
      call("create_expense", [
        { ...expense, participantIds: [c.me.id] },
        null,
        null,
      ]),
      /eve kayıtlı/,
    );
    await assert.rejects(
      call("create_expense", [
        { ...expense, participantIds: [a.me.id, a.me.id] },
        null,
        null,
      ]),
      /kontrol et/,
    );
    await as(3);
    await assert.rejects(call("receipt_info", [created.id]), /erişilemiyor/);
    assert.equal((await call("workspace")).expenses.length, 0);
    await as(2);
    let notices = await call("notifications");
    assert.equal(notices.unreadCount, 1);
    await call("mark_read", [notices.latestId]);
    await call("mark_read", [0]);
    assert.equal((await call("notifications")).unreadCount, 0);
    const payment = {
      fromUserId: b.me.id,
      toUserId: a.me.id,
      cents: 5000,
      month: "2026-11",
      requestId: "11111111-1111-1111-1111-111111111111",
    };
    await assert.rejects(
      call("payment", [{ ...payment, cents: 5001 }]),
      /Bakiyeler/,
    );
    await call("payment", [payment]);
    await call("payment", [payment]);
    assert.equal((await call("workspace")).payments.length, 1);
    await assert.rejects(
      call("payment", [{ ...payment, cents: 4000 }]),
      /bilgileri değişmiş/,
    );
    await db.exec("RESET ROLE");
    const splits = (
      await db.query(
        'SELECT "OwedAmount" FROM "ExpenseParticipants" WHERE "ExpenseId"=$1 ORDER BY "Id"',
        [created.id],
      )
    ).rows;
    assert.deepEqual(
      splits.map((p) => Number(p.OwedAmount)),
      [50.01, 50],
    );
    await db.query(
      "INSERT INTO storage.objects(bucket_id,name) VALUES ('softhome-receipts',$1),('softhome-receipts',$2)",
      [a.household.id + "/a.jpg", c.household.id + "/c.jpg"],
    );
    await db.query("INSERT INTO realtime.messages(topic) VALUES ($1)", [
      "test",
    ]);
    await as(2);
    assert.equal(
      (await db.query("SELECT count(*)::int n FROM storage.objects")).rows[0].n,
      1,
    );
    await db.query("SELECT set_config('test.topic',$1,false)", [
      "softhome:household:" + a.household.id,
    ]);
    assert.equal(
      (await db.query("SELECT count(*)::int n FROM realtime.messages")).rows[0]
        .n,
      1,
    );
    await db.query("SELECT set_config('test.topic',$1,false)", [
      "softhome:household:" + c.household.id,
    ]);
    assert.equal(
      (await db.query("SELECT count(*)::int n FROM realtime.messages")).rows[0]
        .n,
      0,
    );
    await db.exec("RESET ROLE");
    await db.exec(
      "DELETE FROM auth.sessions WHERE user_id='00000000-0000-0000-0000-000000000002'",
    );
    await as(2);
    await assert.rejects(call("workspace"), /Oturumun sona erdi/);
    await db.exec("SET ROLE anon");
    await assert.rejects(call("workspace"), /permission denied/);
  } finally {
    await db.close();
  }
});
