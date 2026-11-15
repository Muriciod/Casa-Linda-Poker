export const ALLOWED_SCALES = [100, 1000];
export const DENOMS = [1, 5, 25, 100, 500, 1000];
export const INITIAL_INVENTORY = [100, 150, 100, 100, 25, 25];
export type Config = { caseId?: 1 | 2; autoValues?: boolean; chipValues?: number[]; equivalence?: "auto" | "manual"; buyIn: number; players: number; bb: 50 | 100; automatic: boolean; small: number; big: number; pointValue: number; mode: 'minimum' | 'balanced'; inventory: number[] };
export const DEFAULT_CONFIG: Config = { buyIn: 500000, players: 6, bb: 50, automatic: true, small: 5000, big: 10000, pointValue: 1000, mode: 'balanced', inventory: [...INITIAL_INVENTORY] };
export type Result = {config: Config; stacks: number[][]; bank: number[]; warnings: string[]; optimal: boolean; balanced: boolean; reserve: boolean; comfort: number};
export type Change = { denomination: number; given: number[] };
export type Session = {config:Config; stacks:number[][]; changes:Change[]};
export type SavedState = {config:Config; session:Session|null};
export const COLOR_VALUES = [5000,10000,20000,50000,100000];
export const COLOR_CONFIG:Config = {...DEFAULT_CONFIG,caseId:2,chipValues:[...COLOR_VALUES],inventory:[0,0,0,0,0],pointValue:1,equivalence:'manual'};
export const caseId=(c:Config)=>c.caseId??1;
const gcd=(a:number,b:number):number=>b?gcd(b,a%b):a;
export function validValues(v:unknown):v is number[]{return Array.isArray(v)&&v.length===5&&v.every((x,i)=>Number.isSafeInteger(x)&&x>0&&(i===0||x>v[i-1]));}
export function chipValues(c:Config):number[]{return c.caseId===2?c.chipValues??COLOR_VALUES:DENOMS.map(d=>d*c.pointValue);}
export function monetaryValue(row:number[],c:Config):number{return row.reduce((s,n,i)=>s+n*chipValues(c)[i],0);}

