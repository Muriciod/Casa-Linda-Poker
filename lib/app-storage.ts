type PreparedStatement = {
  bind: (...values: unknown[]) => PreparedStatement;
  run: <T = unknown>() => Promise<T>;
  all: <T = unknown>() => Promise<{ results: T[] }>;
  first: <T = unknown>() => Promise<T | null>;
};

type RuntimeBindings = {
  DB?: {
    prepare: (sql: string) => PreparedStatement;
    batch: (statements: unknown[]) => Promise<unknown>;
  };
  BUCKET?: {
    get: (key: string) => Promise<{ body: ReadableStream; etag: string; httpMetadata?: { contentType?: string } } | null>;
    put: (key: string, value: ArrayBuffer, options?: { httpMetadata?: { contentType?: string } }) => Promise<unknown>;
    delete: (key: string) => Promise<unknown>;
  };
  ADMIN_SETUP_TOKEN?: string;
  ADMIN_SESSION_SECRET?: string;
};

export async function runtimeBindings() {
  const { env } = await import("cloudflare:workers");
  return env as unknown as RuntimeBindings;
}

export async function ensureAppSchema() {
  const runtime = await runtimeBindings();
  const db = runtime.DB;
  if (!db) throw new Error("La base de datos no está disponible");

  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS poker_games (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL,
      data TEXT NOT NULL,
      started_at TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS poker_cash_games (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL,
      data TEXT NOT NULL,
      started_at TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS poker_games_updated_idx ON poker_games (updated_at)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS poker_game_modes (
      id TEXT PRIMARY KEY NOT NULL,
      mode TEXT NOT NULL CHECK(mode IN ('chips','cash','temporary')),
      sheets_cleanup INTEGER NOT NULL DEFAULT 0
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS poker_admins (
      id TEXT PRIMARY KEY NOT NULL,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS poker_roster (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      nickname TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL DEFAULT 'permanente',
      active INTEGER NOT NULL DEFAULT 1,
      avatar_key TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS poker_roster_name_idx ON poker_roster (name)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS poker_settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS poker_statistics_visibility (
      identity_key TEXT PRIMARY KEY NOT NULL,
      hidden INTEGER NOT NULL DEFAULT 0 CHECK(hidden IN (0, 1)),
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
  ]);

  return db;
}

export async function getSetting(key: string) {
  const db = await ensureAppSchema();
  const row = await db.prepare("SELECT value FROM poker_settings WHERE key = ?").bind(key).first<{ value: string }>();
  return row?.value ?? null;
}

export async function putSetting(key: string, value: string) {
  const db = await ensureAppSchema();
  await db.prepare(`INSERT INTO poker_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`).bind(key, value).run();
}
