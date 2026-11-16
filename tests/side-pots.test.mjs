import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const js=ts.transpileModule(readFileSync(new URL('../lib/side-pots.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {calculatePots,distributePots}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const players=(amounts,folds=[])=>amounts.map((amount,i)=>({id:String(i),name:'Jugador '+i,amount,folded:folds.includes(i)}));
test('multiple all-ins produce exact levels and uncalled return',()=>{
 const r=calculatePots(players([50,100,200,300]));
 assert.deepEqual(r.pots,[{amount:200,eligible:['0','1','2','3']},{amount:150,eligible:['1','2','3']},{amount:200,eligible:['2','3']}]);
 assert.equal(r.refunds['3'],100);
 const a=distributePots(r,[['0'],['1'],['2']]);
 assert.deepEqual(a.rows.map(p=>p.receives),[200,150,200,100]);assert.equal(a.rows.reduce((s,p)=>s+p.net,0),0);
});
test('equal amounts, folded dead money, zero contributions and no commission',()=>{
 const r=calculatePots(players([100,100,100,0],[1]));
 assert.deepEqual(r.pots,[{amount:300,eligible:['0','2']}]);assert.deepEqual(distributePots(r,[['2']]).rows.map(p=>p.receives),[0,0,300,0]);
 assert.throws(()=>distributePots(r,[['1']]));assert.throws(()=>distributePots(r,[['3']]));
});
test('folded intermediate levels combine pots only when eligibility is identical',()=>{
 assert.deepEqual(calculatePots(players([50,100,100],[0])).pots,[{amount:250,eligible:['1','2']}]);
});
test('split pots and odd chips follow clockwise priority independently',()=>{
 const r=calculatePots(players([100,100,100,200,200]),100);
 const a=distributePots(r,[['0','3'],['3','4']],'3');
 assert.deepEqual(a.rows.map(p=>p.receives),[200,0,0,400,100]);
 assert.deepEqual(a.oddChips,[['3'],[]]);
});
test('uncalled amount is returned even without a contested pot',()=>{
 const r=calculatePots(players([100,0]));assert.equal(r.pots.length,0);assert.deepEqual(distributePots(r,[]).rows.map(p=>p.receives),[100,0]);
 const f=calculatePots(players([100,200],[1]));assert.deepEqual(distributePots(f,[['0']]).rows.map(p=>p.receives),[200,100]);
});
test('invalid amounts, unsafe sums, denominations, impossible folded layers and winners reject',()=>{
 for(const amounts of [[-1,2],[1.5,2],[NaN,2],[Infinity,2],[Number.MAX_SAFE_INTEGER,1],[0,0]])assert.throws(()=>calculatePots(players(amounts)));
 assert.throws(()=>calculatePots(players([100,150]),100));
 assert.throws(()=>calculatePots(players([100,100]),0));
 assert.throws(()=>calculatePots(players([50,100,100],[1,2])));
 assert.throws(()=>calculatePots(players([10,10],[0,1])));
 const r=calculatePots(players([100,100]));assert.throws(()=>distributePots(r,[[]]));assert.throws(()=>distributePots(r,[]));assert.throws(()=>distributePots(r,[['0','0']]));assert.throws(()=>distributePots(r,[['0']],'missing'));
});
test('independent unit-by-unit oracle and conservation across varied all-ins and folds',()=>{
 for(let seed=1;seed<=300;seed++){
  const count=2+seed%8, input=players(Array.from({length:count},(_,i)=>1+((seed*(i+3)+i*i)%30)));
  // Ensure a non-folded highest contributor to keep every contested layer awardable.
  const max=Math.max(...input.map(p=>p.amount));
  input.forEach((p,i)=>p.folded=p.amount<max&&(seed+i)%4===0);
  const snapshot=JSON.stringify(input),r=calculatePots(input);
  const winners=r.pots.map((p,i)=>p.eligible.filter((_,j)=>j===0||(j+i+seed)%2===0));
  const actual=distributePots(r,winners).rows;
  assert.equal(actual.reduce((s,p)=>s+p.receives,0),input.reduce((s,p)=>s+p.amount,0));
  for(const p of input){
   let eligibleValue=0,refund=0;
   for(let chip=1;chip<=max;chip++){
    const contributors=input.filter(x=>x.amount>=chip);
    if(contributors.length===1&&contributors[0].id===p.id)refund++;
    else if(contributors.length>1&&!p.folded&&p.amount>=chip)eligibleValue+=contributors.length;
   }
   assert.equal(r.refunds[p.id],refund);
   assert.equal(r.pots.filter(x=>x.eligible.includes(p.id)).reduce((s,x)=>s+x.amount,0),eligibleValue);
  }
  assert.equal(JSON.stringify(input),snapshot);
 }
});
