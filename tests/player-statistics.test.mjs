import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

const compile = source => 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString('base64');
const stats = await import(compile(readFileSync(new URL('../lib/player-statistics.ts', import.meta.url), 'utf8')));
const { buildPlayerProfiles, summarizeSessions, filterSessions, isProfileHidden } = stats;
const roster = [{ id: 'registered-ana', name: 'Ana María', nickname: 'Ana', kind: 'permanente' }, { id: 'registered-luis', name: 'Luis', kind: 'permanente' }];
const player = (net, overrides = {}) => ({ id: 'registered-ana', name: 'Ana María', nickname: 'Ana', cashOut: 1000 + net, movements: [{ type: 'buyin', amount: 1000 }], ...overrides });
const game = (id, net, overrides = {}) => ({ id, name: id, mode: 'chips', startedAt: '2026-10-14T21:00:00Z', status: 'finalized', blinds: '5 / 10', players: [player(net)], ...overrides });
const profile = games => buildPlayerProfiles(games, roster).find(p => p.key === 'id:registered-ana');

test('win rate: positives only; ties in denominator, separate from wins and losses; active excluded', () => {
  const p = profile([game('win', 300), game('loss', -100), game('tie', 0), game('active', 900, { status: 'active' })]);
  const s = summarizeSessions(p.sessions);
  assert.equal(s.total, 4); assert.equal(s.settled, 3); assert.equal(s.wins, 1); assert.equal(s.losses, 1); assert.equal(s.ties, 1);
  assert.ok(Math.abs(s.winRate - 100 / 3) < 1e-10); assert.equal(s.balance, 200); assert.equal(s.average, 200 / 3); assert.equal(s.best, 300); assert.equal(s.worst, -100);
});
test('no finalized result gives an empty rate, never NaN or a false loss', () => {
  for (const sessions of [[], [{ game: game('missing', 0), player: player(0, { cashOut: null }) }]]) {
    const s = summarizeSessions(sessions); assert.equal(s.winRate, null); assert.equal(s.average, null); assert.equal(s.losses, 0);
  }
});
test('temporary games create no profiles, aliases, sessions or stats even when using a registered name', () => {
  const games = [game('real', 10), game('temp-known', 999, { mode: 'temporary' }), game('temp-new', 999, { mode: 'temporary', players: [player(999, { id: 'guest', name: 'Guest', nickname: '' })] })];
  const profiles = buildPlayerProfiles(games, roster);
  assert.equal(profiles.length, 2); assert.equal(profile(games).sessions.length, 1); assert.equal(summarizeSessions(profile(games).sessions).balance, 10);
  assert.equal(buildPlayerProfiles([games[2]], []).length, 0);
  assert.equal(summarizeSessions([{ game: games[2], player: games[2].players[0] }]).total, 0);
});
test('Fichas and CASHGAME results remain independently filterable; old mode-less games are Fichas', () => {
  const p = profile([game('old', 100, { mode: undefined }), game('cash', -200, { mode: 'cash' })]);
  const chips = summarizeSessions(filterSessions(p.sessions, { mode: 'chips', from: '', to: '' }));
  const cash = summarizeSessions(filterSessions(p.sessions, { mode: 'cash', from: '', to: '' }));
  assert.equal(chips.balance, 100); assert.equal(chips.winRate, 100); assert.equal(cash.balance, -200); assert.equal(cash.winRate, 0);
});
test('legacy net results and name aliases join the existing profile without changing source data', () => {
  const old = game('old', 0, { legacy: true, players: [player(0, { id: 'legacy-15-3', name: 'ANA', nickname: '', cashOut: null, movements: [], legacyResult: -250 })] });
  const games = [old, game('new', 500)]; const before = JSON.stringify(games);
  const p = profile(games); assert.equal(p.sessions.length, 2); assert.equal(summarizeSessions(p.sessions).balance, 250); assert.equal(JSON.stringify(games), before);
});
test('dates use Paraguay local day and inclusive boundaries', () => {
  const p = profile([game('late', 100, { startedAt: '2026-10-15T01:30:00Z' }), game('next', 20, { startedAt: '2026-10-15T16:00:00Z' })]);
  assert.deepEqual(filterSessions(p.sessions, { mode: 'all', from: '2026-10-14', to: '2026-10-14' }).map(s => s.game.id), ['late']);
});
test('an imported session with no valid date still contributes to unfiltered totals', () => {
  const p = profile([game('unknown-date', 100, { startedAt: 'sin fecha' }), game('dated', 20)]);
  assert.equal(summarizeSessions(filterSessions(p.sessions, { mode: 'all', from: '', to: '' })).balance, 120);
  assert.deepEqual(filterSessions(p.sessions, { mode: 'all', from: '', to: '2026-10-14' }).map(s => s.game.id), ['dated']);
});
test('registered players with the same name remain separate by ID', () => {
  const duplicateRoster = [{ id: 'one', name: 'Alex', kind: 'permanente' }, { id: 'two', name: 'Alex', kind: 'permanente' }];
  const profiles = buildPlayerProfiles([game('one', 100, { players: [player(100, { id: 'one', name: 'Alex', nickname: '' }), player(-100, { id: 'two', name: 'Alex', nickname: '' })] })], duplicateRoster);
  assert.equal(profiles.length, 2); assert.equal(profiles[0].sessions.length, 1); assert.equal(isProfileHidden(profiles[1], profiles[0].identityKeys), false);
});

