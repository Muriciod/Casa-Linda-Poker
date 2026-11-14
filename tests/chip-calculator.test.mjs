import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../lib/chip-calculator.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const c=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const config=(extra={})=>({...structuredClone(c.DEFAULT_CONFIG),...extra});
function invariants(r){assert.equal(r.stacks.length,r.config.players);for(const row of r.stacks)assert.equal(c.value(row)*r.config.pointValue,r.config.buyIn);assert.ok(r.bank.every(n=>n>=0));assert.equal(c.value(r.bank)+r.stacks.reduce((n,row)=>n+c.value(row),0),c.value(r.config.inventory));for(let i=0;i<6;i++)assert.equal(r.bank[i]+r.stacks.reduce((n,row)=>n+row[i],0),r.config.inventory[i]);}
test('real inventory, exact 50bb and incompatible 100bb suggestion',()=>{assert.equal(c.count(c.INITIAL_INVENTORY),500);assert.deepEqual(c.blinds(config()),{small:5000,big:10000});assert.deepEqual(c.blinds(config({bb:100})),{small:2500,big:5000});assert.throws(()=>c.calculate(config({bb:100})),/×100/);invariants(c.calculate(config({bb:100,pointValue:100})));});
test('2–10 players: both modes exact, conserve inventory, balanced can pay both blinds',()=>{for(let players=2;players<=10;players++)for(const mode of ['balanced','minimum']){const r=c.calculate(config({players,mode}));invariants(r);assert.ok(r.stacks.every(row=>c.count(row)<=14));if(mode==='balanced'){assert.equal(r.balanced,true);for(const row of r.stacks){assert.ok(c.canPay(5,row));assert.ok(c.canPay(10,row));}}else assert.ok(r.stacks.every(row=>c.count(row)===1));}});
test('insufficient value, unrepresentable buy-in, no blind denominations, fractional currency',()=>{assert.throws(()=>c.calculate(config({inventory:[20,2,1,1,0,0]})),/insuficiente/);assert.throws(()=>c.calculate(config({buyIn:500001,automatic:false})),/equivalencia/);assert.throws(()=>c.calculate(config({inventory:[0,0,0,100,25,25]})),/ciegas/);assert.throws(()=>c.calculate(config({buyIn:51,pointValue:100})),/enteros/);assert.throws(()=>c.calculate(config({inventory:[-1,1,1,1,1,1]})),/Revisá/);});
test('scarce inventory uses unequal exact allocations simultaneously',()=>{const r=c.calculate(config({buyIn:100000,players:2,automatic:false,small:1000,big:5000,mode:'minimum',inventory:[5,1,4,1,0,0]}));invariants(r);assert.notDeepEqual(r.stacks[0],r.stacks[1]);assert.equal(r.stacks.reduce((n,row)=>n+c.count(row),0),5);});
test('alternative above 14 when no smaller physical solution exists',()=>{const r=c.calculate(config({buyIn:15000,pointValue:1000,players:2,automatic:false,small:1000,big:1000,mode:'minimum',inventory:[30,0,0,0,0,0]}));invariants(r);assert.deepEqual(r.stacks.map(c.count),[15,15]);assert.ok(r.warnings.some(w=>w.includes('14')));});
test('bank change conserves value, undo by replay, rejects nonexistent circulating chips',()=>{const result=c.calculate(config({mode:'minimum'}));const s={config:result.config,stacks:result.stacks,changes:[]};const before=c.sessionBank(s);const options=c.changeOptions(before,4);assert.ok(options.length);const change={denomination:4,given:options[0]};const after=c.sessionBank({...s,changes:[change]});assert.equal(c.value(after),c.value(before));assert.equal(after[4],before[4]+1);assert.deepEqual(c.sessionBank(s),before);assert.throws(()=>c.sessionBank({...s,changes:[{denomination:5,given:[0,0,0,0,2,0]}]}),/circulación/);assert.throws(()=>c.applyChange([0,0,0,0,0,0],change),/válido/);assert.throws(()=>c.applyChange(before,{denomination:3,given:[0,0,1,0,0,0]}),/válido/);});
test('configuration and simulations do not mutate stock or preferences',()=>{const cfg=config(),original=structuredClone(cfg);c.calculate(cfg);assert.deepEqual(cfg,original);assert.equal(c.validateState({config:cfg,session:null}).config,cfg);assert.throws(()=>c.validateState({config:cfg,session:{config:cfg,stacks:[],changes:[]}}),/válido/);});
test('manual blinds retain exact actual stack and flag selected bb mismatch',()=>{const r=c.calculate(config({automatic:false,big:5000,small:1000}));invariants(r);assert.ok(r.warnings.some(w=>w.includes('100bb')));});
// Independent exhaustive oracle for small inventories: checks global minimum, not a mirrored implementation.
test('minimum allocation agrees with exhaustive small-inventory oracle',()=>{
 for(let seed=1;seed<=30;seed++){
  const inventory=[2+seed%5,seed%4,seed%3,0,0,0],target=5+seed%15;
  const candidates=[];for(let a=0;a<=inventory[0];a++)for(let b=0;b<=inventory[1];b++)for(let d=0;d<=inventory[2];d++)if(a+5*b+25*d===target)candidates.push([a,b,d,0,0,0]);
  let best=Infinity;for(const a of candidates)for(const b of candidates)if(a.every((v,i)=>v+b[i]<=inventory[i]))best=Math.min(best,c.count(a)+c.count(b));
  const cfg=config({buyIn:target*100,pointValue:100,players:2,automatic:false,small:100,big:100,mode:'minimum',inventory});
  if(best===Infinity)assert.throws(()=>c.calculate(cfg));else{const r=c.calculate(cfg);invariants(r);assert.equal(r.stacks.reduce((n,row)=>n+c.count(row),0),best);}
 }
});
test('automatic alternatives are exact across buy-ins, players and stack sizes; manual remains available',()=>{for(const buyIn of [20000,500000])for(const players of [2,10])for(const bb of [50,100]){const options=c.recommend(config({buyIn,players,bb}));assert.ok(options.length>=1&&options.length<=3);for(const a of options){invariants(a.result);const b=c.blinds(a.result.config);assert.ok(c.canPay(b.small/a.result.config.pointValue,a.result.config.inventory));assert.ok(c.canPay(b.big/a.result.config.pointValue,a.result.config.inventory));}}assert.equal(c.recommend(config({equivalence:'manual'}))[0].result.config.pointValue,1000);assert.ok(c.recommend(config({automatic:false,big:5000}))[0].result.warnings.some(w=>w.includes('100bb')));});

test('only two scales in every entry point; 30k/50bb works and 30k/100bb explains incompatibility',()=>{
 for(const pointValue of [60,150,300,500]){assert.throws(()=>c.calculate(config({pointValue})),/Solo/);assert.throws(()=>c.recommend(config({equivalence:'manual',pointValue})),/Solo/);assert.throws(()=>c.validateState({config:config({pointValue}),session:null}));}
 for(const players of [2,6,10]){const options=c.recommend(config({buyIn:30000,players}));for(const x of options){invariants(x.result);assert.equal(x.result.config.pointValue,100);assert.equal(5*x.result.config.pointValue,500);}}
 assert.throws(()=>c.recommend(config({buyIn:30000,bb:100})),/150.*200.*400.*75bb/);
 const manual=c.recommend(config({buyIn:30000,bb:100,automatic:false,small:200,big:400,equivalence:'manual',pointValue:100}))[0].result;invariants(manual);assert.ok(manual.warnings.some(w=>w.includes('75')));
});
