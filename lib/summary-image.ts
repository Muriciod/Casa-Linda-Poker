/** Export presentation only. Values arrive already calculated; mode changes labels and styling, never conversion or ranking. */
export type SummaryImagePlayer = { name: string; avatarUrl?: string; invested: number; cashOut: number | null; net: number; rebuys: number };
export type SummaryImageData = { name: string; date: string; mode: string; gameMode: "chips" | "cash" | "temporary"; blinds: string; duration: string; legacy: boolean; players: SummaryImagePlayer[] };
const cashPalette = { bg: '#0c0c10', panel: '#1b1a20', white: '#f7f4f5', muted: '#aaa5b1', line: '#37323d', accent: '#a72b3a', positive: '#74ddc1', loss: '#f6ad8b', glow: '#44202c', geometry: '#9e6c7e', badge: '#291d25', badgeBorder: '#69404c', hero: '#231e27', heroBorder: '#6e4858', firstRow: '#202a29', firstBorder: '#426459', row: '#1b1a20', alternateRow: '#15151b', rowBorder: '#2b2831', avatar: '#3b303c', avatarBorder: '#62525e', suits: '#896270' };
const chipsPalette: typeof cashPalette = { bg: '#13121a', panel: '#201e29', white: '#eeebf4', muted: '#b0aabf', line: '#3d374c', accent: '#8f7aaa', positive: '#c7b3e2', loss: '#bca7b5', glow: '#342a47', geometry: '#897699', badge: '#30293d', badgeBorder: '#665775', hero: '#292334', heroBorder: '#655575', firstRow: '#30283e', firstBorder: '#655575', row: '#24212e', alternateRow: '#1e1c27', rowBorder: '#393343', avatar: '#3f354d', avatarBorder: '#786585', suits: '#a191b4' };
function loadImage(url?: string): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  return new Promise(resolve => {
    const img = new Image();
    const timer = setTimeout(() => finish(null), 7000);
    function finish(value: HTMLImageElement | null) { clearTimeout(timer); img.onload = img.onerror = null; resolve(value); }
    img.crossOrigin = 'anonymous';
    img.onload = () => finish(img.naturalWidth ? img : null);
    img.onerror = () => finish(null);
    img.src = url;
  });
}
export async function renderSummaryImage(data: SummaryImageData): Promise<HTMLCanvasElement> {
  const recreational = data.gameMode === 'chips';
  const palette = recreational ? chipsPalette : cashPalette;
  const number = (n: number) => Math.round(n).toLocaleString('es-PY');
  const amount = (n: number) => `${number(n)} ${recreational ? 'fichas' : 'Gs.'}`;
  const signed = (n: number, withUnit = true) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${withUnit ? amount(Math.abs(n)) : number(Math.abs(n))}`;
  const color = (n: number) => n > 0 ? palette.positive : n < 0 ? palette.loss : palette.muted;
  const players = [...data.players].sort((a,b) => b.net-a.net);
  const [logo, ...photos] = await Promise.all([loadImage('/images/brand/logo-168.webp'), ...players.map(p=>loadImage(p.avatarUrl))]);
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1920 + Math.max(0, players.length - 10) * 106;
  const c = canvas.getContext('2d');
  if (!c) throw new Error('No se pudo crear la imagen.');
  const text = (value: string, x: number, y: number, size=24, fill=palette.white, weight=400, align: CanvasTextAlign='left', maxWidth=950) => {
    c.fillStyle=fill; c.textAlign=align; c.font=`${weight} ${size}px Arial, sans-serif`;
    // Never squeeze names or let unusually long values overlap adjacent columns.
    let shown=value;
    while (shown.length>1 && c.measureText(shown).width>maxWidth) shown=shown.slice(0,-1);
    if(shown!==value) shown=shown.slice(0,-1)+'…';
    c.fillText(shown,x,y); c.textAlign='left';
  };
  const box=(x:number,y:number,w:number,h:number,fill:string,stroke=palette.line,r=22)=>{
    c.beginPath();c.roundRect(x,y,w,h,r);c.fillStyle=fill;c.fill();c.strokeStyle=stroke;c.lineWidth=1;c.stroke();
  };
  const avatar=(photo:HTMLImageElement|null,name:string,x:number,y:number,size:number)=>{
    c.save();c.beginPath();c.arc(x+size/2,y+size/2,size/2,0,Math.PI*2);c.clip();
    c.fillStyle=palette.avatar;c.fillRect(x,y,size,size);
    if(photo){const side=Math.min(photo.naturalWidth,photo.naturalHeight);c.drawImage(photo,(photo.naturalWidth-side)/2,(photo.naturalHeight-side)/2,side,side,x,y,size,size);}
    else text(name.trim().split(/\s+/).slice(0,2).map(s=>s[0]).join('').toUpperCase()||'♠',x+size/2,y+size*.65,size*.34,palette.white,700,'center',size*.85);
    c.restore();c.beginPath();c.arc(x+size/2,y+size/2,size/2,0,Math.PI*2);c.strokeStyle=palette.avatarBorder;c.lineWidth=2;c.stroke();
  };
  c.fillStyle=palette.bg;c.fillRect(0,0,1080,canvas.height);
  const glow=c.createRadialGradient(960,100,0,960,100,950);glow.addColorStop(0,palette.glow);glow.addColorStop(1,palette.bg);c.fillStyle=glow;c.fillRect(0,0,1080,canvas.height);
  c.fillStyle=palette.accent;c.fillRect(0,0,1080,8);
  // Fine playmat-style geometry, kept away from the data.
  c.save();c.globalAlpha=.17;c.strokeStyle=palette.geometry;c.lineWidth=1;
  for(let x=650;x<1500;x+=90){c.beginPath();c.moveTo(x,0);c.lineTo(x-500,500);c.stroke();}c.restore();
  avatar(logo,'♠',58,54,76);
  text('CASA LINDA',155,87,28,palette.white,700);text('P O K E R   C L U B',155,117,16,palette.muted,600);
  box(756,66,264,46,palette.badge,palette.badgeBorder,23);text(recreational ? 'FICHAS · RECREATIVO' : data.gameMode === 'cash' ? 'CASHGAME · REAL' : data.mode.toUpperCase(),888,96,17,palette.white,600,'center',240);
  text('Resultados de la noche',60,207,59,palette.white,700);
  text(data.name,60,251,26,palette.muted,400,'left',610);text(data.date,1020,251,22,palette.muted,400,'right',360);
  const winner=players[0];
  box(60,286,960,208,palette.hero,palette.heroBorder,28);
  c.fillStyle=palette.accent;c.beginPath();c.roundRect(60,310,5,158,2);c.fill();
  if(winner && recreational){
    text('01',102,435,132,palette.positive,700,'left',178);
    text('PUESTO',111,464,15,palette.muted,600);
    c.strokeStyle=palette.line;c.beginPath();c.moveTo(287,321);c.lineTo(287,460);c.stroke();
    avatar(photos[0],winner.name,314,327,76);
    text(winner.name,414,369,46,palette.white,700,'left',558);
    text(winner.net>0?'GANADOR DE LA NOCHE':'MEJOR RESULTADO',414,403,17,palette.muted,500);
    text(signed(winner.net),414,450,25,color(winner.net),500,'left',558);
  }else if(winner){
    avatar(photos[0],winner.name,88,329,112);
    text(winner.net>0?'♛  GANADOR DE LA NOCHE':'♠  MEJOR RESULTADO',230,329,19,'#ded0d8',700);
    text(winner.name,230,385,45,palette.white,700,'left',540);
    text(signed(winner.net),230,449,46,color(winner.net),700,'left',570);
    text('01',975,423,102,'#513746',700,'right');
  }else{text('Mesa sin resultados',104,386,40,palette.white,700);}
  const metrics=[['JUGADORES',String(players.length)],[recreational?'FICHAS EN JUEGO':'TOTAL INGRESADO',data.legacy?'Sin detalle':recreational?number(players.reduce((s,p)=>s+p.invested,0)):amount(players.reduce((s,p)=>s+p.invested,0))],['DURACIÓN',data.duration]];
  metrics.forEach(([label,value],i)=>{const x=60+i*328;box(x,516,304,98,palette.panel);text(label,x+22,548,15,palette.muted,700);text(value,x+22,588,28,palette.white,recreational && i===1 ? 500 : 700,'left',263);});
  text('RANKING FINAL',60,662,20,palette.white,700);text(recreational?'FICHAS FINALES':'CAPITAL FINAL',748,662,17,palette.muted,700,'right');text(recreational?'BALANCE · FICHAS':'RESULTADO NETO',990,662,17,palette.muted,700,'right');
  const rowStep = players.length > 10 ? 106 : 1060 / Math.max(6, players.length);
  players.forEach((p,i)=>{
    const y=686+i*rowStep;
    const center=y+(rowStep-8)/2;
    box(60,y,960,rowStep-8,i===0?palette.firstRow:i%2===0?palette.row:palette.alternateRow,i===0?palette.firstBorder:palette.rowBorder,17);
    text(String(i+1).padStart(2,'0'),98,center+9,recreational?30:21,i===0?palette.positive:palette.muted,700,'center');
    avatar(photos[i],p.name,126,center-32,64);
    text(p.name,210,center-10,recreational?29:27,palette.white,700,'left',300);
    text(data.legacy?'Sesión histórica':`${recreational?'Entrada':'Ingresó'} ${amount(p.invested)}`,210,center+19,18,palette.muted,400,'left',310);
    text(p.cashOut===null?'No registrado':recreational?number(p.cashOut):amount(p.cashOut),748,center+7,p.cashOut===null?19:recreational?22:24,recreational?palette.muted:palette.white,500,'right',205);
    text(signed(p.net,!recreational),990,center+7,recreational?23:27,color(p.net),recreational?500:700,'right',223);
  });
  const footer=canvas.height-112;
  c.strokeStyle=palette.line;c.beginPath();c.moveTo(60,footer-28);c.lineTo(1020,footer-28);c.stroke();
  text(recreational?'Modo fichas · partida recreativa · sin valor monetario':'Capital final = cash-out   ·   Resultado neto = ganancia o pérdida',60,footer,20,palette.muted);
  text(`Ciegas ${data.blinds}   ·   ${data.legacy?'Registro histórico':players.reduce((s,p)=>s+p.rebuys,0)+' recompras'}`,60,footer+37,20,palette.muted,400,'left',670);
  text('casalindapoker.com',1020,footer+37,22,palette.white,700,'right');
  text('♠   ♥   ♣   ♦',1020,footer-3,22,palette.suits,400,'right');
  return canvas;
}
