import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';
const source=readFileSync(new URL('../lib/chip-calculator.ts',import.meta.url),'utf8');
const c=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'));
const config=(extra={})=>({...structuredClone(c.COLOR_CONFIG),autoValues:false,inventory:[100,100,100,100,100],...extra});
function exact(r){assert.equal(r.stacks.length,r.config.players);for(const row of r.stacks)assert.equal(c.monetaryValue(row,r.config),r.config.buyIn);assert.deepEqual(r.bank.map((n,i)=>n+r.stacks.reduce((s,row)=>s+row[i],0)),r.config.inventory);assert.ok(r.bank.every(n=>n>=0));}
function payable(row,values,target){if(target===0)return true;const i=values.length-1;if(i<0)return false;for(let n=0;n<=row[i]&&n*values[i]<=target;n++)if(payable(row.slice(0,i),values.slice(0,i),target-n*values[i]))return true;return false;}
test('color case starts empty, correct values, strict positive ascending custom values',()=>{
 assert.deepEqual(c.COLOR_CONFIG.inventory,[0,0,0,0,0]);assert.deepEqual(c.COLOR_VALUES,[5000,10000,20000,50000,100000]);assert.throws(()=>c.calculate(c.COLOR_CONFIG),/Completá el inventario/);
 for(const values of [[0,2,3,4,5],[1,1,2,3,4],[2,1,3,4,5],[1.5,2,3,4,5],[1,2,3,4],[-1,2,3,4,5]])assert.ok(c.validateConfig(config({chipValues:values})).length);
 assert.deepEqual(c.validateConfig(config({chipValues:[1000,2000,5000,10000,20000]})),[]);
 assert.throws(()=>c.calculate({...c.DEFAULT_CONFIG,pointValue:1}),/escalas/);
});
test('both stack modes, 2–10 players, repeatable BBs and shared SB change with default/custom values',()=>{
 for(const chipValues of [c.COLOR_VALUES,[1000,2000,5000,10000,20000]])for(const bb of [50,100])for(let players=2;players<=10;players++){
  const r=c.recommend(config({chipValues,bb,players,buyIn:chipValues[0]*bb*2}))[0].result;exact(r);assert.equal(r.comfort,3);const b=c.blinds(r.config);
  for(const row of r.stacks){assert.ok(payable(row,chipValues,b.small)||payable(r.bank,chipValues,b.big-b.small));assert.ok(payable(row,chipValues,b.big));assert.ok(row[0]<=2);assert.ok(row[1]>=2);}
 }
});
test('incompatible blinds and inventory are explained without altering denominations',()=>{
 const input=config({buyIn:500000,bb:100});const before=structuredClone(input);assert.throws(()=>c.calculate(input),/2.500.*5.000.*10.000.*50bb/);assert.deepEqual(input,before);
 assert.throws(()=>c.calculate(config({inventory:[1,0,0,0,0]})),/compatibles|insuficiente/);
});
test('non-divisible personalized denominations use exact bounded change instead of greedy assumptions',()=>{
 const input=config({chipValues:[300,400,700,1100,1500],buyIn:4000,automatic:false,small:600,big:800,players:2,mode:'minimum',inventory:[20,20,20,20,20]});
 exact(c.calculate(input));const options=c.changeOptions([0,0,0,3,0],4,input);assert.deepEqual(options,[]);
 const arbitrary=config({chipValues:[300,400,600,1100,1500]});assert.ok(c.changeOptions([2,2,0,0,0],2,arbitrary).some(r=>r.join()==='2,0,0,0,0'));
 const gcdNotSmallest=config({chipValues:[300,500,700,1100,1500],automatic:false,small:600,big:1000,buyIn:4000,players:2});exact(c.calculate(gcdNotSmallest));
});
test('bank changes preserve value, stock and historical denomination snapshot',()=>{
 const input=config({players:2,mode:'minimum'}),r=c.calculate(input);const session={config:input,stacks:r.stacks,changes:[]};
 const before=c.sessionBank(session),options=c.changeOptions(before,4,input);assert.ok(options.some(r=>r.join()==='0,0,0,2,0'));
 const change={denomination:4,given:[0,0,0,2,0]};session.changes.push(change);const after=c.sessionBank(session);assert.equal(c.monetaryValue(before,input),c.monetaryValue(after,input));assert.equal(after[4],before[4]+1);assert.equal(after[3],before[3]-2);
 const state={config:{...input,chipValues:[1000,2000,5000,10000,20000]},session};assert.doesNotThrow(()=>c.validateState(state));assert.deepEqual(c.sessionBank(state.session),after);
 assert.throws(()=>c.applyChange(before,{denomination:4,given:[0,0,0,1,0]},input));
 assert.throws(()=>c.validateState({config:c.DEFAULT_CONFIG,session}));
});
test('unequal custom stacks conserve totals; more than 14 remains allowed',()=>{
 const input=config({chipValues:[100,200,300,400,500],buyIn:400,players:2,automatic:false,small:200,big:200,mode:'minimum',inventory:[0,2,0,1,0]});const r=c.calculate(input);exact(r);assert.notDeepEqual(r.stacks[0],r.stacks[1]);
 const many=c.calculate(config({buyIn:2000,players:2,automatic:false,small:100,big:200,chipValues:[100,3000,4000,5000,6000],inventory:[40,0,0,0,0]}));exact(many);assert.equal(c.count(many.stacks[0]),20);
});
test('custom minimum allocation agrees with independent exhaustive oracle for non-divisible values',()=>{
 const vals=[300,400,600,900,1100],stock=[3,3,2,1,1],vectors=[];
 function enumerate(i,row){if(i===5){vectors.push(row);return;}for(let n=0;n<=stock[i];n++)enumerate(i+1,[...row,n]);}enumerate(0,[]);
 for(const target of [600,700,900,1100,1200,1500,1700,2000]){
 const rows=vectors.filter(r=>r.reduce((s,n,i)=>s+n*vals[i],0)===target);let best=Infinity;
 for(const a of rows)for(const b of rows)if(a.every((n,i)=>n+b[i]<=stock[i]))best=Math.min(best,c.count(a)+c.count(b));
 const input=config({chipValues:vals,inventory:stock,buyIn:target,players:2,automatic:false,small:300,big:600,mode:'minimum'});
 if(best===Infinity)assert.throws(()=>c.calculate(input));else {const r=c.calculate(input);exact(r);assert.equal(c.count(r.stacks.flat()),best);}
 }
});