let sqlite, authorized = true, failBatch = false;
const db = {
  prepare(sql) {
    const statement = (values = []) => ({ sql, values, bind: (...args) => statement(args), first: async () => sqlite.prepare(sql).get(...values) ?? null, all: async () => ({ results: sqlite.prepare(sql).all(...values) }), run: async () => sqlite.prepare(sql).run(...values) });
    return statement();
  },
  async batch(statements) {
    sqlite.exec('BEGIN');
    try { for (const [i, s] of statements.entries()) { if (failBatch && i === 1) throw Error('Write failed'); sqlite.prepare(s.sql).run(...s.values); } sqlite.exec('COMMIT'); }
    catch (e) { sqlite.exec('ROLLBACK'); throw e; }
  }
};
globalThis.__statisticsTest = { ...stats, ensureAppSchema: async () => db, requireAdmin: async () => { if (!authorized) throw new Response('Unauthorized', { status: 401 }); } };
const api = await import(compile('const { buildPlayerProfiles, ensureAppSchema, requireAdmin } = globalThis.__statisticsTest;\n' + readFileSync(new URL('../app/api/statistics/route.ts', import.meta.url), 'utf8').replace(/^import .*;$/gm, '')));
function reset() {
  sqlite?.close(); sqlite = new DatabaseSync(':memory:'); authorized = true; failBatch = false;
  const source = readFileSync(new URL('../lib/app-storage.ts', import.meta.url), 'utf8');
  for (const match of source.matchAll(/db\.prepare\(`(CREATE TABLE[\s\S]*?)`\)/g)) sqlite.exec(match[1]);
  for (const p of roster) sqlite.prepare('INSERT INTO poker_roster (id,name,nickname,kind) VALUES (?,?,?,?)').run(p.id, p.name, p.nickname || '', p.kind);
}
function saveGame(g) { sqlite.prepare(`INSERT INTO ${g.mode === 'cash' ? 'poker_cash_games' : 'poker_games'} (id,name,status,data,started_at) VALUES (?,?,?,?,?)`).run(g.id, g.name, g.status, JSON.stringify(g), g.startedAt); }
const change = (profileKey, hidden) => api.PATCH(new Request('https://example.test/api/statistics', { method: 'PATCH', body: JSON.stringify({ profileKey, hidden }) }));
const hiddenKeys = async () => (await (await api.GET()).json()).hiddenKeys;
const snapshot = () => ['poker_games', 'poker_cash_games', 'poker_roster'].map(table => sqlite.prepare(`SELECT * FROM ${table}`).all());
test('hide persists through new sessions and reload, removes both modes, preserves all data and other players; restore is manual', async () => {
  reset(); const games = [game('chips', 100), game('cash', -80, { mode: 'cash' }), game('luis', 10, { players: [player(10, { id: 'registered-luis', name: 'Luis', nickname: '' })] })];
  games.forEach(saveGame); const before = snapshot();
  assert.equal((await change('id:registered-ana', true)).status, 200); assert.deepEqual(snapshot(), before);
  const newGame = game('future', 900); saveGame(newGame); games.push(newGame);
  const p = profile(games); assert.ok(isProfileHidden(p, await hiddenKeys()));
  const visible = buildPlayerProfiles(games, roster).filter(p => !isProfileHidden(p, sqlite.prepare('SELECT identity_key FROM poker_statistics_visibility WHERE hidden = 1').all().map(r => r.identity_key)));
  assert.deepEqual(visible.map(p => p.name), ['Luis']); assert.equal(summarizeSessions(visible[0].sessions).balance, 10);
  assert.equal((await change(p.key, false)).status, 200); assert.equal(isProfileHidden(p, await hiddenKeys()), false); assert.equal(p.sessions.length, 3);
});
test('historical-only profile can be hidden, then stays hidden when registered later', async () => {
  reset(); const old = game('old', 0, { legacy: true, players: [player(0, { id: 'legacy-x', name: 'Pepe', nickname: '', legacyResult: 150, cashOut: null })] }); saveGame(old);
  assert.equal((await change('name:pepe', true)).status, 200);
  const entry = { id: 'new-pepe', name: 'Pepe', kind: 'permanente' }; sqlite.prepare('INSERT INTO poker_roster (id,name,kind) VALUES (?,?,?)').run(entry.id, entry.name, entry.kind);
  const newGame = game('future', 100, { players: [player(100, { id: entry.id, name: entry.name, nickname: '' })] }); saveGame(newGame);
  const p = buildPlayerProfiles([old, newGame], [...roster, entry]).find(p => p.key === 'id:new-pepe');
  assert.equal(p.sessions.length, 2); assert.ok(isProfileHidden(p, await hiddenKeys()));
  assert.equal((await change(p.key, false)).status, 200); assert.equal(isProfileHidden(p, await hiddenKeys()), false);
});
test('visitors cannot hide or restore; invalid and temporary-only identities cannot be created', async () => {
  reset(); authorized = false; assert.equal((await change('id:registered-ana', true)).status, 401); authorized = true;
  assert.equal((await change('name:temporary-guest', true)).status, 404); assert.equal((await change('id:registered-ana', 'yes')).status, 400);
  assert.deepEqual(await hiddenKeys(), []); assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM poker_roster').get().n, 2);
});
test('failed visibility transaction leaves original state intact', async () => { reset(); failBatch = true; assert.equal((await change('id:registered-ana', true)).status, 500); assert.deepEqual(await hiddenKeys(), []); });
