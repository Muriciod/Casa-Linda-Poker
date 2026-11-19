"use client";
import {useState} from 'react';
import {calculatePots,distributePots,type Pots} from '../lib/side-pots';
import './side-pots.css';
const guaranies = new Intl.NumberFormat('es-PY');
const money=(n:number)=>guaranies.format(n)+' Gs.';
type Draft={id:string;name:string;amount:string;folded:boolean};
const row=(n:number):Draft=>({id:crypto.randomUUID(),name:'Jugador '+n,amount:'',folded:false});
const initial:Draft[]=[1,2,3].map(n=>({id:'initial-'+n,name:'Jugador '+n,amount:'',folded:false}));
export default function SidePotCalculator({mesaPlayers=[]}:{mesaPlayers?:{id:string;name:string}[]}){
 const [players,setPlayers]=useState<Draft[]>(initial),[unit,setUnit]=useState('1'),[result,setResult]=useState<Pots|null>(null),[error,setError]=useState(''),[winners,setWinners]=useState<string[][]>([]),[first,setFirst]=useState(''),[mode,setMode]=useState<'potential'|'awards'>('potential');
 function invalidate(){setResult(null);setWinners([]);setError('');}
 function edit(id:string,patch:Partial<Draft>){invalidate();setPlayers(p=>p.map(x=>x.id===id?{...x,...patch}:x));}
 function calculate(){
  try{
   if(players.some(p=>!/^\d+$/.test(p.amount.trim()))||!/^\d+$/.test(unit.trim()))throw Error('Ingresá montos enteros en Gs., sin puntos ni comas. Usá 0 si no aportó.');
   const r=calculatePots(players.map(p=>({...p,amount:Number(p.amount)})),Number(unit));
   setResult(r);setWinners(r.pots.map(p=>p.eligible.length===1?[p.eligible[0]]:[]));setFirst(r.players[0].id);setError('');
  }catch(e){setResult(null);setError(e instanceof Error?e.message:'Revisá los datos.');}
 }
 const name=(id:string)=>result?.players.find(p=>p.id===id)?.name??id;
 const complete=!!result&&winners.every(w=>w.length);
 let paid:ReturnType<typeof distributePots>|null=null;
 if(result&&complete)paid=distributePots(result,winners,first);
 return <section className="side-pots">
  <header><span className="section-kicker">HERRAMIENTAS · SIMULACIÓN</span><h1>Calculadora de Side Pots</h1><p>Ingresá lo que cada jugador aportó en toda la mano, incluyendo ciegas y apuestas anteriores. No ingreses su buy-in ni su stack restante.</p><small>Independiente de la partida · Sin rake · No modifica saldos ni estadísticas</small></header>
  <form className="sp-panel" onSubmit={e=>{e.preventDefault();calculate();}}>
   <div className="sp-toolbar"><h2>Aportes de la mano</h2>{mesaPlayers.length>0&&<button type="button" className="secondary" onClick={()=>{if(players.some(p=>p.amount)&&!window.confirm('¿Reemplazar esta simulación por los nombres de la mesa activa?'))return;invalidate();setPlayers(mesaPlayers.map(p=>({...p,amount:'',folded:false})));}}>Cargar jugadores de la mesa</button>}</div>
   <p className="sp-muted">Los jugadores que foldearon también aportan al pozo. Marcá «Foldeó» para excluirlos de los premios.</p>
   <div className="sp-inputs">{players.map((p,i)=><div className="sp-player" key={p.id}>
    <span className="sp-index">{String(i+1).padStart(2,'0')}</span>
    <label>Nombre<input aria-label={'Nombre del jugador '+(i+1)} maxLength={80} value={p.name} onChange={e=>edit(p.id,{name:e.target.value})}/></label>
    <label>Aportó · Gs.<input aria-label={'Aporte del jugador '+(i+1)} inputMode="numeric" placeholder="Ej. 50000" value={p.amount} onChange={e=>edit(p.id,{amount:e.target.value})}/></label>
    <label className="sp-check"><input type="checkbox" checked={p.folded} onChange={e=>edit(p.id,{folded:e.target.checked})}/>Foldeó</label>
    <button type="button" className="secondary" aria-label={'Eliminar jugador '+(i+1)} disabled={players.length<=2} onClick={()=>{invalidate();setPlayers(x=>x.filter(a=>a.id!==p.id));}}>×</button>
   </div>)}</div>
   <div className="sp-toolbar"><button type="button" className="secondary" onClick={()=>{invalidate();setPlayers(x=>[...x,row(x.length+1)]);}}>+ Añadir jugador</button><button type="submit" className="primary">Calcular pozos</button></div>
   <details><summary>Fichas indivisibles</summary><label>Valor mínimo para repartir · Gs.<input inputMode="numeric" value={unit} onChange={e=>{invalidate();setUnit(e.target.value);}}/></label><p className="sp-muted">Por defecto, 1 Gs. Si repartís fichas de 100 Gs., ingresá 100. Todos los aportes deben ser múltiplos de ese valor.</p></details>
   {error&&<p className="sp-error" role="alert">{error}</p>}
  </form>
  {result&&<div aria-live="polite">
   <div className="sp-totals"><article><small>Total aportado</small><strong>{money(result.total)}</strong></article><article><small>Pozo total disputable</small><strong>{money(result.pots.reduce((s,p)=>s+p.amount,0))}</strong></article><article><small>Devoluciones</small><strong>{money(Object.values(result.refunds).reduce((s,n)=>s+n,0))}</strong></article></div>
   <div className="sp-pots">{result.pots.map((pot,i)=><article className="sp-panel" key={i}><span className="section-kicker">{i===0?'MAIN POT':'SIDE POT '+i}</span><h2>{money(pot.amount)}</h2><p>Elegibles: {pot.eligible.map(name).join(' · ')}</p></article>)}</div>
   {result.players.filter(p=>result.refunds[p.id]>0).map(p=><p className="sp-refund" key={p.id}>↩ {p.name}: se devuelven <strong>{money(result.refunds[p.id])}</strong> de apuesta no igualada.</p>)}
   <div className="sp-panel">
    <div className="sp-tabs" role="group" aria-label="Simulador"><button type="button" className={mode==='potential'?'primary':'secondary'} aria-pressed={mode==='potential'} onClick={()=>setMode('potential')}>¿Cuánto ganaría cada uno?</button><button type="button" className={mode==='awards'?'primary':'secondary'} aria-pressed={mode==='awards'} onClick={()=>setMode('awards')}>Distribuir premios</button></div>
    {mode==='potential'?<><p className="sp-muted">Escenarios independientes: cada jugador gana todos los pozos que puede disputar. El cobro incluye su devolución. Estos importes no se suman entre sí.</p><div className="sp-table-wrap"><table><thead><tr><th>Jugador</th><th>Aportó</th><th>Cobraría</th><th>Balance</th></tr></thead><tbody>{result.players.map(p=>{const n=result.pots.filter(pot=>pot.eligible.includes(p.id)).reduce((s,pot)=>s+pot.amount,0)+result.refunds[p.id];return <tr key={p.id}><th>{p.name}{p.folded&&<small>Foldeó</small>}</th><td>{money(p.amount)}</td><td>{money(n)}</td><td>{n-p.amount>0?'+':''}{money(n-p.amount)}</td></tr>;})}</tbody></table></div></>:<>
     <p className="sp-muted">Seleccioná una o varias manos ganadoras por pozo. Varias selecciones significan empate; cada pozo se divide por separado.</p>
     {result.pots.map((pot,i)=><fieldset key={i}><legend>{i===0?'Main Pot':'Side Pot '+i} · {money(pot.amount)}</legend><div className="sp-choices">{pot.eligible.map(id=><label className="sp-check" key={id}><input type="checkbox" checked={winners[i]?.includes(id)??false} onChange={e=>setWinners(ws=>ws.map((w,j)=>i===j?e.target.checked?[...w,id]:w.filter(x=>x!==id):w))}/>{name(id)}</label>)}</div></fieldset>)}
     <details><summary>Orden para fichas sobrantes</summary><p className="sp-muted">Ordená las filas de entrada en sentido horario. Elegí el primer jugador a la izquierda del botón; los sobrantes van a los ganadores empatados siguiendo ese orden, saltando quienes no ganaron el pozo.</p><label>Primero a la izquierda del botón<select value={first} onChange={e=>setFirst(e.target.value)}>{result.players.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label></details>
     <p className="sp-muted">Prioridad de sobrantes: desde {name(first)}, siguiendo el orden de las filas y volviendo al inicio.</p>
     {!complete?<p className="sp-refund">Seleccioná ganadores en todos los pozos para ver el reparto final.</p>:paid&&<><div className="sp-table-wrap"><table><thead><tr><th>Jugador</th><th>Aportó</th><th>Cobra*</th><th>Balance neto</th></tr></thead><tbody>{paid.rows.map(p=><tr key={p.id}><th>{p.name}</th><td>{money(p.amount)}</td><td>{money(p.receives)}{p.refund>0&&<small>Incluye {money(p.refund)} de devolución</small>}</td><td className={p.net>=0?'sp-positive':'sp-negative'}>{p.net>0?'+':''}{money(p.net)}</td></tr>)}</tbody><tfoot><tr><th>Total</th><td>{money(result.total)}</td><td>{money(paid.rows.reduce((s,p)=>s+p.receives,0))}</td><td>0 Gs.</td></tr></tfoot></table></div><p className="sp-muted">* Premios + devoluciones. Total conciliado: {money(result.total)}.</p>{paid.oddChips.map((ids,i)=>ids.length>0&&<p className="sp-refund" key={i}>{i===0?'Main Pot':'Side Pot '+i}: ficha sobrante de {money(result.unit)} para {ids.map(name).join(', ')}.</p>)}</>}</>}
   </div>
  </div>}
 </section>;
}