test('automatic color values follow buy-in, both blinds modes and inventory while manual remains fixed',()=>{
 for(const buyIn of [20000,30000,40000,100000,500000])for(const bb of [50,100])for(const players of [2,10]){
 const input=config({buyIn,bb,players,autoValues:true});let r;try{r=c.recommend(input)[0].result;}catch(e){throw Error(`${buyIn}/${bb}/${players}: ${e.message}`);}exact(r);assert.ok(r.config.chipValues.every(v=>{while(v%10===0)v/=10;return [1,2,5].includes(v);}));const b=c.blinds(input);for(const row of r.stacks){assert.ok(payable(row,r.config.chipValues,b.small)||payable(r.bank,r.config.chipValues,b.big-b.small)||r.warnings.some(w=>w.includes('cambio manual')));assert.ok(payable(row,r.config.chipValues,b.big));}assert.deepEqual(input.chipValues,c.COLOR_VALUES);
 }
 assert.notDeepEqual(c.recommend(config({buyIn:20000,autoValues:true}))[0].result.config.chipValues,c.COLOR_VALUES);
 assert.throws(()=>c.recommend(config({buyIn:20000,autoValues:false})),/compatibles/);
});

test('40k eight-player regression excludes 400/800/1600/4000/8000 chip values',()=>{const r=c.recommend(config({buyIn:40000,players:8,autoValues:true}))[0].result;exact(r);assert.ok(r.config.chipValues.every(v=>![400,800,1600,4000,8000].includes(v)));assert.equal(c.blinds(r.config).small,400);assert.equal(c.blinds(r.config).big,800);});

test('only practical alternatives, including legacy minimum preferences, preserve exact stock and playable stacks',()=>{
 const inputs=[
  {...structuredClone(c.DEFAULT_CONFIG),buyIn:80000,players:6,mode:'minimum'},
  {...structuredClone(c.DEFAULT_CONFIG),buyIn:20000,players:10,equivalence:'manual',pointValue:100,mode:'minimum'},
  config({buyIn:1000000,players:8,autoValues:false,mode:'minimum'}),
  config({buyIn:40000,players:8,autoValues:true,mode:'minimum'})
 ];
 for(const input of inputs){const before=structuredClone(input);const options=c.recommend(input);assert.deepEqual(options.map(x=>x.label),['Recomendada','Más cambio']);assert.deepEqual(input,before);
  for(const {result:r} of options){exact(r);assert.equal(r.config.mode,'balanced');assert.ok(r.comfort>0);const values=c.chipValues(r.config),b=c.blinds(r.config);for(const row of r.stacks){assert.ok(row.reduce((a,b)=>a+b,0)>1);assert.ok(payable(row,values,b.small)||payable(r.bank,values,b.big-b.small)||r.warnings.some(w=>w.includes('cambio manual')));assert.ok(payable(row,values,b.big));}}
  assert.ok(options[1].result.comfort>=options[0].result.comfort);
 }
});
test('more change increases useful intermediate chips without changing the scale or excessive whites',()=>{
 const options=c.recommend(config({buyIn:500000,players:6,autoValues:false}));const a=options[0].result,b=options[1].result;
 assert.deepEqual(c.chipValues(a.config),c.chipValues(b.config));assert.notDeepEqual(a.stacks,b.stacks);
 const intermediate=c.chipValues(a.config).indexOf(c.blinds(a.config).big);assert.ok(intermediate>=0);
 for(let i=0;i<a.stacks.length;i++){assert.ok(b.stacks[i][intermediate]>a.stacks[i][intermediate]);assert.ok(b.stacks[i][0]<=2);}
});

