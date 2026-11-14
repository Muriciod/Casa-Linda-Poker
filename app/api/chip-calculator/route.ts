import { requireAdmin } from '../../../lib/admin-auth';
import { ensureAppSchema } from '../../../lib/app-storage';
import { DEFAULT_CONFIG, COLOR_CONFIG, caseId, validateState } from '../../../lib/chip-calculator';
function selected(request?:Request){const n=request?new URL(request.url).searchParams.get('case'):null;if(n!==null&&n!=='1'&&n!=='2')throw new Response('Maletín no válido',{status:400});return n==='2'?2:1;}
const storageKey=(id:number)=>id===2?'chip_calculator_case2_v1':'chip_calculator_v1';
const headers={'Cache-Control':'private, no-store'};
const json=(body:unknown,status=200)=>Response.json(body,{status,headers});
export async function GET(request?:Request) {
  try{const id=selected(request),key=storageKey(id);const db=await ensureAppSchema();const row=await db.prepare('SELECT value FROM poker_settings WHERE key = ?').bind(key).first<{value:string}>();return json({state:row?JSON.parse(row.value):{config:id===2?COLOR_CONFIG:DEFAULT_CONFIG,session:null},revision:row?.value??null});}
  catch(e){if(e instanceof Response)return e;return json({error:'No se pudo recuperar el inventario guardado.'},500);}
}
export async function PUT(request:Request) {
  try{
    await requireAdmin(request);
    const id=selected(request),key=storageKey(id);
    const text=await request.text();if(text.length>250000)return json({error:'La configuración es demasiado grande.'},400);
    let body;try{body=JSON.parse(text);validateState(body.state);if(caseId(body.state.config)!==id)throw Error();if(body.revision!==null&&typeof body.revision!=='string')throw Error();}catch{return json({error:'Revisá la configuración y los movimientos del banco.'},400);}
    const db=await ensureAppSchema(),next=JSON.stringify(body.state);
    if(id===1 && body.state.session && ![100,1000].includes(body.state.session.config.pointValue)){
      const current=await db.prepare('SELECT value FROM poker_settings WHERE key = ?').bind(key).first<{value:string}>();
      const old=current?JSON.parse(current.value).session:null;
      if(!old||JSON.stringify(old.config)!==JSON.stringify(body.state.session.config)||JSON.stringify(old.stacks)!==JSON.stringify(body.state.session.stacks))return json({error:'Los nuevos repartos solo admiten escalas ×100 y ×1.000.'},400);
    }
    const row=body.revision===null
      ? await db.prepare('INSERT INTO poker_settings (key,value) VALUES (?,?) ON CONFLICT(key) DO NOTHING RETURNING key').bind(key,next).first()
      : await db.prepare('UPDATE poker_settings SET value=?, updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=? RETURNING key').bind(next,key,body.revision).first();
    if(!row)return json({error:'Otro dispositivo actualizó la calculadora. Recargá los datos antes de guardar.'},409);
    return json({state:body.state,revision:next});
  }catch(e){if(e instanceof Response)return e;return json({error:'No se pudo guardar. Tus datos anteriores siguen intactos.'},500);}
}
