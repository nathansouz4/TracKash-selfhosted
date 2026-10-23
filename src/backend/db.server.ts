import Database from "better-sqlite3";
import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

// The local SQLite database: a single file on the owner's machine, opened once
// per process. The file and its folder are readable by the owner's user only.
// Migrations (./migrations/NNNN_name.sql) run when the file is opened and are
// tracked in `PRAGMA user_version`.

const MIGRATIONS = import.meta.glob<string>("./migrations/*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
});

const MIGRATION_FILE = /(\d{4})_[a-z0-9_]+\.sql$/;

type Connection = { db: Database.Database; statements: Map<string, Database.Statement> };

declare global {
  // Survives Vite's module reloads in `npm run dev`.
  var __trackashDb: Connection | undefined;
}

/** `TRACKASH_DB_PATH` (":memory:" in tests) or data/trackash.db in the project folder. */
export function databasePath(): string {
  const configured = process.env["TRACKASH_DB_PATH"]?.trim();
  if (configured === ":memory:") return configured;
  return configured ? resolve(configured) : join(process.cwd(), "data", "trackash.db");
}

function restrict(path: string, mode: number) {
  if (existsSync(path)) chmodSync(path, mode);
}

function migrate(db: Database.Database) {
  const current = db.pragma("user_version", { simple: true }) as number;
  const pending = Object.entries(MIGRATIONS)
    .map(([file, sql]) => ({ version: Number(MIGRATION_FILE.exec(file)?.[1] ?? NaN), file, sql }))
    .filter((m) => {
      if (Number.isNaN(m.version)) throw new Error(`Invalid migration file name: ${m.file}`);
      return m.version > current;
    })
    .sort((a, b) => a.version - b.version);
  for (const migration of pending) {
    db.transaction(() => {
      db.exec(migration.sql);
      db.pragma(`user_version = ${migration.version}`);
    })();
  }
}

function open(): Connection {
  const path = databasePath();
  if (path !== ":memory:") {
    const folder = dirname(path);
    mkdirSync(folder, { recursive: true, mode: 0o700 });
    // The default folder also holds the owner's B3 exports: keep it private.
    if (!process.env["TRACKASH_DB_PATH"]) restrict(folder, 0o700);
  }
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");
  // The terminal scripts (npm run sync) may write while the app is open.
  db.pragma("busy_timeout = 5000");
  if (path !== ":memory:") {
    for (const file of [path, `${path}-wal`, `${path}-shm`]) restrict(file, 0o600);
  }
  migrate(db);
  return { db, statements: new Map() };
}

function connection(): Connection {
  globalThis.__trackashDb ??= open();
  return globalThis.__trackashDb;
}

export function closeDatabase(): void {
  globalThis.__trackashDb?.db.close();
  globalThis.__trackashDb = undefined;
}

/** SQLite binds numbers, strings and null only. Arrays and objects go as JSON (`json_each(?)`). */
function bindable(value: unknown): unknown {
  if (value === undefined) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value instanceof Date) return value.toISOString();
  if (value !== null && typeof value === "object") return JSON.stringify(value);
  return value;
}

function statement(sql: string): Database.Statement {
  const { db, statements } = connection();
  let prepared = statements.get(sql);
  if (!prepared) {
    prepared = db.prepare(sql);
    statements.set(sql, prepared);
  }
  return prepared;
}

export function all<T>(sql: string, ...params: unknown[]): T[] {
  return statement(sql).all(...params.map(bindable)) as T[];
}

export function get<T>(sql: string, ...params: unknown[]): T | undefined {
  return statement(sql).get(...params.map(bindable)) as T | undefined;
}

export function run(sql: string, ...params: unknown[]): Database.RunResult {
  return statement(sql).run(...params.map(bindable));
}

/** Runs `fn` atomically. `fn` must be synchronous (no awaits inside). */
export function transaction<T>(fn: () => T): T {
  return connection().db.transaction(fn)();
}

export const NOW_SQL = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

/**
 * Inserts or updates `rows` (all with the same keys) in one transaction. Columns
 * outside `conflict` are overwritten; `updated_at` is touched unless disabled.
 * Returns how many rows were written.
 */
export function upsert(
  table: string,
  rows: Record<string, unknown>[],
  conflict: string[],
  { touchUpdatedAt = true }: { touchUpdatedAt?: boolean } = {},
): number {
  const first = rows[0];
  if (!first) return 0;
  const cols = Object.keys(first);
  const quote = (c: string) => `"${c}"`;
  const updates = cols
    .filter((c) => !conflict.includes(c))
    .map((c) => `${quote(c)} = excluded.${quote(c)}`);
  if (touchUpdatedAt) updates.push(`"updated_at" = ${NOW_SQL}`);
  const sql = `insert into ${quote(table)} (${cols.map(quote).join(", ")})
    values (${cols.map(() => "?").join(", ")})
    on conflict (${conflict.map(quote).join(", ")}) do ${
      updates.length ? `update set ${updates.join(", ")}` : "nothing"
    }`;
  return transaction(() => {
    let written = 0;
    for (const row of rows) written += run(sql, ...cols.map((c) => row[c])).changes;
    return written;
  });
}
