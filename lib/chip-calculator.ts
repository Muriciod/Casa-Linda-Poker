// Standalone physical-chip arithmetic. No game, profile or statistics dependencies.
export const DENOMS = [1, 5, 25, 100, 500, 1000];
export const INITIAL_INVENTORY = [100, 150, 100, 100, 25, 25];
export type Config = { equivalence?: "auto" | "manual"; buyIn: number; players: number; bb: 50 | 100; automatic: boolean; small: number; big: number; pointValue: number; mode: 'minimum' | 'balanced'; inventory: number[] };
export const DEFAULT_CONFIG: Config = { buyIn: 500000, players: 6, bb: 50, automatic: true, small: 5000, big: 10000, pointValue: 1000, mode: 'balanced', inventory: [...INITIAL_INVENTORY] };
export const count = (a: number[]) => a.reduce((s, x) => s + x, 0);
export const value = (a: number[]) => a.reduce((s, x, i) => s + x * DENOMS[i], 0);
export const subtract = (a: number[], b: number[]) => a.map((x, i) => x - b[i]);
export const add = (a: number[], b: number[]) => a.map((x, i) => x + b[i]);
const integer = (n: unknown) => typeof n === 'number' && Number.isSafeInteger(n);
export function validCounts(a: unknown): a is number[] { return Array.isArray(a) && a.length === 6 && a.every(x => integer(x) && x >= 0 && x <= 1000); }
export function validateConfig(c: Config): string[] {
  if (!c || !validCounts(c.inventory) || !integer(c.buyIn) || c.buyIn <= 0 || !integer(c.pointValue) || c.pointValue <= 0 || !integer(c.players) || c.players < 2 || c.players > 10 || ![50,100].includes(c.bb) || !['minimum','balanced'].includes(c.mode) || typeof c.automatic !== 'boolean' || (!c.automatic && (!integer(c.small) || !integer(c.big) || c.small <= 0 || c.big <= 0))) return ['Revisá los valores: montos enteros positivos, 2–10 jugadores y hasta 1.000 fichas por denominación.'];
  if (![c.buyIn*c.players, value(c.inventory)*c.pointValue].every(Number.isSafeInteger)) return ['Los montos superan el rango de cálculo exacto. Reducí la equivalencia o el buy-in.'];
  return [];
}
export function blinds(c: Config) { return {small: c.automatic ? c.buyIn/(c.bb*2) : c.small, big: c.automatic ? c.buyIn/c.bb : c.big}; }
const gcd = (a: number, b: number): number => b ? gcd(b,a%b) : a;
// Bounded change enumeration with pruning, not greedy. All returned vectors are exact.
function patterns(target: number, stock: number[], cap: number, tick: () => void): number[][] {
  const out: number[][] = [], row = [0,0,0,0,0,0];
  const capacity = stock.map((_,i) => value(stock.map((x,j)=>j<=i?x:0)));
  function walk(i: number, left: number, used: number) {
    tick(); if(left<0 || used>cap || (i>=0 && left>capacity[i]))return;
    if(left===0){out.push([...row]);return;}
    if(i<0 || used+Math.ceil(left/DENOMS[i])>cap)return;
    if(i===0){if(left<=stock[0] && used+left<=cap){row[0]=left;out.push([...row]);row[0]=0;}return;}
    for(let n=Math.min(stock[i],Math.floor(left/DENOMS[i]),cap-used);n>=0;n--){row[i]=n;walk(i-1,left-n*DENOMS[i],used+n);}row[i]=0;
  }
  walk(5,target,0); return out;
}
const rank = (a: number[],b: number[]) => count(a)-count(b) || a[0]-b[0] || a[1]-b[1] || a[2]-b[2] || a[3]-b[3];
export function canPay(target: number, stock: number[]) {
  if(!integer(target) || target<0 || target>value(stock))return false;
  // Divisibility chain allows exact feasibility greedily; optimization uses enumeration above.
  for(let i=5;i>=0;i--)target-=Math.min(stock[i],Math.floor(target/DENOMS[i]))*DENOMS[i];
  return target===0;
}
function readyForBlinds(row: number[], small: number, big: number) {
  if(!canPay(small,row)||!canPay(big,row)||!canPay(small+big,row))return false;
  // Small denominations first preserve larger chips for BB; try exact SB subsets.
  let ready=false;
  const options=patterns(small,row,count(row),()=>{});
  for(const sb of options)if(canPay(big,subtract(row,sb))){ready=true;break;}
  return ready;
}
export type Result = {config: Config; stacks: number[][]; bank: number[]; warnings: string[]; optimal: boolean; balanced: boolean; reserve: boolean};
export function calculate(c: Config): Result {
  const issues=validateConfig(c);if(issues.length)throw Error(issues[0]);
  const {small,big}=blinds(c), target=c.buyIn/c.pointValue;
  if(!integer(small)||!integer(big))throw Error('Las ciegas automáticas no son guaraníes enteros. Ajustá el buy-in o usá ciegas manuales.');
  if(small>big || big>c.buyIn)throw Error('La SB debe ser menor o igual a la BB, y la BB no puede superar el stack.');
  if(!integer(target)||!integer(small/c.pointValue)||!integer(big/c.pointValue)) {
    const suggestion=gcd(gcd(c.buyIn,small),gcd(big,c.pointValue));
    throw Error(`El buy-in o las ciegas no se pueden representar con esta equivalencia. Probá 1 punto = ${suggestion.toLocaleString('es-PY')} Gs. o ajustá las ciegas.`);
  }
  const sb=small/c.pointValue, bb=big/c.pointValue;
  if(!canPay(sb,c.inventory)||!canPay(bb,c.inventory))throw Error('El inventario no permite pagar exactamente las ciegas. Agregá denominaciones pequeñas o ajustá las ciegas.');
  if(value(c.inventory)<target*c.players)throw Error('Inventario insuficiente para cubrir el buy-in de todos los jugadores.');
  let steps=0, interrupted=false;
  const tick=()=>{if(++steps>2000000){interrupted=true;throw Error('La búsqueda alcanzó su límite. Ajustá el buy-in o el inventario para poder verificar el reparto.');}};
  function solve(pool: number[], cap: number, balanced: boolean): {stacks:number[][]; optimal:boolean}|null {
    let choices: number[][];
    try{choices=patterns(target,pool,cap,tick).filter(row=>!balanced||readyForBlinds(row,sb,bb)).sort(rank);}catch(e){if(interrupted)throw Error('La búsqueda es demasiado amplia para verificar un reparto. Reducí las cantidades del inventario o ajustá el buy-in.');throw e;}
    if(!choices.length)return null;
    let best:number[][]|null=null, cost=Infinity;
    // An equal allocation is the preferred tie-breaker and a useful proven upper bound.
    for(const row of choices)if(row.every((x,i)=>x*c.players<=pool[i])){best=Array.from({length:c.players},()=>[...row]);cost=count(row)*c.players;break;}
    if(cost===count(choices[0])*c.players)return {stacks:best!,optimal:true};
    const seen=new Map<string,number>();
    function pack(left:number,stock:number[],start:number,total:number,rows:number[][]){
      tick();if(!left){if(total<cost){best=rows.map(r=>[...r]);cost=total;}return;}
      if(value(stock)<left*target)return;
      const key=left+':'+start+':'+stock.join(',');if((seen.get(key)??Infinity)<=total)return;seen.set(key,total);
      for(let k=start;k<choices.length;k++){const row=choices[k], next=total+count(row);if(total+count(row)*left>=cost)break;if(row.some((n,i)=>n>stock[i]))continue;pack(left-1,subtract(stock,row),k,next,[...rows,row]);}
    }
    try{pack(c.players,pool,0,0,[]);}catch(e){if(!interrupted)throw e;if(!best)throw Error('No se pudo completar la búsqueda con este inventario. Ajustá el buy-in o las cantidades; no se confirmó que el reparto sea imposible.');}
    return best ? {stacks:best,optimal:!interrupted}:null;
  }
  // Reserve a pair of blinds in the bank, made only of denominations useful for BB.
  const smallPool=c.inventory.map((x,i)=>DENOMS[i]<=bb?x:0);
  let reserve:number[]=[0,0,0,0,0,0];
  const reserves=patterns(sb+bb,smallPool,40,tick).filter(r=>readyForBlinds(r,sb,bb)).sort(rank);
  if(reserves.length)reserve=reserves[0];
  const phases=c.mode==='balanced' ? [
    {pool:subtract(c.inventory,reserve),cap:14,balanced:true,reserve:count(reserve)>0},
    {pool:c.inventory,cap:14,balanced:true,reserve:false},
    {pool:subtract(c.inventory,reserve),cap:14,balanced:false,reserve:count(reserve)>0},
    {pool:c.inventory,cap:14,balanced:false,reserve:false},
    {pool:subtract(c.inventory,reserve),cap:count(c.inventory),balanced:true,reserve:count(reserve)>0},
    {pool:c.inventory,cap:count(c.inventory),balanced:false,reserve:false}
  ] : [{pool:c.inventory,cap:14,balanced:false,reserve:false},{pool:c.inventory,cap:count(c.inventory),balanced:false,reserve:false}];
  for(const phase of phases){
    const solved=solve(phase.pool,phase.cap,phase.balanced);if(!solved)continue;
    const bank=solved.stacks.reduce((stock,row)=>subtract(stock,row),[...c.inventory]);
    const warnings:string[]=[];
    if(!c.automatic && c.buyIn!==big*c.bb)warnings.push(`Las ciegas manuales dan un stack de ${(c.buyIn/big).toLocaleString('es-PY',{maximumFractionDigits:4})}bb, distinto de ${c.bb}bb.`);
    if(c.mode==='balanced'&&!phase.balanced)warnings.push('No se encontró un reparto de hasta 14 fichas que permita a todos pagar SB y BB sin cambio. Se priorizó el límite de fichas; habrá que dar cambio.');
    if(!canPay(sb,bank)||!canPay(bb,bank))warnings.push('El banco no conserva cambio suficiente para las ciegas. Revisá el reparto antes de confirmarlo.');
    if(solved.stacks.some(r=>count(r)>14))warnings.push('No existe un reparto de hasta 14 fichas por jugador con este inventario. Se muestra la alternativa encontrada.');
    if(!solved.optimal)warnings.push('Reparto exacto y válido; se alcanzó el límite de búsqueda y no se pudo certificar el mínimo global.');
    return {config:structuredClone(c),stacks:solved.stacks,bank,warnings,optimal:solved.optimal,balanced:phase.balanced,reserve:phase.reserve};
  }
  throw Error('No existe un reparto exacto para todos los jugadores con el inventario disponible.');
}
export type Change = { denomination: number; given: number[] };
export function changeOptions(bank:number[], denomination:number): number[][] {
  if(!validCounts(bank)||!integer(denomination)||denomination<1||denomination>5)return [];
  let steps=0;const options=patterns(DENOMS[denomination],bank.map((x,i)=>i<denomination?x:0),1000,()=>{if(++steps>2000000)throw Error('Demasiadas combinaciones de cambio.');}).sort(rank);
  // Minimum combination plus single-denomination alternatives, then diverse next best.
  const single=options.filter(r=>r.filter(Boolean).length===1);
  return [...new Map([...options.slice(0,1),...single,...options.slice(1,8)].map(r=>[r.join(','),r])).values()].slice(0,8);
}
export function applyChange(bank:number[], change:Change): number[] {
  const i=change?.denomination,g=change?.given;
  if(!integer(i)||i<1||i>5||!validCounts(g)||g.some((n,j)=>n>bank[j]||(j>=i&&n>0))||value(g)!==DENOMS[i])throw Error('Cambio no válido o sin existencias suficientes.');
  const next=subtract(bank,g);next[i]++;if(!validCounts(next))throw Error('El banco supera el límite de inventario.');return next;
}
export type Session = {config:Config; stacks:number[][]; changes:Change[]};
export type SavedState = {config:Config; session:Session|null};
export function sessionBank(s: Session): number[] {
  if(!s||validateConfig(s.config).length||!Array.isArray(s.stacks)||s.stacks.length!==s.config.players||s.stacks.some(r=>!validCounts(r)||value(r)*s.config.pointValue!==s.config.buyIn)||!Array.isArray(s.changes)||s.changes.length>500)throw Error('Reparto confirmado no válido.');
  let bank=s.stacks.reduce((a,r)=>subtract(a,r),[...s.config.inventory]);if(bank.some(x=>x<0))throw Error('El reparto excede el inventario.');
  for(const change of s.changes){if(!change || !Number.isInteger(change.denomination) || (s.config.inventory[change.denomination]??0)-bank[change.denomination]<1)throw Error("La ficha recibida no está en circulación.");bank=applyChange(bank,change);}return bank;
}
export function validateState(state:SavedState) {if(!state||validateConfig(state.config).length)throw Error('Configuración no válida.');if(state.session!==null)sessionBank(state.session);return state;}