function createEngine(DENOMS:number[],unit?:number){
 const chain=DENOMS.every((d,i)=>i===0||d%DENOMS[i-1]===0);
 const factor=(c:Config)=>c.caseId===2?unit!:c.pointValue;

const count = (a: number[]) => a.reduce((s, x) => s + x, 0);
const value = (a: number[]) => a.reduce((s, x, i) => s + x * DENOMS[i], 0);
const subtract = (a: number[], b: number[]) => a.map((x, i) => x - b[i]);
const add = (a: number[], b: number[]) => a.map((x, i) => x + b[i]);
// Standalone physical-chip arithmetic. No game, profile or statistics dependencies.
const integer = (n: unknown) => typeof n === 'number' && Number.isSafeInteger(n);
function validCounts(a: unknown): a is number[] { return Array.isArray(a) && a.length === DENOMS.length && a.every(x => integer(x) && x >= 0 && x <= 1000); }
function validateConfig(c: Config): string[] {
  if(c?.caseId!==undefined&&c.caseId!==1&&c.caseId!==2)return ['Maletín no válido.'];
  if(c?.caseId===2&&(!validValues(c.chipValues)||c.pointValue!==1))return ['Los cinco valores deben ser guaraníes enteros positivos, distintos y en orden ascendente.'];
  if (!c || !validCounts(c.inventory) || !integer(c.buyIn) || c.buyIn <= 0 || !integer(factor(c)) || factor(c) <= 0 || !integer(c.players) || c.players < 2 || c.players > 10 || ![50,100].includes(c.bb) || !['minimum','balanced'].includes(c.mode) || typeof c.automatic !== 'boolean' || (!c.automatic && (!integer(c.small) || !integer(c.big) || c.small <= 0 || c.big <= 0))) return ['Revisá los valores: montos enteros positivos, 2–10 jugadores y hasta 1.000 fichas por denominación.'];
  if (![c.buyIn*c.players, value(c.inventory)*factor(c)].every(Number.isSafeInteger)) return ['Los montos superan el rango de cálculo exacto. Reducí la equivalencia o el buy-in.'];
  return [];
}
function blinds(c: Config) { return {small: c.automatic ? c.buyIn/(c.bb*2) : c.small, big: c.automatic ? c.buyIn/c.bb : c.big}; }
function incompatibleBlinds(c:Config):string {
  if(c.caseId===2){const b=blinds(c);const d=DENOMS.find((_,i)=>c.inventory[i]>0);let suggestion='Completá el inventario o modificá los valores de las fichas.';
    if(d){const unit=d*factor(c);const sb=Math.max(unit,Math.round(b.small/unit)*unit),bb=sb*2;
      if(bb<=c.buyIn&&canPay(sb/factor(c),c.inventory)&&canPay(bb/factor(c),c.inventory))suggestion=`Alternativa manual: SB ${sb.toLocaleString('es-PY')} Gs. / BB ${bb.toLocaleString('es-PY')} Gs. (${(c.buyIn/bb).toLocaleString('es-PY',{maximumFractionDigits:4})}bb reales). Para conservar ${c.bb}bb, podés usar un buy-in de ${(bb*c.bb).toLocaleString('es-PY')} Gs. Verificá después que alcance el inventario.`;
    }return `Las ciegas ${b.small.toLocaleString('es-PY')} / ${b.big.toLocaleString('es-PY')} Gs. o el buy-in no son compatibles con los valores y existencias del Maletín 2. ${suggestion} No se modificó ningún valor automáticamente.`;
  }
  const b=blinds(c);
  const denomination=DENOMS.find((_,i)=>c.inventory[i]>0);
  let suggestion='Revisá el inventario o modificá el buy-in.';
  if(denomination){
    const unit=denomination*100;
    const sb=Math.max(unit,Math.round(b.small/unit)*unit),bb=sb*2;
    if(bb<=c.buyIn&&canPay(sb/100,c.inventory)&&canPay(bb/100,c.inventory))suggestion=`Alternativa con escala baja: SB ${sb.toLocaleString('es-PY')} Gs. / BB ${bb.toLocaleString('es-PY')} Gs.; el stack sería ${(c.buyIn/bb).toLocaleString('es-PY',{maximumFractionDigits:4})}bb. Podés ingresar estas ciegas en Opciones avanzadas; no se aplican automáticamente.`;
  }
  return `El buy-in o las ciegas (${b.small.toLocaleString('es-PY')} / ${b.big.toLocaleString('es-PY')} Gs.) no son compatibles con la equivalencia seleccionada. Solo usamos ×100 y ×1.000; la ficha mínima vale 100 Gs. No es posible mantener todas las condiciones actuales. ${suggestion}`;
}

// Bounded change enumeration with pruning, not greedy. All returned vectors are exact.
function patterns(target: number, stock: number[], cap: number, tick: () => void): number[][] {
  const out: number[][] = [], row = DENOMS.map(()=>0);
  const capacity = stock.map((_,i) => value(stock.map((x,j)=>j<=i?x:0)));
  function walk(i: number, left: number, used: number) {
    tick(); if(left<0 || used>cap || (i>=0 && left>capacity[i]))return;
    if(left===0){out.push([...row]);return;}
    if(i<0 || used+Math.ceil(left/DENOMS[i])>cap)return;
    if(i===0){if(Number.isInteger(left/DENOMS[0]) && left/DENOMS[0]<=stock[0] && used+left/DENOMS[0]<=cap){row[0]=left/DENOMS[0];out.push([...row]);row[0]=0;}return;}
    for(let n=Math.min(stock[i],Math.floor(left/DENOMS[i]),cap-used);n>=0;n--){row[i]=n;walk(i-1,left-n*DENOMS[i],used+n);}row[i]=0;
  }
  walk(DENOMS.length-1,target,0); return out;
}
const rank = (a: number[],b: number[]) => count(a)-count(b) || a[0]-b[0] || a[1]-b[1] || a[2]-b[2] || a[3]-b[3];
function canPay(target: number, stock: number[]) {
  if(!integer(target) || target<0 || target>value(stock))return false;
  if(!chain){const seen=new Set<string>();let visits=0;function find(i:number,left:number):boolean{if(++visits>2000000)throw Error('La búsqueda de pago exacto alcanzó su límite. Ajustá los valores o el inventario.');if(left===0)return true;if(i<0)return false;const key=i+':'+left;if(seen.has(key))return false;for(let n=Math.min(stock[i],Math.floor(left/DENOMS[i]));n>=0;n--)if(find(i-1,left-n*DENOMS[i]))return true;seen.add(key);return false;}return find(DENOMS.length-1,target);}
  // Divisibility chain allows exact feasibility greedily; optimization uses enumeration above.
  for(let i=DENOMS.length-1;i>=0;i--)target-=Math.min(stock[i],Math.floor(target/DENOMS[i]))*DENOMS[i];
  return target===0;
}
function canFundPayments(row:number[], payments:number[]):boolean {
  if(payments.reduce((s,n)=>s+n,0)>value(row)||payments.some(n=>!canPay(n,row)))return false;
  // Fast constructive proof for the common case; retain exhaustive fallback.
  const remaining=[...row];let paid=true;
  for(const amount of [...payments].sort((a,b)=>b-a)){let left=amount;for(let i=DENOMS.length-1;i>=0;i--){const n=Math.min(remaining[i],Math.floor(left/DENOMS[i]));remaining[i]-=n;left-=n*DENOMS[i];}if(left){paid=false;break;}}
  if(paid)return true;
  const failed=new Set<string>();
  function visit(stock:number[], index:number):boolean{
    if(index===payments.length)return true;
    const key=index+':'+stock.join(',');if(failed.has(key))return false;
    const options=patterns(payments[index],stock,count(stock),()=>{}).sort(rank);
    for(const payment of options)if(visit(subtract(stock,payment),index+1))return true;
    failed.add(key);return false;
  }
  return visit(row,0);
}
function readyForBlinds(row:number[],small:number,big:number){return canFundPayments(row,[small,big]);}
// Prefer exact BB multiples, otherwise a nearby betting chip; never call it a BB.
function bettingDenomination(big:number):number {
  const options=DENOMS.map((d,i)=>({d,i})).filter(x=>x.d>=big/2&&x.d<=big*4&&x.d>1);
  options.sort((a,b)=>Number(b.d%big===0)-Number(a.d%big===0)||Math.abs(Math.log(a.d/big))-Math.abs(Math.log(b.d/big)));
  return options[0]?.i??-1;
}
function openingPayments(small:number,big:number,level:number):number[]{return level>0?[small,big]:[];}
function bettingReady(row:number[],small:number,big:number,level:number):boolean {
  const remaining=[...row],i=bettingDenomination(big),qty=Math.max(0,level-1);
  if(qty){if(i<0||remaining[i]<qty)return false;remaining[i]-=qty;}
  return canFundPayments(remaining,openingPayments(small,big,level));
}
// Bounded dynamic programming seed; binary bundles keep the cost proportional to
// target × log(inventory). Immutable links reconstruct exact physical quantities.
function minimumStack(target:number,stock:number[]):number[]|null{
  if(target>100000){let steps=0;try{return patterns(target,stock,count(stock),()=>{if(++steps>200000)throw Error();}).sort(rank)[0]??null;}catch{return null;}}
  const dp=new Array<{cost:number;row:number[]} | undefined>(target+1);dp[0]={cost:0,row:DENOMS.map(()=>0)};
  for(let i=DENOMS.length-1;i>=0;i--){let left=Math.min(stock[i],Math.floor(target/DENOMS[i]));for(let bundle=1;left>0;bundle*=2){const n=Math.min(bundle,left),amount=n*DENOMS[i];left-=n;for(let v=target;v>=amount;v--){const prev=dp[v-amount];if(prev&&(!dp[v]||prev.cost+n<dp[v]!.cost)){const row=[...prev.row];row[i]+=n;dp[v]={cost:prev.cost+n,row};}}}}
  return dp[target]?.row??null;
}
function seedAllocation(target:number,stock:number[],players:number,payments:number[]):number[][]|null{
  // First try identical allocations using each player's fair share of inventory.
  function take(pool:number[],n:number){const rows=Array.from({length:n},()=>DENOMS.map(()=>0));let bank=[...pool];
    for(const payment of payments)for(let i=0;i<n;i++){const r=minimumStack(payment,bank);if(!r)return null;rows[i]=add(rows[i],r);bank=subtract(bank,r);}
    for(let i=0;i<n;i++){const r=minimumStack(target-value(rows[i]),bank);if(!r)return null;rows[i]=add(rows[i],r);bank=subtract(bank,r);}return rows;
  }
  const equal=take(stock.map(n=>Math.floor(n/players)),1);if(equal)return Array.from({length:players},()=>[...equal[0]]);
  return take(stock,players);
}
function calculate(c: Config): Result {
  if(c.caseId!==2&&!ALLOWED_SCALES.includes(c.pointValue))throw Error("Solo se permiten las escalas ×100 y ×1.000.");
  const issues=validateConfig(c);if(issues.length)throw Error(issues[0]);
  if(c.caseId===2&&!count(c.inventory))throw Error('Completá el inventario del Maletín 2 antes de calcular. No se han asignado cantidades.');
  const {small,big}=blinds(c), target=c.buyIn/factor(c);
  if(!integer(small)||!integer(big))throw Error('Las ciegas automáticas no son guaraníes enteros. Ajustá el buy-in o usá ciegas manuales.');
  if(small>big || big>c.buyIn)throw Error('La SB debe ser menor o igual a la BB, y la BB no puede superar el stack.');
  if(!integer(target)||!integer(small/factor(c))||!integer(big/factor(c))) {
    throw Error(incompatibleBlinds(c));
  }
  const sb=small/factor(c), bb=big/factor(c);
  if(!canPay(sb,c.inventory)||!canPay(bb,c.inventory))throw Error(c.caseId===2?incompatibleBlinds(c):'El inventario no permite pagar exactamente las ciegas. Agregá denominaciones pequeñas o ajustá las ciegas.');
  if(value(c.inventory)<target*c.players)throw Error('Inventario insuficiente para cubrir el buy-in de todos los jugadores.');
  const intermediate=bettingDenomination(bb);
  const weight=count(c.inventory)+1;
  const rowCost=(row:number[])=>c.mode==='minimum'?count(row):row.reduce((n,q,i)=>n+(DENOMS[i]<bb/2?q:0),0)*weight+count(row);
  let steps=0, interrupted=false;
  const tick=()=>{if(++steps>2000000){interrupted=true;throw Error('La búsqueda alcanzó su límite. Ajustá el buy-in o el inventario para poder verificar el reparto.');}};
  function solve(pool: number[], cap: number, comfort: number): {stacks:number[][]; optimal:boolean}|null {
    let choices: number[][];
    try{choices=patterns(target,pool,cap,tick).filter(row=>bettingReady(row,sb,bb,comfort)).sort((a,b)=>rowCost(a)-rowCost(b)||rank(a,b));}catch(e){if(interrupted)throw Error('La búsqueda es demasiado amplia para verificar un reparto. Reducí las cantidades del inventario o ajustá el buy-in.');throw e;}
    if(!choices.length)return null;
    let best:number[][]|null=null, cost=Infinity;
    // An equal allocation is the preferred tie-breaker and a useful proven upper bound.
    for(const row of choices)if(row.every((x,i)=>x*c.players<=pool[i])){best=Array.from({length:c.players},()=>[...row]);cost=rowCost(row)*c.players;break;}
    if(cost===rowCost(choices[0])*c.players)return {stacks:best!,optimal:true};
    const seen=new Map<string,number>();
    function pack(left:number,stock:number[],start:number,total:number,rows:number[][]){
      tick();if(!left){if(total<cost){best=rows.map(r=>[...r]);cost=total;}return;}
      if(value(stock)<left*target)return;
      const key=left+':'+start+':'+stock.join(',');if((seen.get(key)??Infinity)<=total)return;seen.set(key,total);
      for(let k=start;k<choices.length;k++){tick();const row=choices[k], next=total+rowCost(row);if(total+rowCost(row)*left>=cost)break;if(row.some((n,i)=>n>stock[i]))continue;pack(left-1,subtract(stock,row),k,next,[...rows,row]);}
    }
    try{pack(c.players,pool,0,0,[]);}catch(e){if(!interrupted)throw e;if(!best)throw Error('No se pudo completar la búsqueda con este inventario. Ajustá el buy-in o las cantidades; no se confirmó que el reparto sea imposible.');}
    return best ? {stacks:best,optimal:!interrupted}:null;
  }
  const levels=c.mode==='balanced'?[3,2,1,0]:[0];
  for(const comfort of levels){
    const payments=openingPayments(sb,bb,comfort);
    if(comfort>1){if(intermediate<0||c.inventory[intermediate]<(comfort-1)*c.players)continue;payments.push(...Array(comfort-1).fill(DENOMS[intermediate]));}
    // Necessary global small-chip value bounds reject impossible comfort tiers cheaply.
    if(payments.reduce((s,n)=>s+n,0)>target)continue;
    if(chain&&DENOMS.slice(1).some((next,i)=>(()=>{const needed=payments.reduce((s,n)=>s+n%next,0);return (needed+((target-needed)%next+next)%next)*c.players>value(c.inventory.map((n,j)=>j<=i?n:0));})()))continue;
    const maxPerPlayer=Math.min(target,count(c.inventory)-c.players+1);
    const seeded=seedAllocation(target,c.inventory,c.players,payments);
    const seed=seeded?.every(row=>bettingReady(row,sb,bb,comfort))?seeded:null;
    let selected:{stacks:number[][];optimal:boolean}|null=null;
    let keptReserve=false;
    // Balanced search considers the physical inventory bound and minimizes tiny chips
    // before total count. Minimum mode deepens only until its first exact solution.
    for(let cap=c.mode==='minimum'?Math.min(14,maxPerPlayer):maxPerPlayer;cap<=maxPerPlayer;cap++){
      try{selected=solve(c.inventory,cap,comfort);}catch(e){if(!interrupted||!seed)throw e;selected={stacks:seed,optimal:false};}

      if(!selected)continue;
      const remaining=selected.stacks.reduce((stock,row)=>subtract(stock,row),[...c.inventory]);
      keptReserve=readyForBlinds(remaining,sb,bb);

      break;
    }
    if(!selected)continue;
    const solved=selected;
    const bank=solved.stacks.reduce((stock,row)=>subtract(stock,row),[...c.inventory]);
    const warnings:string[]=[];
    if(!c.automatic && c.buyIn!==big*c.bb)warnings.push(`Las ciegas manuales dan un stack de ${(c.buyIn/big).toLocaleString('es-PY',{maximumFractionDigits:4})}bb, distinto de ${c.bb}bb.`);
    if(c.mode==='balanced'&&comfort===0)warnings.push('El inventario no permite entregar a todos fichas para pagar SB y BB sin cambio. Usá el banco durante la partida.');
    if(!canPay(sb,bank)||!canPay(bb,bank))warnings.push('El banco no conserva cambio suficiente para las ciegas. Revisá el reparto antes de confirmarlo.');
    if(!solved.optimal)warnings.push('Reparto exacto y válido; se alcanzó el límite de búsqueda y no se pudo certificar el mínimo global.');
    return {config:structuredClone(c),stacks:solved.stacks,bank,warnings,optimal:solved.optimal,balanced:comfort>0,reserve:keptReserve,comfort};
  }
  throw Error('No existe un reparto exacto para todos los jugadores con el inventario disponible.');
}
function changeOptions(bank:number[], denomination:number): number[][] {
  if(!validCounts(bank)||!integer(denomination)||denomination<1||denomination>=DENOMS.length)return [];
  let steps=0;const options=patterns(DENOMS[denomination],bank.map((x,i)=>i<denomination?x:0),1000,()=>{if(++steps>2000000)throw Error('Demasiadas combinaciones de cambio.');}).sort(rank);
  // Minimum combination plus single-denomination alternatives, then diverse next best.
  const single=options.filter(r=>r.filter(Boolean).length===1);
  return [...new Map([...options.slice(0,1),...single,...options.slice(1,8)].map(r=>[r.join(','),r])).values()].slice(0,8);
}
function applyChange(bank:number[], change:Change): number[] {
  const i=change?.denomination,g=change?.given;
  if(!integer(i)||i<1||i>=DENOMS.length||!validCounts(g)||g.some((n,j)=>n>bank[j]||(j>=i&&n>0))||value(g)!==DENOMS[i])throw Error('Cambio no válido o sin existencias suficientes.');
  const next=subtract(bank,g);next[i]++;if(!validCounts(next))throw Error('El banco supera el límite de inventario.');return next;
}
function sessionBank(s: Session): number[] {
  if(!s||validateConfig(s.config).length||!Array.isArray(s.stacks)||s.stacks.length!==s.config.players||s.stacks.some(r=>!validCounts(r)||value(r)*factor(s.config)!==s.config.buyIn)||!Array.isArray(s.changes)||s.changes.length>500)throw Error('Reparto confirmado no válido.');
  let bank=s.stacks.reduce((a,r)=>subtract(a,r),[...s.config.inventory]);if(bank.some(x=>x<0))throw Error('El reparto excede el inventario.');
  for(const change of s.changes){if(!change || !Number.isInteger(change.denomination) || (s.config.inventory[change.denomination]??0)-bank[change.denomination]<1)throw Error("La ficha recibida no está en circulación.");bank=applyChange(bank,change);}return bank;
}
function validateState(state:SavedState) {if(!state||validateConfig(state.config).length||(state.config.caseId!==2&&!ALLOWED_SCALES.includes(state.config.pointValue)))throw Error('Configuración no válida.');if(state.session!==null){if(caseId(state.session.config)!==caseId(state.config))throw Error('El banco pertenece a otro maletín.');engine(state.session.config).sessionBank(state.session);};return state;}

function recommend(input:Config & {equivalence?:'auto'|'manual'}): {label:string;reason:string;result:Result}[] {
  if(input.caseId===2){const recommended=calculate({...input,mode:input.mode});const out=[{label:input.mode==='minimum'?'Menos fichas':'Recomendada',reason:'Valores personalizados; ciegas exactas y existencias del Maletín 2.',result:recommended}];if(input.mode!=='minimum'){try{const r=calculate({...input,mode:'minimum'});if(JSON.stringify(r.stacks)!==JSON.stringify(recommended.stacks))out.push({label:'Menos fichas',reason:'Alternativa compacta; puede requerir cambios.',result:r});}catch{/* Keep verified recommendation. */}}return out;}
  const b=blinds(input);
  if(!Number.isSafeInteger(b.small)||!Number.isSafeInteger(b.big)||b.small<=0||b.big<=0)throw Error('Las ciegas deben ser guaraníes enteros positivos. Ajustá el buy-in o las opciones avanzadas.');
  if(input.equivalence==='manual')return [{label:input.pointValue===100?'Escala baja':'Escala alta',reason:'Escala seleccionada manualmente, validada contra el inventario.',result:calculate(input)}];
  const candidates=ALLOWED_SCALES;
  if(!candidates.some(scale=>[input.buyIn,b.small,b.big].every(n=>n%scale===0)))throw Error(incompatibleBlinds(input));
  const results:Result[]=[];let incomplete=false;
  for(const pointValue of candidates)for(const mode of ['balanced','minimum'] as const){try{results.push(calculate({...input,pointValue,mode}));}catch(e){if(/búsqueda/.test(String(e)))incomplete=true;}}
  if(!results.length)throw Error(incomplete?'No se pudo completar la búsqueda. Probá una equivalencia manual.':'No hay repartos viables entre las equivalencias evaluadas. Revisá el inventario o probá el modo manual.');
  const total=(r:Result)=>r.stacks.reduce((s,row)=>s+count(row),0);
  const liquidity=(r:Result)=>r.bank.reduce((s,n,i)=>s+(DENOMS[i]*r.config.pointValue<=b.big?n:0),0);
  const equal=(r:Result)=>r.stacks.every(row=>row.join()===r.stacks[0].join())?0:1;
  const tiny=(r:Result)=>r.stacks.reduce((sum,row)=>sum+row.reduce((n,q,i)=>n+(DENOMS[i]*r.config.pointValue<b.big/2?q:0),0),0);
  const recommended=[...results].sort((a,b)=>b.comfort-a.comfort||tiny(a)-tiny(b)||total(a)-total(b)||Number(b.reserve)-Number(a.reserve)||equal(a)-equal(b)||liquidity(b)-liquidity(a))[0];
  const minimum=[...results].sort((a,b)=>total(a)-total(b)||equal(a)-equal(b))[0];
  const change=[...results].sort((a,b)=>b.comfort-a.comfort||liquidity(b)-liquidity(a)||total(a)-total(b))[0];
  const seen=new Set<string>();
  return [{label:'Recomendada',reason:'Cubre SB y BB, reserva fichas intermedias para apostar y reduce las fichas pequeñas.',result:recommended},{label:'Menos fichas',reason:'La menor cantidad física entre las configuraciones evaluadas; puede requerir cambios.',result:minimum},{label:'Más cambio',reason:'Prioriza fichas del banco con valor menor o igual a la BB.',result:change}].filter(x=>{const key=x.result.config.pointValue+JSON.stringify(x.result.stacks);if(seen.has(key))return false;seen.add(key);if(incomplete)x.result.warnings.push('Algunas búsquedas alcanzaron su límite; se comparan las soluciones verificadas.');return true;});
}
return {validCounts,validateConfig,blinds,incompatibleBlinds,canPay,canFundPayments,bettingDenomination,openingPayments,bettingReady,calculate,changeOptions,applyChange,sessionBank,validateState,recommend,count,value,subtract,add};
}
const base=createEngine(DENOMS);
function engine(c?:Config){if(c?.caseId!==2)return base;const values=validValues(c.chipValues)?c.chipValues:COLOR_VALUES;const unit=values.reduce(gcd);return createEngine(values.map(v=>v/unit),unit);}
export const {count,value,subtract,add,validCounts,canPay,canFundPayments,bettingDenomination,openingPayments,bettingReady}=base;
export const blinds=base.blinds;
export const validateConfig=(c:Config)=>engine(c).validateConfig(c);
export const incompatibleBlinds=(c:Config)=>engine(c).incompatibleBlinds(c);
export const calculate=(c:Config)=>engine(c).calculate(c);
export function recommend(c:Config){
 if(c.caseId!==2||c.autoValues===false)return engine(c).recommend(c);
 const issues=validateConfig(c);if(issues.length)throw Error(issues[0]);
 if(!count(c.inventory))throw Error('Completá el inventario del Maletín 2 antes de calcular.');
 const {small,big}=blinds(c);if(!Number.isSafeInteger(small)||!Number.isSafeInteger(big))throw Error('Las ciegas deben ser guaraníes enteros. Ajustá el buy-in o las ciegas.');
 const results:Result[]=[];let limited=false;
 for(const divisor of [1,2,5])for(const ratios of [[1,2,4,10,20],[1,2,5,10,25]]){
  const chipValues=ratios.map(n=>n*small/divisor);if(!validValues(chipValues))continue;
  try{results.push(calculate({...c,chipValues,pointValue:1,mode:'balanced'}));}catch(e){if(/búsqueda/.test(String(e)))limited=true;}
 }
 if(!results.length)throw Error(limited?'No se completó la búsqueda. Probá valores manuales.':'No se encontró un reparto exacto con los valores automáticos evaluados. Revisá el inventario o definí valores manuales.');
 const tiny=(r:Result)=>r.stacks.reduce((s,row)=>s+row.reduce((n,q,i)=>n+(chipValues(r.config)[i]<big/2?q:0),0),0);
 results.sort((a,b)=>b.comfort-a.comfort||tiny(a)-tiny(b)||count(a.stacks.flat())-count(b.stacks.flat())||Number(b.reserve)-Number(a.reserve));
 const result=results[0];if(limited)result.warnings.push('Se compararon las soluciones verificadas; algunas búsquedas alcanzaron su límite.');
 return [{label:'Recomendada',reason:'Valores calculados según buy-in, ciegas, jugadores e inventario. Prioriza apuestas cómodas y pocas fichas pequeñas.',result}];
}
export const changeOptions=(bank:number[],denomination:number,c?:Config)=>engine(c).changeOptions(bank,denomination);
export const applyChange=(bank:number[],change:Change,c?:Config)=>engine(c).applyChange(bank,change);
export const sessionBank=(s:Session)=>engine(s?.config).sessionBank(s);
export const validateState=(s:SavedState)=>engine(s?.config).validateState(s);
