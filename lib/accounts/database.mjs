// @ts-check
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import {
  applyMigrations,
  migratePostgres,
  readMigrations,
} from "./migrations.mjs";

/**
 * Embedded PGlite when `directory` is set; otherwise separate PostgreSQL pools.
 * @param {{ directory?: string, authUrl?: string, libraryUrl?: string, migrationUrl?: string, migrate?: boolean }} [options]
 */
export async function createAccountDatabase({
  directory,
  authUrl,
  libraryUrl,
  migrationUrl,
  migrate = false,
} = {}) {
  let embedded, authPool, libraryPool;
  if (directory) {
    await mkdir(resolve(directory), { recursive: true, mode: 0o700 });
    embedded = new PGlite(resolve(directory));
  } else {
    if (!authUrl || !libraryUrl)
      throw Error(
        "Configure separate account and private-library database connections",
      );
    authPool = new pg.Pool({
      connectionString: authUrl,
      max: 4,
      ssl: { rejectUnauthorized: true },
    });
    libraryPool = new pg.Pool({
      connectionString: libraryUrl,
      max: 4,
      ssl: { rejectUnauthorized: true },
    });
  }
  // Migrations run as the schema owner: the embedded superuser, or migrationUrl in production.
  if (embedded)
    await applyMigrations(
      {
        exec: (sql) => embedded.exec(sql),
        query: (sql, params) => embedded.query(sql, params),
        transaction: (fn) => embedded.transaction(fn),
      },
      await readMigrations(),
    );
  else if (migrate) {
    if (!migrationUrl) throw Error("Migration connection required");
    await migratePostgres(migrationUrl);
  }
  async function transaction(kind, owner, fn) {
    if (embedded)
      return embedded.transaction(async (tx) => {
        await tx.exec(
          `SET LOCAL ROLE ${kind === "auth" ? "qinban_identity" : "qinban_library"}`,
        );
        if (kind === "library")
          await tx.query("SELECT set_config('app.user_id',$1,true)", [owner]);
        return fn(tx);
      });
    const client = await (kind === "auth" ? authPool : libraryPool).connect();
    try {
      await client.query("BEGIN");
      if (kind === "library")
        await client.query("SELECT set_config('app.user_id',$1,true)", [owner]);
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
  // Production roles must not inherit table-owner or RLS-bypass capabilities.
  if (!embedded)
    for (const [pool, role] of [
      [authPool, "qinban_identity"],
      [libraryPool, "qinban_library"],
    ]) {
      const r = await pool.query(
        "SELECT current_user,rolsuper,rolbypassrls,pg_has_role(current_user,$1,'member') AS allowed FROM pg_roles WHERE rolname=current_user",
        [role],
      );
      const cross = await pool.query(
        "SELECT pg_has_role(current_user,$1,'member') AS cross_access",
        [role === "qinban_identity" ? "qinban_library" : "qinban_identity"],
      );
      if (
        cross.rows[0].cross_access ||
        !r.rows[0]?.allowed ||
        r.rows[0].rolsuper ||
        r.rows[0].rolbypassrls
      )
        throw Error("Unsafe database runtime role");
      const own = await pool.query(
        "SELECT 1 FROM pg_tables WHERE schemaname IN ('qinban_private','qinban_identity') AND tableowner=current_user LIMIT 1",
      );
      if (own.rows.length) throw Error("Runtime cannot own account tables");
    }
  return {
    identity: (fn) => transaction("auth", null, fn),
    control: (fn) => transaction("control", null, fn),
    private: (owner, fn) => {
      if (typeof owner !== "string" || !owner)
        throw Error("Owner identity required");
      return transaction("library", owner, fn);
    },
    close: async () => {
      await embedded?.close();
      await authPool?.end();
      await libraryPool?.end();
    },
  };
}