export function recommend(input:Config & {equivalence?:'auto'|'manual'}): {label:string;reason:string;result:Result}[] {
  const b=blinds(input);
  if(!Number.isSafeInteger(b.small)||!Number.isSafeInteger(b.big)||b.small<=0||b.big<=0)throw Error('Las ciegas deben ser guaraníes enteros positivos. Ajustá el buy-in o las opciones avanzadas.');
  if(!input.automatic&&input.buyIn!==b.big*input.bb)throw Error(`Estas ciegas dan ${input.buyIn/b.big}bb. Ajustá la BB a ${input.buyIn/input.bb} Gs. para mantener ${input.bb}bb.`);
  if(input.equivalence==='manual')return [{label:'Configuración manual',reason:'Equivalencia definida por vos, validada contra el inventario.',result:calculate(input)}];
  const unit=gcd(gcd(input.buyIn,b.small),b.big), candidates=new Set<number>();
  // Test exact divisors at multiple practical blind sizes, including values below SB.
  for(let d=1;d<=20;d++)if(unit%d===0)candidates.add(unit/d);
  const results:Result[]=[];let incomplete=false;
  for(const pointValue of candidates)for(const mode of ['balanced','minimum'] as const){try{results.push(calculate({...input,pointValue,mode}));}catch(e){if(/búsqueda/.test(String(e)))incomplete=true;}}
  if(!results.length)throw Error(incomplete?'No se pudo completar la búsqueda. Probá una equivalencia manual.':'No hay repartos viables entre las equivalencias evaluadas. Revisá el inventario o probá el modo manual.');
  const compact=(r:Result)=>Math.max(...r.stacks.map(count))>14?1:0;
  const total=(r:Result)=>r.stacks.reduce((s,row)=>s+count(row),0);
  const liquidity=(r:Result)=>r.bank.reduce((s,n,i)=>s+(DENOMS[i]*r.config.pointValue<=b.big?n:0),0);
  const equal=(r:Result)=>r.stacks.every(row=>row.join()===r.stacks[0].join())?0:1;
  const recommended=[...results].sort((a,b)=>compact(a)-compact(b)||Number(b.balanced)-Number(a.balanced)||Number(b.reserve)-Number(a.reserve)||total(a)-total(b)||equal(a)-equal(b)||liquidity(b)-liquidity(a))[0];
  const minimum=[...results].sort((a,b)=>compact(a)-compact(b)||total(a)-total(b)||equal(a)-equal(b))[0];
  const change=[...results].sort((a,b)=>compact(a)-compact(b)||Number(b.balanced)-Number(a.balanced)||liquidity(b)-liquidity(a)||total(a)-total(b))[0];
  const seen=new Set<string>();
  return [{label:'Recomendada',reason:'Prioriza stacks de hasta 14 fichas, pago de ciegas y reserva de cambio.',result:recommended},{label:'Menos fichas',reason:'La menor cantidad física entre las configuraciones evaluadas; puede requerir cambios.',result:minimum},{label:'Más cambio',reason:'Prioriza fichas del banco con valor menor o igual a la BB.',result:change}].filter(x=>{const key=x.result.config.pointValue+JSON.stringify(x.result.stacks);if(seen.has(key))return false;seen.add(key);if(incomplete)x.result.warnings.push('Algunas búsquedas alcanzaron su límite; se comparan las soluciones verificadas.');return true;});
}
