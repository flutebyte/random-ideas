// ORB direction with a SHORT fixed hold (1m candles, 7d). Entry: first 1m close outside the 09:30-09:35 range; exit after HOLD minutes at market.
import { fetchCandles } from '../src/engine/data.js';
const f = await fetchCandles('SPX500','1m','7d'), c = f.candles, COST = 0.6;
const fmt = new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'numeric',minute:'numeric',hour12:false,year:'numeric',month:'2-digit',day:'2-digit'});
const ny=t=>{const p=Object.fromEntries(fmt.formatToParts(new Date(t)).map(x=>[x.type,x.value]));return{d:`${p.year}-${p.month}-${p.day}`,m:(p.hour%24)*60+Number(p.minute)}};
const days={};c.forEach(b=>{const n=ny(b.t);(days[n.d]||=[]).push({...b,m:n.m})});
for (const hold of [3,6,9,15]) { let n=0,w=0,pts=0;
  for (const bars of Object.values(days)) { const or=bars.filter(b=>b.m>=570&&b.m<575); if(or.length<4) continue;
    const hi=Math.max(...or.map(b=>b.h)),lo=Math.min(...or.map(b=>b.l)), rest=bars.filter(b=>b.m>=575&&b.m<=690);
    for (let i=0;i<rest.length-hold;i++){ const b=rest[i]; if(b.c>hi||b.c<lo){ const buy=b.c>hi,x=rest[i+hold].c; const p=(buy?x-b.c:b.c-x)-COST; n++; if(p>0)w++; pts+=p; break; } } }
  console.log(`hold ${hold} min: ${n} trades · ${n?Math.round(100*w/n):0}% win · ${pts.toFixed(1)} pts after spread`); }