test('casino-style stacks cover exact opening bets and spread change and capital across denominations',()=>{
 const examples=[
  {buyIn:500000,small:5000,big:10000,chipValues:[5000,10000,20000,50000,100000]},
  {buyIn:1000000,small:5000,big:10000,chipValues:[5000,10000,50000,100000,500000]},
  {buyIn:500000,small:10000,big:20000,chipValues:[5000,10000,20000,50000,100000]},
 ];
 for(const input of examples){
  const cfg=config({...input,automatic:false,players:6,inventory:[80,80,80,80,80]});
  const options=c.recommend(cfg);assert.deepEqual(options.map(x=>x.label),['Recomendada','Más cambio']);
  const bbIndex=input.chipValues.indexOf(input.big),changeIndex=input.chipValues.indexOf(50000);
  for(const {result} of options){
   exact(result);assert.deepEqual(result.config.chipValues,input.chipValues);assert.ok(result.reserve);
   for(const row of result.stacks){
    assert.ok(row[bbIndex]>=3);assert.ok(row[changeIndex]>=2);
    const sbIndex=input.chipValues.indexOf(input.small);assert.ok(result.bank[sbIndex]>=result.changePayments);
    assert.ok(payable(row,input.chipValues,3*input.big));
    const capital=row.reduce((sum,n,i)=>sum+(input.chipValues[i]>=100000?n*input.chipValues[i]:0),0);
    assert.ok(capital>=input.buyIn*.4);assert.ok(c.count(row)<=24);
   }
  }
  if(input.buyIn===1000000)assert.ok(options[0].result.stacks.every(row=>row[4]===1));
  assert.ok(options[1].result.stacks.reduce((n,row)=>n+row[bbIndex],0)>=options[0].result.stacks.reduce((n,row)=>n+row[bbIndex],0));
 }
});


test('35k at 50/100 puts more 100s in every stack and leaves the 50s for change',()=>{
 const input=config({buyIn:35000,small:50,big:100,automatic:false,players:6,chipValues:[50,100,200,1000,5000],inventory:[80,80,80,80,30]});
 for(const {result:r} of c.recommend(input)){
  exact(r);assert.deepEqual(r.config.chipValues,input.chipValues);assert.ok(r.changePayments>=3);assert.ok(r.bank[0]>=r.changePayments);
  for(const row of r.stacks){assert.ok(row[1]>3);assert.ok(row[0]<2);assert.ok(row[1]>=r.bigBlindPayments);}
 }
});

test('pairs of small chips fund several BBs when the exact denomination is missing',()=>{
 for(const players of [2,6,10]){
  const input=config({buyIn:100,small:1,big:2,automatic:false,players,chipValues:[1,2,5,10,25],inventory:[players*20,0,players*20,0,0]});
  const missing=c.recommend(input)[0].result;exact(missing);assert.ok(missing.bigBlindPayments>=4);assert.ok(missing.bank[0]>=missing.changePayments);
  assert.ok(missing.stacks.every(row=>row[0]>=2*missing.bigBlindPayments));
  const stocked=c.recommend({...input,inventory:[...input.inventory.slice(0,1),players*20,...input.inventory.slice(2)]})[0].result;
  exact(stocked);assert.ok(stocked.stacks.every((row,i)=>row[1]>=stocked.bigBlindPayments&&row[0]<missing.stacks[i][0]));
 }
 const input=config({buyIn:500000,small:10000,big:20000,automatic:false,players:6,chipValues:[5000,10000,50000,100000,500000],inventory:[80,80,80,0,0]});
 const r=c.recommend(input)[0].result;exact(r);assert.ok(r.bigBlindPayments>=4);
 assert.ok(r.stacks.every(row=>row[1]>=2*r.bigBlindPayments));assert.ok(r.bank[1]+Math.floor(r.bank[0]/2)>=r.changePayments);
});

test('total value cannot masquerade as repeatable disjoint BB payments',()=>{
 const input=config({buyIn:16,small:1,big:6,automatic:false,players:2,chipValues:[2,5,10,20,50],inventory:[6,6,0,0,0]});
 const r=c.calculate(input);exact(r);assert.equal(r.bigBlindPayments,1);assert.equal(r.changePayments,1);assert.equal(r.smallBlindDirect,false);
 assert.ok(r.stacks.every(row=>row[0]===3&&row[1]===2));
 const stock=config({buyIn:10,small:1,big:2,automatic:false,players:2,chipValues:[1,2,5,10,25],inventory:[2,0,4,0,0]});
 const scarce=c.calculate(stock);exact(scarce);assert.equal(scarce.bigBlindPayments,0);assert.ok(scarce.warnings.some(w=>w.includes('poca cobertura')));
});
