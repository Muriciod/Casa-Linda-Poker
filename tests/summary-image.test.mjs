import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../lib/summary-image.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {renderSummaryImage}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
let labels=[],pictures=0;
globalThis.Image=class {naturalWidth=80;naturalHeight=120;set src(url){queueMicrotask(()=>url.includes('missing')?this.onerror?.():this.onload?.());}};
const context=new Proxy({fillText:(text,x,y)=>labels.push({text,x,y,font:context.font,color:context.fillStyle}),measureText:text=>({width:text.length*12}),drawImage:()=>pictures++,createRadialGradient:()=>({addColorStop(){}})},{get:(obj,key)=>obj[key]??(()=>{})});
globalThis.document={createElement:()=>({getContext:()=>context})};
const fixture=n=>({name:'Prueba',date:'14 nov.',mode:'CASHGAME · real',gameMode:'cash',blinds:'200 / 400',duration:'1h 30m',legacy:false,players:Array.from({length:n},(_,i)=>({name:`Player ${i}`,avatarUrl:i===1?'missing.png':'photo.png',invested:200000,cashOut:350000-i*30000,net:150000-i*30000,rebuys:1}))});
test('ten-player export has all ten ranks, full capital, independent net result and loaded photos',async()=>{labels=[];pictures=0;const input=fixture(10),original=JSON.stringify(input);const c=await renderSummaryImage(input);assert.equal(c.width,1080);assert.equal(c.height,1920);for(const p of input.players)assert.ok(labels.some(x=>x.text===p.name));assert.ok(labels.some(x=>x.text==='350.000 Gs.'));assert.ok(labels.some(x=>x.text==='+150.000 Gs.'));assert.ok(pictures>=10);assert.equal(JSON.stringify(input),original);assert.ok(labels.every(x=>x.y<c.height));});
test('more than ten players extends the export instead of truncating the ranking',async()=>{labels=[];const c=await renderSummaryImage(fixture(12));assert.equal(c.height,2132);assert.ok(labels.some(x=>x.text==='Player 11'));assert.ok(labels.every(x=>x.y<c.height));});
test('missing photos and historical capital use fallbacks and remain exportable',async()=>{labels=[];const data=fixture(6);data.legacy=true;data.players.forEach(p=>{p.avatarUrl='missing.png';p.cashOut=null;});const c=await renderSummaryImage(data);assert.equal(c.height,1920);assert.equal(labels.filter(x=>x.text==='No registrado').length,6);assert.ok(!labels.some(x=>x.text.includes('NaN')));});

// Identical input values must retain rank, sign, capital and avatars in both visual themes.
test('chips theme prioritizes position and name while preserving the exact numeric results',async()=>{
 const input=fixture(10);input.gameMode='chips';input.mode='Fichas';input.players.reverse();
 const original=JSON.stringify(input);labels=[];pictures=0;
 await renderSummaryImage(input);
 const heroRank=labels.find(x=>x.text==='01'),name=labels.find(x=>x.text==='Player 0'),result=labels.find(x=>x.text==='+150.000 fichas');
 const size=x=>Number(x.font.match(/(\d+)px/)[1]);
 assert.ok(size(heroRank)>size(name)&&size(name)>size(result));
 assert.equal(result.color,'#c7b3e2');
 assert.ok(labels.some(x=>x.text==='−120.000'&&x.color==='#bca7b5'));
 assert.ok(labels.some(x=>x.text==='FICHAS · RECREATIVO'));
 assert.ok(labels.some(x=>x.text.includes('sin valor monetario')));
 assert.ok(labels.some(x=>x.text==='350.000'));
 assert.ok(!labels.some(x=>x.text.includes('Gs.')||['#74ddc1','#f6ad8b'].includes(x.color)));
 assert.deepEqual(labels.filter(x=>/^Player /.test(x.text)).slice(1).map(x=>x.text),fixture(10).players.map(p=>p.name));
 assert.ok(pictures>=10);assert.equal(JSON.stringify(input),original);
});
test('cash retains money, strong result colors and winner amount emphasis',async()=>{
 labels=[];await renderSummaryImage(fixture(10));
 assert.ok(labels.some(x=>x.text==='CASHGAME · REAL'));
 assert.ok(labels.some(x=>x.text==='+150.000 Gs.'&&x.color==='#74ddc1'&&x.font.includes('46px')));
 assert.ok(labels.some(x=>x.text==='−120.000 Gs.'&&x.color==='#f6ad8b'));
 assert.ok(labels.some(x=>x.text==='CAPITAL FINAL'));assert.ok(!labels.some(x=>x.text.includes('recreativa')));
});
test('temporary export stays distinct and historical chips never invent missing capital',async()=>{
 labels=[];const input=fixture(1);input.gameMode='temporary';input.mode='Temporal';await renderSummaryImage(input);
 assert.ok(labels.some(x=>x.text==='TEMPORAL'));assert.ok(!labels.some(x=>x.text==='FICHAS · RECREATIVO'));
 input.gameMode='chips';input.legacy=true;input.players[0].cashOut=null;labels=[];await renderSummaryImage(input);
 assert.ok(labels.some(x=>x.text==='No registrado'));assert.ok(labels.some(x=>x.text==='Sin detalle'));
});
