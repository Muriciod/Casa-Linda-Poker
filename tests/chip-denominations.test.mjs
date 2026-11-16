import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
async function moduleAt(path){const source=readFileSync(new URL(path,import.meta.url),'utf8');return import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'));}
const c=await moduleAt('../lib/chip-calculator.ts');
const p=await moduleAt('../lib/chip-denomination-preferences.ts');
const base=()=>({...structuredClone(c.COLOR_CONFIG),autoValues:false,inventory:[100,100,100,100,100]});
test('custom denominations survive buy-in, player and stack changes in both alternatives',()=>{
 for(const [buyIn,bb,players] of [[500000,50,6],[1000000,50,2],[1000000,100,6]]){
 const input={...base(),buyIn,bb,players};const before=structuredClone(input);
 const alternatives=c.recommend(input);assert.deepEqual(alternatives.map(x=>x.label),['Recomendada','Más cambio']);
 for(const {result} of alternatives){assert.deepEqual(result.config.chipValues,c.COLOR_VALUES);for(const row of result.stacks)assert.equal(c.monetaryValue(row,result.config),buyIn);assert.deepEqual(result.bank.map((n,i)=>n+result.stacks.reduce((s,row)=>s+row[i],0)),input.inventory);}
 assert.deepEqual(input,before);
 }
 assert.throws(()=>c.recommend({...base(),buyIn:500000,bb:100}),/compatibles/);
});
test('automatic results never replace persisted custom values when toggling modes or reloading',()=>{
 const custom={...base(),chipValues:[1000,2000,5000,10000,20000],buyIn:40000};
 const automatic={...custom,autoValues:true};const saved=JSON.stringify(p.denominationPreferences(automatic));
 const alternatives=c.recommend(automatic);for(const {result} of alternatives)assert.equal(result.config.autoValues,true);
 assert.deepEqual(automatic.chipValues,custom.chipValues);
 const reloaded=p.restoreDenominationPreferences(base(),saved);assert.deepEqual(reloaded.chipValues,custom.chipValues);assert.equal(reloaded.autoValues,true);
 const manual=p.restoreDenominationPreferences(base(),JSON.stringify(p.denominationPreferences({...reloaded,autoValues:false})));
 assert.equal(manual.autoValues,false);assert.deepEqual(manual.chipValues,custom.chipValues);
 assert.deepEqual(c.recommend({...manual,buyIn:100000,bb:50})[0].result.config.chipValues,custom.chipValues);
});
test('preference restore rejects malformed values, preserves inventory and isolates numbered case',()=>{
 const input=base();for(const raw of ['{','null',JSON.stringify({autoValues:false,chipValues:[1,1,2,3,4]}),JSON.stringify({autoValues:'false',chipValues:c.COLOR_VALUES})])assert.deepEqual(p.restoreDenominationPreferences(input,raw),input);
 const saved=JSON.stringify({autoValues:true,chipValues:[100,200,500,1000,2000],inventory:[1,1,1,1,1]});assert.deepEqual(p.restoreDenominationPreferences(input,saved).inventory,input.inventory);
 assert.deepEqual(p.restoreDenominationPreferences(c.DEFAULT_CONFIG,saved),c.DEFAULT_CONFIG);
 assert.equal(p.restoreDenominationPreferences(c.COLOR_CONFIG,null).autoValues,false);
 assert.equal(p.denominationPreferences({...input,chipValues:[0,1,2,3,4]}),null);
});
