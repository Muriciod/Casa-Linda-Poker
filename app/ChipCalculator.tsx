"use client";
import { useEffect, useRef, useState } from 'react';
import { DENOMS, COLOR_CONFIG, COLOR_VALUES, chipValues, monetaryValue, DEFAULT_CONFIG, type Config, type Result, type SavedState, count, value, subtract, blinds, sessionBank, validateConfig } from '../lib/chip-calculator';
import './chip-calculator.css';
import { DENOMINATION_STORAGE_KEY, denominationPreferences, restoreDenominationPreferences } from '../lib/chip-denomination-preferences';
const names=['Blanca','Roja','Verde','Negra','Morada','Amarilla'];
const colorNames=['Blanca','Roja','Verde','Azul','Negra'];
const chipName=(c:Config,i:number)=>c.caseId===2?colorNames[i]:names[i];
const chipLabel=(c:Config,i:number)=>c.caseId===2?colorNames[i]:money(chipValues(c)[i]);
const caseLabel=(c:Config)=>c.caseId===2?'Maletín 2 · Fichas por colores':'Maletín 1 · Fichas numeradas';
const equivalenceLabel=(c:Config)=>c.caseId===2?(c.autoValues===false?'Valores personalizados':'Valores automáticos'):`1 punto = ${money(c.pointValue)}`;
const number=(n:number)=>n.toLocaleString('es-PY',{maximumFractionDigits:6});
const money=(n:number)=>`${number(n)} Gs.`;
// Original numbered chips, left to right: white, red, green, black, purple, yellow.
const chipPhotoCenters=[97,297,499,699,901,1102];
// Source photo order is white, blue, green, red, black; UI remains white, red, green, blue, black.
// Individual full-rim bounds; the photos have different centers and diameters.
const colorPhotoBounds=['14 19 132 133','438.5 18.5 130 130','295 17 137 137','153 18 135 136','577 20 138 137'];
function Chip({i,config=DEFAULT_CONFIG}: {i:number;config?:Config}) {
 const label=`Ficha ${chipName(config,i)}${config.caseId===2?'':` · ${number(DENOMS[i])} puntos`} · ${money(chipValues(config)[i])}`;
 if(config.caseId!==2)return <span className="physical-chip physical-chip-photo" role="img" aria-label={label}><svg viewBox={`${chipPhotoCenters[i]-87} 30 174 174`} aria-hidden="true" focusable="false"><image href="/images/chips/case-one-original.png" width="1195" height="233"/></svg></span>;
 return <span className="physical-chip physical-chip-photo" role="img" aria-label={label}><svg viewBox={colorPhotoBounds[i]} preserveAspectRatio="none" aria-hidden="true" focusable="false"><image href={i===1?"/images/chips/case-two-red.png":"/images/chips/case-two-original.png"} width="725" height="160"/></svg></span>;
}
function StackCard({stack,config,title}:{stack:number[];config:Config;title:string}) {
  const n=count(stack);return <article className="chip-stack-card"><header><h3>{title}</h3><span className="chip-efficiency">{n<=14?'Reparto compacto':'Reparto ampliado'} · {n} fichas</span></header><div className="chip-stack-lines">{stack.map((qty,i)=>qty>0&&<div key={i}><Chip i={i} config={config}/><span><strong>{qty} × {chipLabel(config,i)}</strong><small>{chipName(config,i)} · {money(chipValues(config)[i])} cada una</small></span><b>{money(qty*chipValues(config)[i])}</b></div>)}</div><footer><strong>{money(monetaryValue(stack,config))}</strong><span>{number(config.buyIn/blinds(config).big)}bb</span></footer></article>;
}
const followSmallBlind=(original:Config):Config=>{const c={...original,mode:'balanced' as const};return c.caseId===2?{...c,autoValues:c.autoValues===true,pointValue:1,equivalence:'manual'}:({...c,pointValue:[100,1000].includes(c.pointValue)?c.pointValue:1000,equivalence:[100,1000].includes(c.pointValue)?c.equivalence??"auto":"auto"});};
export default function ChipCalculator({canEdit}:{canEdit:boolean}) {
  const [selected,setSelected]=useState<1|2>(1);
  const drafts=useRef<Partial<Record<1|2,Config>>>({});
  const [switchLocked,setSwitchLocked]=useState(false);
  return <div><section className="chip-case-selector no-chip-print"><h2>Seleccionar maletín</h2><div className="chip-mode-picker">{([1,2] as const).map(id=><button key={id} disabled={switchLocked} aria-pressed={selected===id} onClick={()=>setSelected(id)}><strong>{id===1?'Maletín 1 — Fichas numeradas':'Maletín 2 — Fichas por colores'}</strong><span className="chip-case-rack" aria-hidden="true">{(id===1?DENOMS:COLOR_VALUES).map((_,i)=><Chip key={i} i={i} config={id===1?DEFAULT_CONFIG:COLOR_CONFIG}/>)}</span><small>{id===1?'6 denominaciones · escalas ×100 y ×1.000':'5 colores · valores e inventario independientes'}</small></button>)}</div></section><CaseCalculator key={selected} selected={selected} canEdit={canEdit} draft={drafts.current[selected]} onDraft={c=>{drafts.current[selected]=c;}} onBusy={setSwitchLocked}/></div>;
}
function CaseCalculator({canEdit,selected,draft,onDraft,onBusy}:{canEdit:boolean;selected:1|2;draft?:Config;onDraft:(c:Config)=>void;onBusy:(b:boolean)=>void}) {
  const defaults=selected===2?COLOR_CONFIG:DEFAULT_CONFIG;
  const endpoint='/api/chip-calculator'+(selected===2?'?case=2':'');
  const [config,setConfig]=useState<Config>(followSmallBlind(structuredClone(draft??defaults)));
  const [stored,setStored]=useState<SavedState>({config:structuredClone(defaults),session:null});
  const [revision,setRevision]=useState<string|null>(null);
  const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[calculating,setCalculating]=useState(false);
  const [result,setResult]=useState<Result|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [alternatives,setAlternatives]=useState<{label:string;reason:string;result:Result}[]>([]);
  const [preferenceNotice,setPreferenceNotice]=useState('');
  const [started,setStarted]=useState(false);
  const [showConfirmed,setShowConfirmed]=useState(false);
  const worker=useRef<Worker|null>(null);
  async function load(useDraft=false){setError('');try{const response=await fetch(endpoint,{cache:'no-store'}),data=await response.json();if(!response.ok)throw Error(data.error);setStored({...data.state,config:followSmallBlind(data.state.config)});let next=useDraft&&draft?draft:data.state.config;if(selected===2&&!(useDraft&&draft)){try{next=restoreDenominationPreferences(next,localStorage.getItem(DENOMINATION_STORAGE_KEY));}catch{next=restoreDenominationPreferences(next,null);}}setConfig(followSmallBlind(next));setRevision(data.revision);setReady(true);setResult(null);}catch(e){setError(e instanceof Error?e.message:'No se pudo cargar.');}}
  useEffect(()=>{void load(true);return()=>worker.current?.terminate();},[]);
  useEffect(()=>{onDraft(config);},[config]);
  useEffect(()=>{if(!ready||selected!==2)return;const preferences=denominationPreferences(config);if(!preferences)return;try{localStorage.setItem(DENOMINATION_STORAGE_KEY,JSON.stringify(preferences));setPreferenceNotice('Modo y valores personalizados guardados en este dispositivo.');}catch{setPreferenceNotice('No se pudo guardar en este dispositivo.');}},[ready,selected,config.autoValues,config.chipValues]);
  useEffect(()=>{onBusy(busy||!ready);},[busy,ready]);
  function update(next:Partial<Config>){setAlternatives([]);worker.current?.terminate();setCalculating(false);setConfig(c=>followSmallBlind({...c,...next}));setResult(null);setError('');setNotice('');}
  async function save(state:SavedState,message:string){
    if(!canEdit||busy||!ready)return;
    setBusy(true);setError('');setNotice('');
    try{const response=await fetch(endpoint,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({state,revision})}),data=await response.json();if(!response.ok)throw Error(data.error);setStored(data.state);setRevision(data.revision);setNotice(message);return true;}catch(e){setError(e instanceof Error?e.message:'No se pudo guardar.');}finally{setBusy(false);}
  }
  useEffect(()=>{if(!started)return;const timer=setTimeout(calculate,350);return()=>{clearTimeout(timer);worker.current?.terminate();};},[config]);
  function calculate(){setStarted(true);setAlternatives([]);worker.current?.terminate();setCalculating(true);setError('');setResult(null);setNotice('');try{const w=new Worker(new URL('../lib/chip-calculator.worker.ts',import.meta.url),{type:'module'});worker.current=w;w.onmessage=({data})=>{setCalculating(false);if(data.error)setError(data.error);else {setAlternatives(data.alternatives);setResult(data.alternatives[0].result);setShowConfirmed(false);}w.terminate();};w.onerror=()=>{setCalculating(false);setError('No se pudo ejecutar la calculadora. Intentá de nuevo.');w.terminate();};w.postMessage(config);}catch{setCalculating(false);setError('El navegador no pudo iniciar la calculadora.');}}
  const active=result&&!showConfirmed?null:stored.session;
  const bank=active?sessionBank(active):result?.bank;
  const bankConfig=active?.config??result?.config;
  const opening=active?active.stacks.reduce((a,r)=>subtract(a,r),[...active.config.inventory]):result?.bank;
  const b=blinds(config);
  async function copy(){if(!result)return;const c=result.config;const common=result.stacks.every(r=>r.join()===result.stacks[0].join());const lines=['🃏 CASA LINDA · REPARTO DE FICHAS',`${c.players} jugadores · ${money(c.buyIn)} por jugador`, `${caseLabel(c)} · ${equivalenceLabel(c)} · Ciegas ${money(blinds(c).small)} / ${money(blinds(c).big)}`, ...result.stacks.flatMap((row,i)=>common&&i>0?[]:[common?'Cada jugador:':`Jugador ${i+1}:`,...row.flatMap((n,j)=>n?[`${n} × ficha ${chipLabel(c,j)} = ${money(n*chipValues(c)[j])}`]:[]),`${count(row)} fichas · ${number(c.buyIn/blinds(c).big)}bb`]),'Banco: '+result.bank.map((n,i)=>`${n} × ${chipLabel(c,i)}`).join(' · '),...result.warnings];try{await navigator.clipboard.writeText(lines.join('\n'));setNotice('Reparto copiado para WhatsApp.');}catch{setError('No se pudo copiar. Permití el acceso al portapapeles o usá Imprimir reparto.');}}
  async function confirm(){if(!result)return;if(!window.confirm(stored.session?'¿Reemplazar el reparto confirmado y su registro de cambios? El inventario guardado se conserva.':'¿Confirmar este reparto y abrir su banco? El inventario guardado se conserva.'))return;const saved=await save({...stored,session:{config:result.config,stacks:result.stacks,changes:[]}},'Reparto confirmado. El banco quedó guardado.');if(saved)setShowConfirmed(true);}
  const same=result?.stacks.every(row=>row.join()===result.stacks[0].join());
  return <section className="chip-calculator">
    <header className="chip-calculator-hero"><span className="section-kicker">PREPARÁ LA PRÓXIMA MESA</span><h1>Calculadora de Fichas</h1><p>Pocas fichas. El valor exacto. Un banco listo para dar cambio.</p><div className="chip-hero-rack" aria-hidden="true">{chipValues(config).map((_,i)=><Chip key={i} i={i} config={config}/>)}</div><small>Herramienta independiente · no crea partidas ni modifica estadísticas</small></header>
    <div className="chip-config-panel no-chip-print"><div className="chip-section-title"><span>01</span><div><h2>Configuración</h2><p>Ingresá el buy-in, los jugadores y el stack. Comparamos valores de fichas por vos.</p></div></div>
      <fieldset disabled={busy||!ready}>
      {selected===2&&<section className="chip-values-editor"><h3>Denominaciones del Maletín 2</h3>
        <div className="chip-mode-picker" role="group" aria-label="Modo de denominación">
          <button type="button" aria-pressed={!config.autoValues} onClick={()=>update({autoValues:false})}><strong>Valores personalizados</strong><small>Usar exactamente los importes que configuraste.</small></button>
          <button type="button" aria-pressed={config.autoValues===true} onClick={()=>update({autoValues:true})}><strong>Valores automáticos (recomendados)</strong><small>Proponer denominaciones según buy-in, ciegas e inventario.</small></button>
        </div>
        <p className="chip-muted"><strong>Modo activo: {config.autoValues?'Automático':'Personalizado'}.</strong> {config.autoValues?'Los resultados mostrarán valores automáticos de la serie 1–2–5. Tus valores personalizados se conservan aparte.':'Solo cambia la cantidad de fichas del reparto; sus valores se mantienen exactamente como los ingresaste.'}</p>
        {!config.autoValues?<><div className="chip-inventory-grid">{chipValues(config).map((v,i)=><label key={i}><Chip i={i} config={config}/><strong>{colorNames[i]} · Gs.</strong><input aria-label={`Valor de ficha ${colorNames[i]}`} type="number" inputMode="numeric" min="1" step="1" value={v||''} onChange={e=>update({autoValues:false,chipValues:chipValues(config).map((n,j)=>j===i?Number(e.target.value):n)})}/></label>)}</div>
        <button type="button" className="secondary" onClick={()=>{if(window.confirm('¿Restaurar tus valores personalizados predeterminados? El banco confirmado conserva sus valores.'))update({autoValues:false,chipValues:[...COLOR_VALUES]});}}>Restaurar valores personalizados predeterminados</button></>:<button type="button" className="secondary" onClick={()=>update({autoValues:false})}>Ver o editar mis valores personalizados</button>}
        <p className="chip-muted" role="status">{preferenceNotice}{canEdit?' Usá Guardar configuración para compartirlos entre dispositivos.':''}</p>
      </section>}
      {selected===2&&!count(config.inventory)&&<p className="chip-warning" role="status">Completá el inventario del Maletín 2 para calcular un reparto exacto. No hay cantidades asignadas.</p>}
      <div className="chip-form-grid">
        <label>Buy-in por jugador · Gs.<input type="number" min="1" step="1" value={config.buyIn||''} onChange={e=>update({buyIn:Number(e.target.value)})}/></label>
        <label>Jugadores<select value={config.players} onChange={e=>update({players:Number(e.target.value)})}>{Array.from({length:9},(_,i)=><option key={i} value={i+2}>{i+2} jugadores</option>)}</select></label>
        <label>Stack inicial<select value={config.bb} onChange={e=>update({bb:Number(e.target.value) as 50|100})}><option value={50}>50bb</option><option value={100}>100bb</option></select></label>
      </div><details><summary>Opciones avanzadas</summary><div className="chip-form-grid">{selected===1&&<label>Escala monetaria<select value={config.equivalence==='manual'?String(config.pointValue):'auto'} onChange={e=>update(e.target.value==='auto'?{equivalence:'auto'}:{equivalence:'manual',pointValue:Number(e.target.value)})}><option value="auto">Automático (recomendado)</option><option value="100">Escala baja (×100)</option><option value="1000">Escala alta (×1.000)</option></select></label>}
        <label>Ciegas<select value={config.automatic?'auto':'manual'} onChange={e=>update({automatic:e.target.value==='auto',small:b.small,big:b.big})}><option value="auto">Calcular automáticamente</option><option value="manual">Definir manualmente</option></select></label>
        <label>Small Blind · Gs.<input type="number" min="1" step="1" disabled={config.automatic} value={b.small||''} onChange={e=>update({small:Number(e.target.value)})}/></label>
        <label>Big Blind · Gs.<input type="number" min="1" step="1" disabled={config.automatic} value={b.big||''} onChange={e=>update({big:Number(e.target.value)})}/></label>
      </div></details><div className="chip-stack-preview"><b>{money(config.buyIn)}</b><span>{selected===2?'Valores por color':config.equivalence==='manual'?number(config.buyIn/config.pointValue)+' puntos':'Valor de fichas: automático'}</span><span>{b.big>0?number(config.buyIn/b.big):'—'}bb efectivos</span><small>SB {money(b.small)} · BB {money(b.big)}</small></div>
      <details className="chip-inventory-editor"><summary>Inventario físico <span>{count(config.inventory)} fichas · {money(monetaryValue(config.inventory,config))}</span></summary><p>Configuración base. Simular o confirmar un reparto no descuenta estas cantidades.</p><div className="chip-inventory-grid">{chipValues(config).map((d,i)=><label key={i}><Chip i={i} config={config}/><strong>{chipLabel(config,i)}</strong><small>{selected===2?money(d):chipName(config,i)}</small><input aria-label={`Cantidad de fichas ${chipName(config,i)}`} type="number" min="0" max="1000" step="1" value={config.inventory[i]} onChange={e=>update({inventory:config.inventory.map((x,j)=>j===i?Number(e.target.value):x)})}/></label>)}</div><button type="button" className="secondary" onClick={()=>{if(window.confirm(selected===2?'¿Vaciar el inventario del formulario del Maletín 2? El banco confirmado no cambia.':'¿Restablecer el inventario del formulario a las 500 fichas originales? El banco confirmado no cambia.'))update({inventory:[...defaults.inventory]});}}>{selected===2?'Vaciar inventario':'Restablecer inventario'}</button></details>
      <div className="chip-actions"><button className="primary" onClick={calculate} disabled={calculating}>{calculating?'Buscando un reparto…':result?'Recalcular reparto':'Calcular reparto'}</button>{canEdit&&<button className="secondary" onClick={()=>{const issues=validateConfig(config);if(issues.length)setError(issues[0]);else void save({...stored,config},'Inventario y preferencias guardados.');}}>Guardar configuración</button>}</div></fieldset>
      {!canEdit&&<p className="chip-muted">Podés simular libremente. Solo el administrador puede guardar la configuración y confirmar movimientos.</p>}
      {!ready&&<p role="status">Cargando configuración guardada…</p>}
    </div>
    {error&&<div className="chip-error no-chip-print" role="alert">{error}<button className="secondary" disabled={busy} onClick={()=>{if(window.confirm('¿Recargar los datos guardados? Se descartarán los cambios del formulario sin guardar.'))void load();}}>Recargar datos guardados</button></div>}
    <p className="chip-notice no-chip-print" role="status">{notice|| (busy?'Guardando…':'')}</p>
    {alternatives.length>0&&<div className="chip-mode-picker no-chip-print">{alternatives.map(a=><button key={a.label} aria-pressed={result===a.result} onClick={()=>{setResult(a.result);setShowConfirmed(false);}}><strong>{a.label} · {equivalenceLabel(a.result.config)}</strong><small>{a.reason}</small></button>)}</div>}
    {result&&<section className="chip-results"><div className="chip-section-title"><span>02</span><div><h2>Reparto recomendado por jugador</h2><p>{result.config.players} jugadores · {equivalenceLabel(result.config)} · Equilibrado</p></div></div><p className="chip-muted">{selected===2?(result.config.autoValues===false?'Cada color conserva el valor manual que configuraste.':'Valores recomendados para este buy-in. El banco confirmado conservará estos importes.'):'Los valores de las fichas se ajustan automáticamente según la partida. Solamente utilizamos dos escalas: ×100 y ×1.000.'}</p><div className="chip-inventory-grid">{chipValues(result.config).map((d,i)=><div key={i}><Chip i={i} config={result.config}/><p>{chipName(result.config,i)} · {money(d)}</p></div>)}</div><div className="chip-result-meta"><span>SIMULACIÓN</span><span>{count(result.stacks.flat())} fichas entregadas</span><span>{money(result.config.buyIn*result.config.players)} en la mesa</span></div>
      {result.warnings.map(w=><p key={w} className="chip-warning">{w}</p>)}
      <p className="chip-muted">{result.bigBlindPayments>0?`Cada jugador puede pagar al menos ${result.bigBlindPayments} ${result.bigBlindPayments===1?'BB exacta':'BB exactas'} con fichas distintas.`:'Reparto exacto, pero no todos pueden pagar la BB sin cambio.'} {result.changePayments>0?`El banco puede devolver la diferencia de la SB al menos ${result.changePayments} ${result.changePayments===1?'vez':'veces'}.`:result.smallBlindDirect?'Todos pueden pagar la SB exacta.':''}</p>
      {same?<><StackCard stack={result.stacks[0]} config={result.config} title={`Mismo reparto para los ${result.config.players} jugadores`}/><details className="chip-individual"><summary>Ver detalle por jugador</summary><div className="chip-cards-grid">{result.stacks.map((row,i)=><StackCard key={i} stack={row} config={result.config} title={`Jugador ${i+1}`}/>)}</div></details></>:<div className="chip-cards-grid">{result.stacks.map((row,i)=><StackCard key={i} stack={row} config={result.config} title={`Jugador ${i+1}`}/>)}</div>}
      <div className="chip-actions no-chip-print"><button className="secondary" onClick={copy}>Copiar reparto</button><button className="secondary" onClick={()=>window.print()}>Imprimir reparto</button>{canEdit&&<button className="primary" disabled={busy} onClick={confirm}>Confirmar reparto y abrir banco</button>}</div>
    </section>}
    {result&&stored.session&&<div className="chip-mode-picker no-chip-print" role="group" aria-label="Banco a consultar"><button aria-pressed={!showConfirmed} onClick={()=>setShowConfirmed(false)}>Banco de la simulación</button><button aria-pressed={showConfirmed} onClick={()=>setShowConfirmed(true)}>Banco confirmado</button></div>}
    {bank&&bankConfig&&opening&&<section className={`chip-bank ${active&&result?"no-chip-print":""}`}><div className="chip-section-title"><span>03</span><div><h2>Banco de fichas</h2><p>{active?'REPARTO CONFIRMADO · guardado entre dispositivos':'SIMULACIÓN · todavía no se descontó ninguna ficha'}</p></div></div>
      {active&&active.config.caseId!==2&&![100,1000].includes(active.config.pointValue)&&<p className="chip-warning">Banco anterior con una escala retirada. Se conserva su valor original para no alterar los movimientos. Los nuevos repartos usan solo ×100 o ×1.000.</p>}
      {active&&result&&<p className="chip-warning">Este banco pertenece al reparto confirmado, no a la nueva simulación. Confirmá la nueva propuesta para reemplazarlo.</p>}
      <p className="chip-muted">{caseLabel(bankConfig)} · {bankConfig.players} jugadores · {money(bankConfig.buyIn)} por jugador · {equivalenceLabel(bankConfig)}</p>
      {active&&<details className="chip-individual"><summary>Ver reparto confirmado por jugador</summary><div className="chip-cards-grid">{active.stacks.map((row,i)=><StackCard key={i} stack={row} config={active.config} title={`Jugador ${i+1} · reparto inicial`}/>)}</div></details>}
      <div className="chip-table-scroll"><table><thead><tr><th>Ficha</th><th>Inventario</th><th>Repartidas</th><th>Banco inicial</th><th>Banco actual</th></tr></thead><tbody>{chipValues(bankConfig).map((d,i)=><tr key={i}><th><Chip i={i} config={bankConfig}/><span>{chipLabel(bankConfig,i)}<small>{bankConfig.caseId===2?money(d):chipName(bankConfig,i)}</small></span></th><td>{bankConfig.inventory[i]}</td><td>{bankConfig.inventory[i]-opening[i]}</td><td>{opening[i]}</td><td className={bank[i]<5?'chip-low':''}>{bank[i]}{bank[i]<5&&<small>{bank[i]===0?'Agotada':'Pocas'}</small>}</td></tr>)}</tbody></table></div>
      <div className="chip-bank-metrics"><div><small>En la mesa</small><b>{money(bankConfig.buyIn*bankConfig.players)}</b><span>{count(bankConfig.inventory)-count(bank)} fichas actuales</span></div><div><small>En el banco</small><b>{money(monetaryValue(bank,bankConfig))}</b><span>{count(bank)} fichas disponibles</span></div><div><small>Tres denominaciones menores</small><b>{count(bank.slice(0,3))}</b><span>{count(bank.slice(0,3))<bankConfig.players*3?'Cambio limitado':'Disponibles para cambio'}</span></div></div>
      {active&&<div className="chip-change no-chip-print">
      {active.changes.length>0&&<details><summary>Ver registro de cambios</summary><ol>{active.changes.map((x,i)=><li key={i}>Recibida 1 × {chipLabel(bankConfig,x.denomination)} → entregadas {x.given.flatMap((n,j)=>n?[`${n} × ${chipLabel(bankConfig,j)}`]:[]).join(' + ')}</li>)}</ol></details>}{canEdit&&<div className="chip-actions"><button className="secondary" disabled={busy||!active.changes.length} onClick={()=>save({...stored,session:{...active,changes:active.changes.slice(0,-1)}},'Último cambio deshecho.')}>Deshacer último cambio</button><button className="secondary" disabled={busy} onClick={()=>{if(window.confirm('¿Cerrar este banco y borrar su registro de cambios? La configuración base se conserva.'))void save({...stored,session:null},'Banco cerrado.');}}>Cerrar banco</button></div>}
      </div>}
    </section>}
  </section>;
}
