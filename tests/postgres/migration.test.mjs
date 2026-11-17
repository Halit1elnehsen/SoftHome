import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('Upgrade preserves existing records, is idempotent and isolates server-only tables', async () => {
  const db = new PGlite();
  try {
    const initial = await readFile(new URL('./fixtures/initial.sql', import.meta.url), 'utf8');
    const upgrade = await readFile(new URL('../../deploy/sql/upgrade-existing-supabase.sql', import.meta.url), 'utf8');
    await db.exec(initial.replace(/^\uFEFF/,''));
    await db.exec(`
    INSERT INTO "Users" ("Username","Email") VALUES ('Synthetic A','a@example.invalid'),('Synthetic B','b@example.invalid'),('Synthetic C','c@example.invalid');
    INSERT INTO "Expenses" ("Title","TotalAmount","CreatedAt","PayerId") VALUES ('Synthetic expense A',100.02,'2026-11-01T12:00:00Z',1),('Synthetic expense B',80,'2026-11-02T12:00:00Z',2);
    INSERT INTO "ExpenseParticipants" ("ExpenseId","UserId","OwedAmount","IsPaid") VALUES (1,1,33.34,false),(1,2,33.34,false),(1,3,33.34,false),(2,1,40,false),(2,2,40,false);
    CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
    `);
    for (const name of ['users','houses','house_members','categories','expenses','expense_splits','settlements'])
      await db.exec(`CREATE TABLE "${name}" (id uuid PRIMARY KEY);`);
    const snapshots = async () => ({
      users: (await db.query('SELECT "Id","Username","Email" FROM "Users" ORDER BY "Id"')).rows,
      expenses: (await db.query('SELECT "Id","Title","TotalAmount","CreatedAt","PayerId" FROM "Expenses" ORDER BY "Id"')).rows,
      participants: (await db.query('SELECT * FROM "ExpenseParticipants" ORDER BY "Id"')).rows,
    });
    const before = await snapshots();
    await db.exec(upgrade);
    assert.deepEqual(await snapshots(), before, 'Synthetic original fields must be preserved');
    assert.equal((await db.query('SELECT count(*)::int AS n FROM "__EFMigrationsHistory"')).rows[0].n,5);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public' AND rowsecurity")).rows[0].n,16);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM "Expenses" WHERE "OccurredAt"="CreatedAt" AND "Category"=\'other\'')).rows[0].n,2);
    await db.exec(`UPDATE "Expenses" SET "Category"='market' WHERE "Id"=1`);
    await db.exec(upgrade);
    assert.equal((await db.query(`SELECT "Category" FROM "Expenses" WHERE "Id"=1`)).rows[0].Category, 'market');
    assert.deepEqual(await snapshots(), before, 'Reapplying the upgrade must be idempotent');
    assert.equal((await db.query('SELECT count(*)::int AS n FROM "__EFMigrationsHistory"')).rows[0].n,5);
    await db.exec('GRANT USAGE ON SCHEMA public TO anon, authenticated; GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;');
    for (const role of ['anon','authenticated']) {
      await db.exec(`SET ROLE ${role}`);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM "Users"')).rows[0].n,0,role+' must not read accounts');
      assert.equal((await db.query('SELECT count(*)::int AS n FROM "Expenses"')).rows[0].n,0,role+' must not read other households');
      await assert.rejects(db.exec(`INSERT INTO "PasswordRecoveries" ("UserId","TokenHash","CreatedAt","ExpiresAt") VALUES (1,'synthetic-not-a-token',now(),now()+interval '30 minutes')`), /row-level security/);
      await db.exec('RESET ROLE');
    }
    await db.exec(`BEGIN; INSERT INTO "Households" ("Name","MonthlyBudget") VALUES ('Synthetic backend check',1000); ROLLBACK;`);
    assert.deepEqual(await snapshots(), before);
  } finally {
    await db.close();
  }
});
