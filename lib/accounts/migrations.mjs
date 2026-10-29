// @ts-check
// Versioned schema migrations: db/NNNN-name.sql files run once, in name order,
// each in its own transaction together with its row in qinban_meta.schema_migrations.
// An applied file must never change; add a new numbered file instead.
import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import pg from "pg";

export const MIGRATIONS_DIRECTORY = fileURLToPath(
  new URL("../../db/", import.meta.url),
);
const FILE = /^\d{4}-[a-z0-9-]+\.sql$/;

/**
 * @typedef {{ name: string, sql: string, sha256: string }} Migration
 * @typedef {{ exec: (sql: string) => Promise<unknown>,
 *   query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> }} MigrationClient
 */

/** @returns {Promise<Migration[]>} */
export async function readMigrations(directory = MIGRATIONS_DIRECTORY) {
  const names = (await readdir(directory)).filter((n) => FILE.test(n)).sort();
  return Promise.all(
    names.map(async (name) => {
      const sql = await readFile(`${directory}/${name}`, "utf8");
      return {
        name,
        sql,
        sha256: createHash("sha256").update(sql).digest("hex"),
      };
    }),
  );
}

/**
 * @param {{ exec: MigrationClient["exec"], query: MigrationClient["query"],
 *   transaction: <T>(fn: (tx: MigrationClient) => Promise<T>) => Promise<T> }} database
 * @param {Migration[]} migrations
 * @returns {Promise<string[]>} names applied by this call
 */
export async function applyMigrations(database, migrations) {
  await database.exec(`CREATE SCHEMA IF NOT EXISTS qinban_meta;
REVOKE ALL ON SCHEMA qinban_meta FROM PUBLIC;
CREATE TABLE IF NOT EXISTS qinban_meta.schema_migrations (
  name text PRIMARY KEY,
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  applied_at timestamptz NOT NULL DEFAULT now()
);`);
  const applied = new Map(
    (
      await database.query(
        "SELECT name, sha256 FROM qinban_meta.schema_migrations",
      )
    ).rows.map((r) => [r.name, r.sha256]),
  );
  const known = new Set(migrations.map((m) => m.name));
  for (const name of applied.keys())
    if (!known.has(name))
      throw Error(
        `数据库已应用迁移 ${name}，但 db/ 中没有该文件；请使用对应版本的代码。`,
      );
  const ran = [];
  for (const m of migrations) {
    if (applied.has(m.name)) {
      if (applied.get(m.name) !== m.sha256)
        throw Error(
          `已应用的迁移 ${m.name} 内容被修改；请恢复原文件，并把改动写成新的编号迁移。`,
        );
      continue;
    }
    await database.transaction(async (tx) => {
      await tx.exec(m.sql);
      await tx.query(
        "INSERT INTO qinban_meta.schema_migrations (name, sha256) VALUES ($1, $2)",
        [m.name, m.sha256],
      );
    });
    ran.push(m.name);
  }
  return ran;
}

/**
 * Applies pending migrations over a dedicated maintenance connection (the table owner).
 * @param {string} connectionString
 * @param {Migration[]} [migrations]
 */
export async function migratePostgres(connectionString, migrations) {
  const pool = new pg.Pool({
    connectionString,
    max: 1,
    ssl: { rejectUnauthorized: true },
  });
  try {
    return await applyMigrations(
      {
        exec: (sql) => pool.query(sql),
        query: (sql, params) => pool.query(sql, params),
        async transaction(fn) {
          const client = await pool.connect();
          try {
            await client.query("BEGIN");
            const result = await fn({
              exec: (sql) => client.query(sql),
              query: (sql, params) => client.query(sql, params),
            });
            await client.query("COMMIT");
            return result;
          } catch (e) {
            await client.query("ROLLBACK");
            throw e;
          } finally {
            client.release();
          }
        },
      },
      migrations ?? (await readMigrations()),
    );
  } finally {
    await pool.end();
  }
}
