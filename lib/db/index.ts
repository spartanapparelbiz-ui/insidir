/* One PostgreSQL pool per process (DATABASE_URL), shared through globalThis so Next's dev reloads don't leak pools. */
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;

const G = globalThis as typeof globalThis & { __terminalDb?: { pool: pg.Pool; db: Db } };

export function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function getDb(): Db {
  if (!G.__terminalDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    const pool = new pg.Pool({ connectionString: url, max: Number(process.env.DATABASE_POOL_MAX || 10), ssl: /sslmode=require|railway|rlwy/.test(url) ? { rejectUnauthorized: false } : undefined });
    G.__terminalDb = { pool, db: drizzle(pool, { schema }) };
  }
  return G.__terminalDb.db;
}

export async function closeDb(): Promise<void> {
  if (G.__terminalDb) { await G.__terminalDb.pool.end(); G.__terminalDb = undefined; }
}
