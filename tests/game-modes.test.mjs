import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

let sqlite, authorized = true, failBatchAt = -1, beforeBatch, sheetsFail = false;
const synced = [], deleted = [];
const db = {
  prepare(sql) {
    const statement = (values = []) => ({sql, values,
      bind: (...args) => statement(args),
      first: async () => sqlite.prepare(sql).get(...values) ?? null,
      all: async () => ({results: sqlite.prepare(sql).all(...values)}),
      run: async () => sqlite.prepare(sql).run(...values),
    });
    return statement();
  },
  async batch(statements) {
    if (beforeBatch) { const hook = beforeBatch; beforeBatch = null; await hook(); }
    sqlite.exec('BEGIN');
    try {
      const results = statements.map((s, i) => {
        if (i === failBatchAt) throw Error('Simulated write failure');
        const st = sqlite.prepare(s.sql);
        return /^\s*SELECT/.test(s.sql) ? {results:st.all(...s.values)} : {meta:st.run(...s.values)};
      });
      sqlite.exec('COMMIT'); return results;
    } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  }
};
function reset() {
  sqlite?.close(); sqlite = new DatabaseSync(':memory:');
  const schema = readFileSync(new URL('../lib/app-storage.ts',import.meta.url),'utf8');
  for (const match of schema.matchAll(/db\.prepare\(`(CREATE TABLE[\s\S]*?)`\)/g)) sqlite.exec(match[1]);
  authorized=true; sheetsFail=false; failBatchAt=-1; beforeBatch=null; synced.length=0; deleted.length=0;
}
globalThis.__modeTest = {
  requireAdmin: async () => { if (!authorized) throw new Response('Unauthorized', {status:401}); },
  ensureAppSchema: async () => db,
  deleteSheetsGame: async (id) => { if (sheetsFail) throw Error('Sheets offline'); deleted.push(id); },
  syncSheetsSnapshot: async (games) => { if (sheetsFail) throw Error('Sheets offline'); synced.push(games); return {synced:true}; }
};
async function route(path) {
  const source = readFileSync(new URL(path, import.meta.url),'utf8').replace(/^import .*;$/gm,'');
  const js=ts.transpileModule('const { requireAdmin, ensureAppSchema, deleteSheetsGame, syncSheetsSnapshot } = globalThis.__modeTest;\n'+source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
  return import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
}
const api = await route('../app/api/games/route.ts');
const csv = await route('../app/api/cash-export/route.ts');
const game = (id, mode) => ({id, mode, name:id, startedAt:'2026-10-14T17:00:00Z',endedAt:'2026-10-14T18:00:00Z',status:'finalized',blinds:'5.000 / 10.000',players:[{id:'p1',name:'Mauri',cashOut:750000,movements:[{id:'m1',type:'buyin',amount:500000,createdAt:'2026-10-14T17:00:00Z'}]}]});
const post = (games) => api.POST(new Request('https://example.test/api/games',{method:'POST',body:JSON.stringify({games})}));
const patch = (id,from,mode,game) => api.PATCH(new Request('https://example.test/api/games',{method:'PATCH',body:JSON.stringify({id,from,mode,game})}));
const rows = (table) => sqlite.prepare(`SELECT data FROM ${table}`).all().map(r=>JSON.parse(r.data));
test('temporary data cannot enter normal autosave',async()=>{reset();assert.equal((await post([game('temp','temporary')])).status,400);assert.deepEqual(rows('poker_games'),[]);});
test('cash and chips stay separate, and only chips sync to Sheets',async()=>{reset();await post([game('cash','cash'),game('legacy')]);assert.equal(rows('poker_cash_games').length,1);assert.deepEqual(synced.at(-1).map(x=>x.id),['legacy']);});
test('chips → cash → chips preserves every player, movement, result and date without duplicates',async()=>{
 reset();const original=game('one');await post([original]);
 for(const [from,to] of [['chips','cash'],['cash','chips']]) {
   const response=await patch('one',from,to);assert.equal(response.status,200);
   const moved=(await response.json()).game;assert.deepEqual(moved,{...original,mode:to});
   assert.equal(rows('poker_games').length+rows('poker_cash_games').length,1);
 }
 assert.ok(deleted.includes('one'));
});
test('both ledgers can become temporary; stale autosave cannot resurrect them; can save again',async()=>{
 for(const from of ['chips','cash']) {
  reset();const original=game('one',from);await post([original]);const r=await patch('one',from,'temporary');assert.equal(r.status,200);
  const temporary=(await r.json()).game;assert.deepEqual(rows('poker_games'),[]);assert.deepEqual(rows('poker_cash_games'),[]);
  assert.equal((await post([original])).status,409);assert.deepEqual(rows('poker_games'),[]);
  assert.equal((await patch('one','temporary','cash',temporary)).status,200);assert.deepEqual(rows('poker_cash_games')[0].players,original.players);
 }
});
test('server rejects invalid, missing and unauthorized transitions',async()=>{reset();assert.equal((await patch('x','chips','other')).status,400);assert.equal((await patch('x','chips','cash')).status,404);authorized=false;assert.equal((await patch('x','chips','cash')).status,401);});
test('failed transaction keeps the original intact',async()=>{reset();await post([game('one','chips')]);failBatchAt=1;assert.equal((await patch('one','chips','cash')).status,500);assert.equal(rows('poker_games').length,1);assert.equal(rows('poker_cash_games').length,0);assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM poker_game_modes').get().n,0);});
test('simultaneous different moves cannot leave a persistent duplicate in temporary mode',async()=>{
 reset();await post([game('one','chips')]);beforeBatch=async()=>{assert.equal((await patch('one','chips','temporary')).status,200);};
 assert.equal((await patch('one','chips','cash')).status,409);assert.equal(rows('poker_games').length+rows('poker_cash_games').length,0);
});
test('migration captures latest stored cash-out inside transaction',async()=>{
 for(const target of ['cash','temporary']) {
  reset();await post([game('one','chips')]);beforeBatch=async()=>{const g=game('one','chips');g.players[0].cashOut=850000;await post([g]);};
  const r=await patch('one','chips',target);assert.equal((await r.json()).game.players[0].cashOut,850000);
 }
});
test('Sheets failure keeps migration safe and retries cleanup on next save',async()=>{reset();await post([game('one','chips')]);sheetsFail=true;const r=await patch('one','chips','cash');assert.equal((await r.json()).sheetsPending,true);assert.equal(rows('poker_cash_games').length,1);sheetsFail=false;await post(rows('poker_cash_games'));assert.ok(deleted.includes('one'));assert.equal(sqlite.prepare('SELECT sheets_cleanup n FROM poker_game_modes').get().n,0);});
test('legacy net results survive migration and CASHGAME CSV export',async()=>{reset();const g={...game('legacy-session-1','chips'),legacy:true,sheetColumn:2,players:[{id:'legacy-p',name:'Test',movements:[],cashOut:null,legacyResult:-250000}]};await post([g]);const r=await patch(g.id,'chips','cash');assert.equal((await r.json()).legacySheetUnchanged,true);assert.deepEqual(rows('poker_cash_games')[0].players,g.players);const response=await csv.GET(new Request('https://example.test/api/cash-export'));assert.match(await response.text(),/"-250000"/);assert.deepEqual(deleted,[]);});
test('new temporary sessions can be saved to either permanent ledger',async()=>{
 for(const to of ['chips','cash']) { reset();const g=game('new','temporary');const r=await patch(g.id,'temporary',to,g);assert.equal(r.status,200);assert.deepEqual(rows(to==='cash'?'poker_cash_games':'poker_games')[0],{...g,mode:to}); }
});
test('Sheets import cannot recreate sessions moved to cash or temporary',async()=>{
 for(const mode of ['cash','temporary']) {
  reset();const g=game('imported','chips');await post([g]);await patch(g.id,'chips',mode);
  const source=readFileSync(new URL('../app/api/settings/route.ts',import.meta.url),'utf8');
  const sql=source.match(/db\.prepare\(`(INSERT INTO poker_games[\s\S]*?)`\)/)[1];
  sqlite.prepare(sql).run(g.id,g.name,g.status,JSON.stringify(g),g.startedAt,g.id);
  assert.equal(rows('poker_games').length,0);
 }
});

test('USD-origin normalized buy-in and blind metadata survive saves, reload and mode changes without re-conversion', async()=>{
 reset();
 const source=readFileSync(new URL('../lib/game-stakes.ts',import.meta.url),'utf8');
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 const {calculateGameStakes}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
 const settings=calculateGameStakes(20,'USD',50);
 const original={...game('usd','chips'),...settings,players:[]};
 assert.equal((await post([original])).status,200);
 assert.deepEqual((await (await api.GET()).json()).games[0],original);
 assert.equal(synced.at(-1)[0].standardBuyIn,120000);
 assert.equal((await post([original])).status,200);
 assert.equal(rows('poker_games')[0].standardBuyIn,120000);
 for(const [from,to] of [['chips','cash'],['cash','temporary'],['temporary','chips']]) {
  const latest={...original,mode:from};
  const response=await patch('usd',from,to,from==='temporary'?latest:undefined);
  assert.equal(response.status,200);assert.deepEqual((await response.json()).game,{...original,mode:to});
 }
});
