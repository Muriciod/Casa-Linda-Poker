import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

// Exercise the generic engine with the six-denomination reference without
// changing either real case's fixed denomination count or persisted schema.
const source=readFileSync(new URL('../lib/chip-calculator.ts',import.meta.url),'utf8')+'\nexport {createEngine};';
const c=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'));
const config=(extra={})=>({...structuredClone(c.COLOR_CONFIG),autoValues:false,buyIn:40000,bb:100,players:7,chipValues:[100,200,500,1000,5000],inventory:[80,80,80,80,80],...extra});
function exact(result,values=c.chipValues(result.config)){
  assert.equal(result.stacks.length,result.config.players);
  for(const row of result.stacks){assert.equal(row.length,values.length);assert.ok(row.every(n=>Number.isInteger(n)&&n>=0));assert.equal(row.reduce((sum,n,i)=>sum+n*values[i],0),result.config.buyIn);}
  assert.ok(result.bank.every(n=>n>=0));
  assert.deepEqual(result.bank.map((n,i)=>n+result.stacks.reduce((sum,row)=>sum+row[i],0)),result.config.inventory);
}

test('40k/200–400 for seven: compact with real 5k stock, exact, several BBs and equal stacks',()=>{
  const input=config(),before=structuredClone(input);
  for(const {result:r} of c.recommend(input)){
    exact(r);assert.deepEqual(r.config.chipValues,input.chipValues);
    assert.ok(r.stacks.every(row=>c.count(row)>=10&&c.count(row)<=30));
    assert.ok(r.stacks.every(row=>row.join()===r.stacks[0].join()));
    assert.ok(r.bigBlindPayments>=3);assert.ok(r.changePayments>=4);
    assert.ok(r.stacks.every(row=>row[4]*5000>=input.buyIn*.6));
  }
  const r=c.recommend(input)[0].result;
  assert.ok(c.count(r.stacks[0])<=25);assert.ok(c.count(r.stacks[0])<32); // Previous solver with these exact inputs: 32.
  assert.ok(r.stacks.every(row=>row[0]===0&&row[2]===0));
  assert.deepEqual(input,before);
});

test('six-denomination quality reference needs about 21 chips without requiring every denomination',()=>{
  const values=[100,200,500,1000,2000,5000];
  const engine=c.createEngine(values.map(v=>v/100),100);
  const input=config({chipValues:values.slice(0,5),inventory:values.map(()=>80)});
  const r=engine.calculate(input);exact(r,values);
  assert.ok(r.stacks.every(row=>c.count(row)>=15&&c.count(row)<=25));
  assert.ok(r.stacks.every(row=>row[5]*5000>=input.buyIn*.6&&row[1]>=6&&row.filter(Boolean).length<values.length));
  assert.ok(r.bigBlindPayments>=4);assert.ok(r.changePayments>=4);
});

test('original 49-chip regression improves its bounded-search fallback without inventing a 5k chip',()=>{
  const input=config({chipValues:[100,200,500,1000,2000]});
  const r=c.calculate(input);exact(r);
  assert.deepEqual(r.config.chipValues,input.chipValues);
  assert.ok(r.stacks.every(row=>c.count(row)<49));
  assert.ok(r.bigBlindPayments>=3);
  // Even the minimum total table allocation needs >30 chips on average here.
  assert.ok(r.warnings.some(w=>w.includes('denominaciones y existencias requieren más de 30')));
  if(!r.optimal)assert.ok(r.warnings.some(w=>w.includes('límite de búsqueda')));
});

test('scarce large chips and physically unavoidable large stacks remain valid',()=>{
  const input=config({inventory:[80,80,80,100,28]});
  const r=c.calculate(input);exact(r);assert.ok(r.stacks.reduce((sum,row)=>sum+row[4],0)<=28);
  const unavoidable=config({buyIn:4000,players:2,automatic:false,small:100,big:200,chipValues:[100,500,1000,2000,5000],inventory:[80,0,0,0,0]});
  const large=c.calculate(unavoidable);exact(large);assert.ok(large.stacks.every(row=>c.count(row)===40));
  assert.throws(()=>c.calculate({...input,inventory:[4,4,1,1,1]}),/insuficiente/);
});

test('compact betting mix adapts to units, BB availability and table size',()=>{
  for(const unit of [1,5,50])for(const players of [2,5,7,10])for(const hasBB of [false,true]){
    const input=config({buyIn:100*unit,players,automatic:false,small:unit,big:2*unit,chipValues:[1,2,5,10,25].map(v=>v*unit),inventory:[players*20,hasBB?players*20:0,players*20,players*10,players*10]});
    const r=c.calculate(input);exact(r);assert.ok(r.bigBlindPayments>=3);
    assert.ok(r.stacks.every(row=>c.count(row)<=30));
    assert.ok(r.stacks.every(row=>hasBB?row[1]>=3:row[0]>=6));
  }
});

test('automatic values select compact practical candidates without overwriting custom preferences',()=>{
  for(const buyIn of [20000,40000,500000,1000000]){
    const input=config({buyIn,autoValues:true}),before=structuredClone(input);
    const r=c.recommend(input)[0].result;exact(r);assert.deepEqual(input,before);
    assert.ok(r.bigBlindPayments>=3);assert.ok(r.stacks.every(row=>c.count(row)<=30));
    assert.ok(r.config.chipValues.every(v=>{while(v%10===0)v/=10;return [1,2,5].includes(v);}));
  }
});
