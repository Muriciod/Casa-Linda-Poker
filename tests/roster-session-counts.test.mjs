import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../lib/roster-session-counts.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { rosterCountsForMode } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
const normalize = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

// Reference: the original per-player scan of the complete history.
function scan(roster, games, mode) {
  if (mode === 'temporary') return new Map();
  return new Map(roster.map(entry => [entry.id, games.filter(g => (g.mode || 'chips') === (mode || 'chips')).reduce((n, game) => n + Number(game.players.some(p =>
    entry.id === p.id || normalize(entry.name) === normalize(p.name)
    || normalize(entry.nickname || entry.name) === normalize(p.nickname || p.name))), 0)]));
}
test('indexed sessions agree with original scan across modes, duplicate seats/IDs and ambiguous names', () => {
  let seed = 7;
  const pick = a => a[(seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) % a.length];
  const names = ['', 'Máx', '  Max', 'MARÍA', 'Maria', 'Tito', 'Mauri', 'Anita'];
  const modes = [undefined, 'chips', 'cash', 'temporary'];
  const entry = () => ({ id: pick(['a','b','c','d','e','f','g','h','i']), name: pick(names), nickname: pick([...names, undefined]) });
  for (let caseNumber = 0; caseNumber < 120; caseNumber++) {
    const roster = Array.from({length: caseNumber % 13}, entry);
    const games = Array.from({length: caseNumber % 11}, () => ({mode: pick(modes), players: Array.from({length: caseNumber % 9}, entry)}));
    for (const mode of modes) assert.deepEqual([...rosterCountsForMode(roster, games, mode, normalize)], [...scan(roster, games, mode)]);
  }
});
