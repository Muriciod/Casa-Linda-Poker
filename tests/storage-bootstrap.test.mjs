import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

// Use the real bootstrap and SQLite statements with separate simulated Worker
// bindings; there must be no request-bound promise or app data in the cache.
const repairSource = readFileSync(new URL('../lib/roster-repair.ts', import.meta.url), 'utf8');
const source = readFileSync(new URL('../lib/app-storage.ts', import.meta.url), 'utf8')
  .replace('import { retireUnusedMauriDuplicate } from "./roster-repair";', repairSource)
  .replace('const { env } = await import("cloudflare:workers");', 'const env = globalThis.__bootstrapTestEnvironment;');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { ensureAppSchema, getSetting } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));

function fixture() {
  const sql = new DatabaseSync(':memory:');
  let batches = 0;
  const binding = {
    prepare(statement) {
      const query = (args = []) => ({
        bind: (...values) => query(values),
        run: async () => sql.prepare(statement).run(...args),
        first: async () => sql.prepare(statement).get(...args),
      });
      return query();
    },
    async batch(statements) {
      batches++;
      for (const stmt of statements) await stmt.run();
    },
  };
  return { binding, sql, batches: () => batches };
}

test('warm schema skips DDL by binding, keeps repairing reimported rows and reads fresh game settings', async () => {
  const first = fixture(), second = fixture();
  try {
    for (const db of [first, second]) {
      globalThis.__bootstrapTestEnvironment = { DB: db.binding };
      await ensureAppSchema();
      db.sql.exec("INSERT INTO poker_roster(id,name,created_at) VALUES('jugador-mauri','Mauri','2026-08-04'),('mauri-4efa1695','Mauri','2026-11-14 05:11:16'); INSERT INTO poker_settings(key,value) VALUES('check','old')");
      await ensureAppSchema();
      assert.equal(db.sql.prepare("SELECT active FROM poker_roster WHERE id='mauri-4efa1695'").get().active, 0);
      assert.equal(await getSetting('check'), 'old');
      db.sql.exec("UPDATE poker_settings SET value='new' WHERE key='check'; UPDATE poker_roster SET active=1");
      assert.equal(await getSetting('check'), 'new');
      assert.equal(db.sql.prepare("SELECT active FROM poker_roster WHERE id='mauri-4efa1695'").get().active, 0);
      assert.equal(db.batches(), 1);
    }
  } finally { first.sql.close(); second.sql.close(); delete globalThis.__bootstrapTestEnvironment; }
});

test('failed and simultaneous cold requests cannot prematurely skip initialization', async () => {
  const db = fixture();
  try {
    globalThis.__bootstrapTestEnvironment = { DB: db.binding };
    const runBatch = db.binding.batch;
    db.binding.batch = async () => { throw Error('temporarily unavailable'); };
    await assert.rejects(ensureAppSchema(), /temporarily unavailable/);
    db.binding.batch = runBatch;
    const connections = await Promise.all([ensureAppSchema(), ensureAppSchema()]);
    assert.deepEqual(connections, [db.binding, db.binding]);
    assert.ok(db.batches() >= 1);
    const previous = db.batches();
    await ensureAppSchema();
    assert.equal(db.batches(), previous);
  } finally { db.sql.close(); delete globalThis.__bootstrapTestEnvironment; }
});
