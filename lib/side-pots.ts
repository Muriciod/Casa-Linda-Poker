export type Contribution = {id:string;name:string;amount:number;folded:boolean};
export type Pot = {amount:number;eligible:string[]};
export type Pots = {players:Contribution[];pots:Pot[];refunds:Record<string,number>;total:number;unit:number};
export function calculatePots(input:Contribution[], unit=1):Pots {
 if(input.length<2)throw Error('Añadí al menos dos jugadores.');
 if(!Number.isSafeInteger(unit)||unit<1)throw Error('La ficha mínima debe ser un entero positivo.');
 if(new Set(input.map(p=>p.id)).size!==input.length)throw Error('Los jugadores deben tener identificadores únicos.');
 if(input.some(p=>!p.id||!p.name.trim()||!Number.isSafeInteger(p.amount)||p.amount<0||p.amount%unit!==0))throw Error('Completá los nombres y usá aportes enteros no negativos, múltiplos de la ficha mínima.');
 const total=input.reduce((s,p)=>s+p.amount,0);
 if(!Number.isSafeInteger(total)||total<=0)throw Error('Ingresá aportes válidos; el total debe ser mayor que cero y no superar el límite numérico.');
 const players=input.map(p=>({...p}));
 const pots:Pot[]=[],refunds=Object.fromEntries(players.map(p=>[p.id,0]));
 const levels=[...new Set(players.map(p=>p.amount).filter(Boolean))].sort((a,b)=>a-b);
 let previous=0;
 for(const level of levels){
  const contributors=players.filter(p=>p.amount>=level), delta=level-previous;
  previous=level;
  if(contributors.length===1){refunds[contributors[0].id]+=delta;continue;}
  const eligible=contributors.filter(p=>!p.folded).map(p=>p.id);
  if(!eligible.length)throw Error('Hay aportes igualados únicamente entre jugadores que foldearon. Revisá los montos o los folds antes de distribuir ese pozo.');
  const last=pots.at(-1);
  if(last&&last.eligible.join('|')===eligible.join('|'))last.amount+=delta*contributors.length;
  else pots.push({amount:delta*contributors.length,eligible});
 }
 return {players,pots,refunds,total,unit};
}
export function distributePots(result:Pots,winners:string[][],firstId=result.players[0].id){
 if(winners.length!==result.pots.length)throw Error('Seleccioná ganadores para todos los pozos.');
 const start=result.players.findIndex(p=>p.id===firstId);
 if(start<0)throw Error('Seleccioná quién tiene prioridad para la ficha sobrante.');
 const order=[...result.players.slice(start),...result.players.slice(0,start)].map(p=>p.id);
 const awards=Object.fromEntries(result.players.map(p=>[p.id,0]));
 const oddChips:string[][]=[];
 result.pots.forEach((pot,i)=>{
  const selected=winners[i];
  if(!selected?.length||new Set(selected).size!==selected.length||selected.some(id=>!pot.eligible.includes(id)))throw Error('Elegí al menos un ganador elegible por pozo.');
  const sorted=order.filter(id=>selected.includes(id)),units=pot.amount/result.unit,share=Math.floor(units/sorted.length),extra=units%sorted.length;
  oddChips.push(sorted.slice(0,extra));
  sorted.forEach((id,k)=>awards[id]+=(share+(k<extra?1:0))*result.unit);
 });
 const rows=result.players.map(p=>({id:p.id,name:p.name,amount:p.amount,award:awards[p.id],refund:result.refunds[p.id],receives:awards[p.id]+result.refunds[p.id],net:awards[p.id]+result.refunds[p.id]-p.amount}));
 if(rows.reduce((s,p)=>s+p.receives,0)!==result.total)throw Error('No se pudo conservar el total. Revisá los datos.');
 return {rows,oddChips};
}
