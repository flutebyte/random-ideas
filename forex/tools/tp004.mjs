// Fixed-% target scalp test (e.g. 0.04% ≈ 3 pts on SPX500). Entry: close beyond previous 10 3m bars (any time / NY only). Spread 0.6.
import { fetchCandles } from '../src/engine/data.js';
import { resample } from '../src/engine/live.js';
const f = await fetchCandles('SPX500','1m','7d'); const c = resample(f.candles,180000,Date.now()+1e9);
const COST=0.6, OPEN=14*60+30, um=t=>{const d=new Date(t);return d.getUTCHours()*60+d.getUTCMinutes()};
for (const nyOnly of [false,true]) for (const tp of [0.0004,0.0008]) for (const sl of [0.0004,0.0008]) {
  let n=0,w=0,net=0,i=11;
  while(i<c.length-4){
    const m=um(c[i].t); if(nyOnly&&!(m>=OPEN&&m<OPEN+150)){i++;continue}
    const p=c.slice(i-10,i), hi=Math.max(...p.map(b=>b.h)), lo=Math.min(...p.map(b=>b.l)), e=c[i].c;
    if(!(e>hi||e<lo)){i++;continue}
    const buy=e>hi, T=e*tp, S=e*sl; let r=null,j=i+1;
    for(;j<=i+3&&j<c.length;j++){const k=c[j];
      const st=buy?k.l<=e-S:k.h>=e+S, tg=buy?k.h>=e+T:k.l<=e-T;
      if(st){r=-S;break} if(tg){r=T;break}}
    if(r===null){const l=c[Math.min(j-1,c.length-1)].c;r=buy?l-e:e-l}
    r-=COST;n++;if(r>0)w++;net+=r;i=j+1;}
  console.log((nyOnly?'NY only ':'all day ').padEnd(9),`target ${(tp*100).toFixed(2)}% stop ${(sl*100).toFixed(2)}%`.padEnd(28),String(n).padEnd(4),Math.round(100*w/n)+'% win'.padEnd(8),net.toFixed(1)+' pts');}
