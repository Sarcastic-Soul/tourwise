import "server-only";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { env } from "./env";

/**
 * Small key-value store with expiry plus an atomic counter.
 * Uses Neon Postgres when DATABASE_URL is set, otherwise process memory
 * (fine for local dev, lost on restart).
 */
export interface Store {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown, ttlSeconds: number): Promise<void>;
  /** Adds 1 to a counter that resets after `windowSeconds`. Returns the new count. */
  increment(key: string, windowSeconds: number): Promise<number>;
  /** Current value of a counter, 0 if missing or expired. */
  count(key: string): Promise<number>;
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS kv (
     key text PRIMARY KEY,
     value jsonb NOT NULL,
     expires_at timestamptz NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS counters (
     key text PRIMARY KEY,
     count integer NOT NULL,
     expires_at timestamptz NOT NULL
   )`,
];

class PostgresStore implements Store {
  private ready: Promise<void> | undefined;

  constructor(private sql: NeonQueryFunction<false, false>) {}

  private ensureSchema() {
    this.ready ??= (async () => {
      for (const statement of SCHEMA) await this.sql.query(statement);
    })().catch((error) => {
      this.ready = undefined;
      throw error;
    });
    return this.ready;
  }

  async get<T>(key: string) {
    await this.ensureSchema();
    const rows = await this.sql.query(
      "SELECT value FROM kv WHERE key = $1 AND expires_at > now()",
      [key],
    );
    return rows[0]?.value as T | undefined;
  }

  async set(key: string, value: unknown, ttlSeconds: number) {
    await this.ensureSchema();
    await this.sql.query(
      `INSERT INTO kv (key, value, expires_at)
       VALUES ($1, $2, now() + make_interval(secs => $3))
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, expires_at = EXCLUDED.expires_at`,
      [key, JSON.stringify(value), ttlSeconds],
    );
  }

  async increment(key: string, windowSeconds: number) {
    await this.ensureSchema();
    const rows = await this.sql.query(
      `INSERT INTO counters (key, count, expires_at)
       VALUES ($1, 1, now() + make_interval(secs => $2))
       ON CONFLICT (key) DO UPDATE SET
         count = CASE WHEN counters.expires_at <= now() THEN 1 ELSE counters.count + 1 END,
         expires_at = CASE WHEN counters.expires_at <= now() THEN EXCLUDED.expires_at ELSE counters.expires_at END
       RETURNING count`,
      [key, windowSeconds],
    );
    return Number(rows[0].count);
  }

  async count(key: string) {
    await this.ensureSchema();
    const rows = await this.sql.query(
      "SELECT count FROM counters WHERE key = $1 AND expires_at > now()",
      [key],
    );
    return Number(rows[0]?.count ?? 0);
  }
}

class MemoryStore implements Store {
  private kv = new Map<string, { value: unknown; expiresAt: number }>();
  private counters = new Map<string, { count: number; expiresAt: number }>();

  async get<T>(key: string) {
    const entry = this.kv.get(key);
    if (!entry || entry.expiresAt <= Date.now()) return undefined;
    return entry.value as T;
  }

  async set(key: string, value: unknown, ttlSeconds: number) {
    this.kv.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async increment(key: string, windowSeconds: number) {
    const now = Date.now();
    const entry = this.counters.get(key);
    if (!entry || entry.expiresAt <= now) {
      this.counters.set(key, { count: 1, expiresAt: now + windowSeconds * 1000 });
      return 1;
    }
    entry.count += 1;
    return entry.count;
  }

  async count(key: string) {
    const entry = this.counters.get(key);
    return entry && entry.expiresAt > Date.now() ? entry.count : 0;
  }
}

const globalForStore = globalThis as unknown as { store?: Store };

export const store: Store = (globalForStore.store ??= env.databaseUrl
  ? new PostgresStore(neon(env.databaseUrl))
  : new MemoryStore());
