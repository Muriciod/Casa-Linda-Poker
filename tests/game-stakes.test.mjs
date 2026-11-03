import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const load = async path => import('data:text/javascript;base64,' + Buffer.from(ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString('base64'));
const { calculateGameStakes } = await load('../lib/game-stakes.ts');
const { summarizeSessions } = await load('../lib/player-statistics.ts');
test('20 USD at 100 BB converts once to 120000 Gs with 600 / 1200 blinds', () => {
  const stakes = calculateGameStakes(20, 'USD', 100);
  assert.deepEqual(stakes, {currency:'PYG', inputCurrency:'USD', inputBuyIn:20, exchangeRate:6000, buyInBB:100, standardBuyIn:120000, smallBlind:600, bigBlind:1200, blinds:'600 / 1.200'});
});
test('50 BB doubles blinds without changing the buy-in', () => {
  const stakes = calculateGameStakes(20, 'USD', 50);
  assert.equal(stakes.standardBuyIn, 120000); assert.equal(stakes.bigBlind, 2400); assert.equal(stakes.smallBlind, 1200); assert.equal(stakes.blinds, '1.200 / 2.400');
});
test('PYG is not converted; both stack sizes are derived from the entered buy-in', () => {
  for (const bb of [100, 50]) {
    const stakes = calculateGameStakes(500000, 'PYG', bb);
    assert.equal(stakes.standardBuyIn, 500000); assert.equal(stakes.exchangeRate, 1);
    assert.equal(stakes.bigBlind * bb, 500000); assert.equal(stakes.smallBlind * 2, stakes.bigBlind);
  }
});
test('USD cents convert exactly and fractional blinds are not silently rounded to integers', () => {
  assert.equal(calculateGameStakes(10.25, 'USD', 100).standardBuyIn, 61500);
  assert.equal(calculateGameStakes(10.25, 'USD', 100).smallBlind, 307.5);
  assert.equal(calculateGameStakes(0.01, 'USD', 100).blinds, '0,3 / 0,6');
  assert.equal(calculateGameStakes(1, 'PYG', 100).blinds, '0,005 / 0,01');
});
test('invalid amounts, units and BB options cannot create a game', () => {
  for (const amount of [0, -1, NaN, Infinity, 1e20]) assert.equal(calculateGameStakes(amount, 'USD', 100), null);
  assert.equal(calculateGameStakes(1.234, 'USD', 100), null);
  assert.equal(calculateGameStakes(1.5, 'PYG', 100), null);
  assert.equal(calculateGameStakes(20, 'EUR', 100), null);
  assert.equal(calculateGameStakes(20, 'USD', 75), null);
});
test('normal results and stats remain in PYG for USD-origin games after serialization', () => {
  const stakes = calculateGameStakes(20, 'USD', 100);
  const game = JSON.parse(JSON.stringify({ id:'usd-game', name:'USD test', status:'finalized', mode:'cash', startedAt:'2026-10-22T18:00:00Z', ...stakes }));
  const player = { id:'one', name:'One', cashOut:180000, movements:[{type:'buyin',amount:game.standardBuyIn}] };
  const stats = summarizeSessions([{game, player}]);
  assert.equal(stats.invested,120000); assert.equal(stats.balance,60000); assert.equal(stats.winRate,100);
  assert.equal(game.blinds,'600 / 1.200'); assert.equal(game.inputBuyIn,20);
});
