export const ALLOWED_SCALES = [100, 1000];
export const DENOMS = [1, 5, 25, 100, 500, 1000];
export const INITIAL_INVENTORY = [100, 150, 100, 100, 25, 25];
export type Config = { caseId?: 1 | 2; autoValues?: boolean; chipValues?: number[]; equivalence?: "auto" | "manual"; buyIn: number; players: number; bb: 50 | 100; automatic: boolean; small: number; big: number; pointValue: number; mode: 'minimum' | 'balanced'; inventory: number[] };
export const DEFAULT_CONFIG: Config = { buyIn: 500000, players: 6, bb: 50, automatic: true, small: 5000, big: 10000, pointValue: 1000, mode: 'balanced', inventory: [...INITIAL_INVENTORY] };
export type Result = {config: Config; stacks: number[][]; bank: number[]; warnings: string[]; optimal: boolean; balanced: boolean; reserve: boolean; comfort: number; bigBlindPayments: number; changePayments: number; smallBlindDirect: boolean};
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
function patterns(target: number, stock: number[], cap: number, tick: () => void, visit?: (row:number[])=>void): number[][] {
  const out: number[][] = [], row = DENOMS.map(()=>0);
  const capacity = stock.map((_,i) => value(stock.map((x,j)=>j<=i?x:0)));
  const emit=()=>{const next=[...row];if(visit)visit(next);else out.push(next);};
  function walk(i: number, left: number, used: number) {
    tick(); if(left<0 || used>cap || (i>=0 && left>capacity[i]))return;
    if(left===0){emit();return;}
    if(i<0 || used+Math.ceil(left/DENOMS[i])>cap)return;
    if(i===0){if(Number.isInteger(left/DENOMS[0]) && left/DENOMS[0]<=stock[0] && used+left/DENOMS[0]<=cap){row[0]=left/DENOMS[0];emit();row[0]=0;}return;}
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
function canFundPayments(row:number[], payments:number[],tick:()=>void=()=>{}):boolean {
  if(payments.reduce((s,n)=>s+n,0)>value(row)||payments.some(n=>!canPay(n,row)))return false;
  // Fast constructive proof for the common case; retain exhaustive fallback.
  const remaining=[...row];let paid=true;
  for(const amount of [...payments].sort((a,b)=>b-a)){let left=amount;for(let i=DENOMS.length-1;i>=0;i--){const n=Math.min(remaining[i],Math.floor(left/DENOMS[i]));remaining[i]-=n;left-=n*DENOMS[i];}if(left){paid=false;break;}}
  if(paid)return true;
  const failed=new Set<string>();
  function visit(stock:number[], index:number):boolean{
    tick();if(index===payments.length)return true;
    const key=index+':'+stock.join(',');if(failed.has(key))return false;
    const options=patterns(payments[index],stock,count(stock),tick).sort(rank);
    for(const payment of options)if(visit(subtract(stock,payment),index+1))return true;
    failed.add(key);return false;
  }
  return visit(row,0);
}
// Count disjoint payments, not just whether their combined amount is payable.
function paymentCounter(amount:number,limit:number,inventory:number[],tick:()=>void){
  const optionsStock=inventory.map((n,i)=>Math.min(n,Math.floor(amount/DENOMS[i])));
  const direct=DENOMS.indexOf(amount);
  const usable=DENOMS.filter((d,i)=>d<amount&&optionsStock[i]>0);
  const divisible=usable.every((d,i)=>i===0||d%usable[i-1]===0);
  const memo=new Map<string,number>();
  let options:number[][]|undefined;
  function combined(stock:number[],want:number):number{
    want=Math.min(want,Math.floor(value(stock)/amount));
    if(!want)return 0;
    const key=want+':'+stock.join(',');
    const previous=memo.get(key);if(previous!==undefined)return previous;
    const remaining=[...stock];let paid=0;
    for(;paid<want;paid++){
      let left=amount;
      for(let i=DENOMS.length-1;i>=0;i--){const n=Math.min(remaining[i],Math.floor(left/DENOMS[i]));remaining[i]-=n;left-=n*DENOMS[i];}
      if(left)break;
    }
    if(paid<want&&!divisible){
      options??=patterns(amount,optionsStock.map((n,i)=>DENOMS[i]<amount?n:0),count(optionsStock),tick).sort(rank);
      for(const row of options){
        tick();if(row.some((n,i)=>n>stock[i]))continue;
        paid=Math.max(paid,1+combined(subtract(stock,row),want-1));
        if(paid===want)break;
      }
    }
    if(memo.size<20000)memo.set(key,paid);
    return paid;
  }
  return (row:number[],requested=limit)=>{
    const singles=direct<0?0:Math.min(row[direct],requested),pending=requested-singles;
    if(!pending)return singles;
    const stock=row.map((n,i)=>DENOMS[i]<amount?Math.min(n,optionsStock[i]*pending):0);
    return singles+combined(stock,pending);
  };
}
function bettingGoal(target:number,big:number,moreChange:boolean){
  const depth=target/big;
  return Math.min(Math.floor(depth),Math.max(4,Math.min(8,Math.round(Math.sqrt(depth)/2)+(moreChange?2:0))));
}
// A few opening payments are useful; funding every future bet is not.
// Physical handling cost grows smoothly, without forbidding any stack size.
function stackCost(target:number,big:number,stock:number[],moreChange:boolean,rounds:(row:number[])=>number){
  const exact=DENOMS.indexOf(big);
  const hasExact=exact>=0&&stock[exact]>0;
  const goal=bettingGoal(target,big,moreChange);
  const top=DENOMS.reduce((last,d,i)=>d<=target&&stock[i]>0?i:last,-1);
  const bridge=DENOMS.map((d,i)=>({d,i})).filter(({d,i})=>i!==top&&d>big*2&&d<=big*8&&stock[i]>0&&d<=target*.3)
    .sort((a,b)=>Math.abs(a.d-big*5)-Math.abs(b.d-big*5))[0];
  const bridgeGoal=bridge?Math.min(3,Math.floor(target*.3/bridge.d)):0;
  const isCapital=(d:number,i:number)=>d>big*8||(i===top&&d>big*3&&!!bridge);
  const hasCapital=DENOMS.some((d,i)=>isCapital(d,i)&&d<=target&&stock[i]>0);
  return (row:number[])=>{
    let smallValue=0, capital=0, largestPile=0;
    for(let i=0;i<DENOMS.length;i++){
      const d=DENOMS[i],pile=row[i]*d;
      if(d<big)smallValue+=pile;
      if(isCapital(d,i))capital+=pile;
      largestPile=Math.max(largestPile,pile);
    }
    const covered=rounds(row),direct=hasExact?Math.min(row[exact],goal):0;
    const extraSmall=Math.ceil(Math.max(0,smallValue-(covered-direct)*big)/big);
    let missedRaises=0;
    for(const multiple of [2,3])if(covered<multiple&&multiple<=target/big&&!canPay(multiple*big,row))missedRaises++;
    const missingBridge=bridge?Math.max(0,bridgeGoal-row[bridge.i]):0;
    const capitalShortfall=hasCapital?Math.ceil(Math.max(0,target*.5-capital)/Math.max(3*big,target/15)):0;
    const physical=count(row);
    const handling=physical+Math.max(0,physical-25)*.5+Math.max(0,physical-30)*1.5;
    // Prefer direct BB chips over multiple small chips, but never reward an
    // ever-growing pile. Large capital chips may legitimately hold most value.
    const directShortfall=hasExact?Math.max(0,Math.min(covered,goal)-direct):0;
    const concentration=Math.max(0,largestPile-target*.9)/Math.max(5*big,target/12);
    return handling+2*extraSmall+(moreChange?8:3)*Math.max(0,goal-covered)+directShortfall+3*missingBridge+3*missedRaises+2*capitalShortfall+concentration;
  };
}
function tableCost(r:Result,moreChange=false){
  const {big}=blinds(r.config),scale=factor(r.config),b=big/scale,target=r.config.buyIn/scale;
  let steps=0;
  const rounds=paymentCounter(b,bettingGoal(target,b,moreChange),r.config.inventory,()=>{if(++steps>2000000)throw Error('La búsqueda de pagos alcanzó su límite.');});
  const cost=stackCost(target,b,r.config.inventory,moreChange,rounds);
  return r.stacks.reduce((s,row)=>s+cost(row),0);
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
function calculate(c: Config, moreChange=false): Result {
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
  const changeSize=bb-sb;
  const needsExactSmall=changeSize>0&&!canPay(changeSize,c.inventory);
  if(!canPay(bb,c.inventory)||(needsExactSmall&&!canPay(sb,c.inventory)))throw Error(c.caseId===2?incompatibleBlinds(c):'El inventario no permite pagar exactamente las ciegas, ni devolver la diferencia de la SB. Revisá las denominaciones.');
  if(value(c.inventory)<target*c.players)throw Error('Inventario insuficiente para cubrir el buy-in de todos los jugadores.');
  const goal=bettingGoal(target,bb,moreChange);
  const changeGoal=changeSize>0&&!needsExactSmall?Math.ceil(c.players/2):0;
  let steps=0, interrupted=false;
  const tick=()=>{if(++steps>2000000){interrupted=true;throw Error('La búsqueda alcanzó su límite. Ajustá el buy-in o el inventario para poder verificar el reparto.');}};
  const rounds=paymentCounter(bb,goal,c.inventory,tick);
  const countChange=changeGoal?paymentCounter(changeSize,changeGoal,c.inventory,tick):()=>0;
  const rowCost=c.mode==='minimum'?count:stackCost(target,bb,c.inventory,moreChange,rounds);
  const ready=(row:number[],comfort:number)=>comfort===0||(rounds(row,comfort)>=comfort&&(!needsExactSmall||canFundPayments(row,[sb,...Array(comfort).fill(bb)],tick)));
  const identical=(rows:number[][])=>rows.every(row=>row.join()===rows[0].join());
  const remainingBank=(rows:number[][])=>rows.reduce((stock,row)=>subtract(stock,row),[...c.inventory]);
  function solve(pool: number[], cap: number, comfort: number, minimumRounds=comfort, incumbent:number[][]|null=null): {stacks:number[][]; optimal:boolean}|null {
    let best:number[][]|null=incumbent, cost=best?best.reduce((sum,row)=>sum+rowCost(row),0):Infinity;
    // Each other player needs at least this many physical chips. All score
    // terms are nonnegative, so this is a proven bound, not a size limit.
    const smallest=minimumStack(target,pool);
    if(Number.isFinite(cost)&&smallest&&(c.mode==='minimum'||(best&&identical(best))))cap=Math.min(cap,Math.floor(cost-(c.players-1)*count(smallest)));
    let choices: {row:number[];cost:number}[];
    try{choices=patterns(target,pool,cap,tick).filter(row=>ready(row,comfort)&&(minimumRounds===comfort||rounds(row,minimumRounds)>=minimumRounds)).map(row=>({row,cost:rowCost(row)})).sort((a,b)=>a.cost-b.cost||rank(a.row,b.row));}catch(e){if(interrupted)throw Error('La búsqueda es demasiado amplia para verificar un reparto. Reducí las cantidades del inventario o ajustá el buy-in.');throw e;}
    if(!choices.length)return best?{stacks:best,optimal:true}:null;
    // Prefer identical playable stacks; joint packing is retained for scarce inventories.
    // Legacy minimum mode still minimizes total chip count globally.
    for(const choice of choices)if(choice.row.every((x,i)=>x*c.players<=pool[i])){if(choice.cost*c.players<=cost||c.mode==='balanced'){best=Array.from({length:c.players},()=>[...choice.row]);cost=choice.cost*c.players;}break;}
    if(c.mode==='balanced'&&best&&identical(best))return {stacks:best,optimal:true};
    if(cost===choices[0].cost*c.players)return {stacks:best!,optimal:true};
    const seen=new Map<string,number>();
    function pack(left:number,stock:number[],start:number,total:number,rows:number[][]){
      tick();if(!left){if(total<cost){best=rows.map(r=>[...r]);cost=total;}return;}
      if(value(stock)<left*target)return;
      const key=left+':'+start+':'+stock.join(',');if((seen.get(key)??Infinity)<=total)return;seen.set(key,total);
      for(let k=start;k<choices.length;k++){tick();const {row,cost:price}=choices[k], next=total+price;if(total+price*left>=cost)break;if(row.some((n,i)=>n>stock[i]))continue;pack(left-1,subtract(stock,row),k,next,[...rows,row]);}
    }
    try{pack(c.players,pool,0,0,[]);}catch(e){if(!interrupted)throw e;if(!best)throw Error('No se pudo completar la búsqueda con este inventario. Ajustá el buy-in o las cantidades; no se confirmó que el reparto sea imposible.');}
    return best ? {stacks:best,optimal:!interrupted}:null;
  }
  const smallStock=c.inventory.reduce((sum,n,i)=>sum+(DENOMS[i]<=bb?n*DENOMS[i]:0),0);
  const maxTier=Math.min(3,goal,Math.floor(smallStock/bb/c.players));
  for(let comfort=c.mode==='balanced'?maxTier:0;comfort>=0;comfort--){
    const payments=Array<number>(comfort).fill(bb);
    if(comfort&&needsExactSmall)payments.push(sb);
    if(payments.reduce((s,n)=>s+n,0)>target)continue;
    if(chain&&DENOMS.slice(1).some((next,i)=>{
      const needed=payments.reduce((s,n)=>s+n%next,0);
      return (needed+((target-needed)%next+next)%next)*c.players>value(c.inventory.map((n,j)=>j<=i?n:0));
    }))continue;

    const maxPerPlayer=Math.min(target,count(c.inventory)-c.players+1);
    const seed=(requested:number[])=>{
      if(requested.reduce((sum,n)=>sum+n,0)>target)return null;
      const rows=seedAllocation(target,c.inventory,c.players,requested);
      return rows?.every(row=>ready(row,comfort))?rows:null;
    };
    // Compare compact exact seeds, rather than retaining the first greedy
    // fill after asking for the maximum number of opening payments.
    let backup:number[][]|null=null, backupCost=Infinity;
    const keep=(rows:number[][]|null)=>{if(!rows)return;const cost=rows.reduce((sum,row)=>sum+rowCost(row),0);const preferEqual=c.mode==='balanced';if((preferEqual&&backup&&!identical(backup)&&identical(rows))||((!preferEqual||!backup||!identical(backup)||identical(rows))&&cost<backupCost)){backup=rows;backupCost=cost;}};
    for(let n=comfort;n<=goal;n++)keep(seed([...payments,...Array<number>(n-comfort).fill(bb)]));
    // Optimize a fair-share stack first. The full table search below still
    // permits different stacks, but a timeout now keeps the best equal stack
    // already compared, instead of falling back to a fragmented allocation.
    const fair=c.inventory.map(n=>Math.floor(n/c.players));
    const equalSeed=minimumStack(target,fair);
    if(equalSeed&&ready(equalSeed,comfort))keep(Array.from({length:c.players},()=>[...equalSeed]));
    let equalSteps=0;
    const equalBudget=Symbol('equal-search-budget');
    try{patterns(target,fair,Math.min(count(fair),Math.floor(backupCost/c.players)),()=>{if(++equalSteps>250000)throw equalBudget;},row=>{
      if(ready(row,comfort))keep(Array.from({length:c.players},()=>[...row]));
    });}catch(e){if(e!==equalBudget)throw e;}
    let solved:{stacks:number[][];optimal:boolean}|null=null;
    try{solved=solve(c.inventory,maxPerPlayer,comfort,comfort,backup);}catch(e){if(!interrupted||!backup)throw e;solved={stacks:backup,optimal:false};}
    if(!solved)continue;

    let bank=remainingBank(solved.stacks);
    // Try setting aside a table-wide reserve, then solve again at the same
    // comfort tier. Prefer the reserve only if it does not cost anyone a BB payment.
    if(changeGoal&&c.mode==='balanced'&&!interrupted){
      try{
        const before=countChange(bank);
        if(before<changeGoal){
          const pools=[[...c.inventory]];
          for(let n=0;n<changeGoal;n++){
            const row=minimumStack(changeSize,pools[n]);if(!row)break;
            pools.push(subtract(pools[n],row));
          }
          const currentRounds=Math.min(...solved.stacks.map(row=>rounds(row)));
          for(let n=pools.length-1;n>before;n--){
            if(value(pools[n])<target*c.players)continue;
            const candidate=solve(pools[n],maxPerPlayer,comfort,currentRounds);
            if(!candidate)continue;
            const candidateBank=remainingBank(candidate.stacks);
            if(countChange(candidateBank)>before&&candidate.stacks.reduce((sum,row)=>sum+rowCost(row),0)<=solved.stacks.reduce((sum,row)=>sum+rowCost(row),0)+c.players){solved=candidate;bank=candidateBank;break;}
          }
        }
      }catch(e){if(!interrupted)throw e;}
    }

    // Use a separate budget for reporting so a valid bounded-search fallback
    // can still display verified opening payments and change.
    const verifiedRounds=(amount:number,limit:number,pool:number[])=>{
      let checks=0;
      return paymentCounter(amount,limit,c.inventory,()=>{if(++checks>2000000)throw Error('La búsqueda de pagos alcanzó su límite.');})(pool);
    };
    const bigBlindPayments=Math.min(...solved.stacks.map(row=>verifiedRounds(bb,goal,row)));
    const changePayments=changeGoal?verifiedRounds(changeSize,changeGoal,bank):0;
    const smallBlindDirect=solved.stacks.every(row=>canPay(sb,row));
    const warnings:string[]=[];
    if(!c.automatic && c.buyIn!==big*c.bb)warnings.push(`Las ciegas manuales dan un stack de ${(c.buyIn/big).toLocaleString('es-PY',{maximumFractionDigits:4})}bb, distinto de ${c.bb}bb.`);
    if(c.mode==='balanced'){
      if(bigBlindPayments<2)warnings.push('Con el inventario de esta mesa, el reparto tiene poca cobertura de BB. Revisá el stock de fichas para apostar antes de jugar.');
      if(!smallBlindDirect&&!changePayments)warnings.push('Prepará cambio manual para la SB: no todos los stacks pueden pagarla exacta y el banco no cubre la diferencia.');
      else if(changeGoal&&changePayments<changeGoal)warnings.push('La reserva para devolver la diferencia de la SB es limitada. Si se agota, prepará cambio adicional.');
    }
    if(solved.stacks.some(row=>count(row)>30)){
      const minimumTable=minimumStack(target*c.players,c.inventory);
      if(minimumTable&&count(minimumTable)>30*c.players)warnings.push('Estas denominaciones y existencias requieren más de 30 fichas por jugador en promedio, incluso sin reservar fichas para ciegas. Para reducirlas, necesitás más stock de denominaciones altas; no se modificaron tus valores.');
    }
    if(interrupted||!solved.optimal)warnings.push('Reparto exacto y válido; se alcanzó el límite de búsqueda antes de comparar todas las combinaciones.');
    return {config:structuredClone(c),stacks:solved.stacks,bank,warnings,optimal:solved.optimal&&!interrupted,balanced:comfort>0,reserve:changeGoal>0&&changePayments>=changeGoal,comfort,bigBlindPayments,changePayments,smallBlindDirect};
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
  input={...input,mode:'balanced'};
  if(input.caseId===2)return practicalAlternatives(calculate(input));
  const b=blinds(input);
  if(!Number.isSafeInteger(b.small)||!Number.isSafeInteger(b.big)||b.small<=0||b.big<=0)throw Error('Las ciegas deben ser guaraníes enteros positivos. Ajustá el buy-in o las opciones avanzadas.');
  if(input.equivalence==='manual')return practicalAlternatives(calculate(input));
  const candidates=ALLOWED_SCALES;
  if(!candidates.some(scale=>[input.buyIn,b.small,b.big].every(n=>n%scale===0)))throw Error(incompatibleBlinds(input));
  const results:Result[]=[];let incomplete=false;
  for(const pointValue of candidates){try{results.push(calculate({...input,pointValue,mode:'balanced'}));}catch(e){if(/búsqueda/.test(String(e)))incomplete=true;}}
  if(!results.length)throw Error(incomplete?'No se pudo completar la búsqueda. Probá una equivalencia manual.':'No hay repartos viables entre las equivalencias evaluadas. Revisá el inventario o probá el modo manual.');
  const total=(r:Result)=>r.stacks.reduce((s,row)=>s+count(row),0);
  const liquidity=(r:Result)=>r.bank.reduce((s,n,i)=>s+(DENOMS[i]*r.config.pointValue<=b.big?n:0),0);
  const equal=(r:Result)=>r.stacks.every(row=>row.join()===r.stacks[0].join())?0:1;
  const recommended=[...results].sort((a,b)=>b.comfort-a.comfort||tableCost(a)-tableCost(b)||Number(b.reserve)-Number(a.reserve)||total(a)-total(b)||equal(a)-equal(b)||liquidity(b)-liquidity(a))[0];
  if(incomplete)recommended.warnings.push('Algunas búsquedas alcanzaron su límite; se comparan las soluciones verificadas.');
  return practicalAlternatives(recommended);
}
return {validCounts,validateConfig,blinds,incompatibleBlinds,canPay,canFundPayments,calculate,changeOptions,applyChange,sessionBank,validateState,recommend,tableCost,count,value,subtract,add};
}
const base=createEngine(DENOMS);
function engine(c?:Config){if(c?.caseId!==2)return base;const values=validValues(c.chipValues)?c.chipValues:COLOR_VALUES;const unit=values.reduce(gcd);return createEngine(values.map(v=>v/unit),unit);}
export const {count,value,subtract,add,validCounts,canPay,canFundPayments}=base;
export const blinds=base.blinds;
export const validateConfig=(c:Config)=>engine(c).validateConfig(c);
export const incompatibleBlinds=(c:Config)=>engine(c).incompatibleBlinds(c);
export const calculate=(c:Config)=>engine(c).calculate(c);
export function recommend(c:Config){
 c={...c,mode:'balanced'};
 if(c.caseId!==2||c.autoValues===false)return engine(c).recommend(c);
 const issues=validateConfig(c);if(issues.length)throw Error(issues[0]);
 if(!count(c.inventory))throw Error('Completá el inventario del Maletín 2 antes de calcular.');
 const {small,big}=blinds(c);if(!Number.isSafeInteger(small)||!Number.isSafeInteger(big))throw Error('Las ciegas deben ser guaraníes enteros. Ajustá el buy-in o las ciegas.');
 const results:Result[]=[];let limited=false;
 // Familiar 1–2–5 decimal denominations, independent of blind multiples.
 const ladder:number[]=[];
 for(let unit=1;unit<=c.buyIn&&unit<=Number.MAX_SAFE_INTEGER/100;unit*=10)for(const n of [1,2,5])ladder.push(n*unit);
 const candidates:number[][]=[];
 for(let i=0;i<ladder.length-4;i++){
  const low=ladder[i];if(low>small||low<small/10||[small,big,c.buyIn].some(n=>n%low!==0))continue;
  for(const offsets of [[0,1,2,3,4],[0,1,2,4,5],[0,1,2,4,6]]){
   const values=offsets.map(n=>ladder[i+n]);if(validValues(values)&&values[4]<=c.buyIn)candidates.push(values);
  }
 }
 for(const chipValues of candidates){
  try{results.push(calculate({...c,chipValues,pointValue:1,mode:'balanced'}));}catch(e){if(/búsqueda/.test(String(e)))limited=true;}
 }
 if(!results.length)throw Error(limited?'No se completó la búsqueda. Probá valores manuales.':'No se encontró un reparto exacto con los valores automáticos evaluados. Revisá el inventario o definí valores manuales.');
 const scored=results.map(result=>({result,cost:engine(result.config).tableCost(result)}));
 scored.sort((a,b)=>b.result.comfort-a.result.comfort||a.cost-b.cost||Number(b.result.reserve)-Number(a.result.reserve)||count(a.result.stacks.flat())-count(b.result.stacks.flat()));
 const result=scored[0].result;if(limited)result.warnings.push('Se compararon las soluciones verificadas; algunas búsquedas alcanzaron su límite.');
 return practicalAlternatives(result);
}
// Both choices keep blind feasibility ahead of chip count. Legacy minimum configs
// remain readable for confirmed banks, but are never offered for new recommendations.
function practicalAlternatives(result:Result){
 let change=result;
 const solver=engine(result.config);
 try{const candidate=solver.calculate(result.config,true);if(candidate.comfort>=result.comfort&&candidate.bigBlindPayments>=result.bigBlindPayments&&candidate.changePayments>=result.changePayments&&solver.tableCost(candidate,true)<solver.tableCost(result,true))change=candidate;}catch{/* Keep the verified recommendation. */}
 const same=change===result;
 return [
  {label:'Recomendada',reason:'Combina fichas para ciegas y apuestas con denominaciones intermedias para cambio y fichas grandes para el capital.',result},
  {label:'Más cambio',reason:same?'El reparto recomendado ya es la mejor opción de cambio encontrada con estas existencias.':'Da más peso a las fichas útiles para apostar y dar cambio, manteniendo las ciegas y el buy-in.',result:same?structuredClone(result):change}
 ];
}
export const changeOptions=(bank:number[],denomination:number,c?:Config)=>engine(c).changeOptions(bank,denomination);
export const applyChange=(bank:number[],change:Change,c?:Config)=>engine(c).applyChange(bank,change);
export const sessionBank=(s:Session)=>engine(s?.config).sessionBank(s);
export const validateState=(s:SavedState)=>engine(s?.config).validateState(s);
