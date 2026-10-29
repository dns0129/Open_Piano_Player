import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import {
  applyMigrations,
  readMigrations,
} from "../lib/accounts/migrations.mjs";

const adapter = (db) => ({
  exec: (sql) => db.exec(sql),
  query: (sql, params) => db.query(sql, params),
  transaction: (fn) => db.transaction(fn),
});
const migration = (name, sql) => ({
  name,
  sql,
  sha256: createHash("sha256").update(sql).digest("hex"),
});

test("the shipped migrations apply once in order and a second start runs none", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  const files = await readMigrations();
  assert.deepEqual(
    files.map((m) => m.name),
    [...files.map((m) => m.name)].sort(),
  );
  assert.ok(files.length >= 6);
  assert.deepEqual(
    await applyMigrations(adapter(db), files),
    files.map((m) => m.name),
  );
  assert.deepEqual(await applyMigrations(adapter(db), files), []);
  const recorded = await db.query(
    "SELECT name, sha256 FROM qinban_meta.schema_migrations ORDER BY name",
  );
  assert.deepEqual(
    recorded.rows,
    files.map(({ name, sha256 }) => ({ name, sha256 })),
  );
});

test("an edited or unknown applied migration stops startup, and a failing one leaves no trace", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  const first = migration("0001-a.sql", "CREATE TABLE a (id int);");
  await applyMigrations(adapter(db), [first]);

  await assert.rejects(
    applyMigrations(adapter(db), [
      migration("0001-a.sql", "CREATE TABLE a (id bigint);"),
    ]),
    /0001-a\.sql 内容被修改/,
  );
  await assert.rejects(applyMigrations(adapter(db), []), /0001-a\.sql/);

  const broken = migration(
    "0002-b.sql",
    "CREATE TABLE b (id int); SELECT no_such_function();",
  );
  await assert.rejects(applyMigrations(adapter(db), [first, broken]));
  const b = await db.query("SELECT to_regclass('public.b') AS t");
  assert.equal(b.rows[0].t, null);
  const names = await db.query(
    "SELECT name FROM qinban_meta.schema_migrations ORDER BY name",
  );
  assert.deepEqual(
    names.rows.map((r) => r.name),
    ["0001-a.sql"],
  );

  const fixed = migration("0002-b.sql", "CREATE TABLE b (id int);");
  assert.deepEqual(await applyMigrations(adapter(db), [first, fixed]), [
    "0002-b.sql",
  ]);
});
