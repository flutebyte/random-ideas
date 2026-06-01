const MOODS = [
  { max:2,  pct:10, color:'#7ecfb5', emoji:'😊', text:'Nani is chilling',        sub:'All good!' },
  { max:4,  pct:28, color:'#a8d8a8', emoji:'🙂', text:'Nani is warming up',       sub:'Getting the masala ready' },
  { max:6,  pct:45, color:'#ffd580', emoji:'😅', text:'Nani is sweating',         sub:'The kitchen is heating up' },
  { max:9,  pct:62, color:'#ffb347', emoji:'😤', text:'Nani is muttering',        sub:'Under her breath. Loudly.' },
  { max:12, pct:78, color:'#ff8c69', emoji:'😰', text:'Nani locked the door',     sub:'She needs a moment. Or ten.' },
  { max:15, pct:90, color:'#ff6b6b', emoji:'🤯', text:'Nani is questioning life', sub:'She raised you better than this' },
  { max:Infinity, pct:100, color:'#e84393', emoji:'💔', text:'Nani has disowned you', sub:'With love. But still.' },
];

export function getMood(pendingCount) {
  return MOODS.find(m => pendingCount <= m.max) ?? MOODS[MOODS.length - 1];
}

export default function MoodMeter({ pendingCount }) {
  const m = getMood(pendingCount);
  return (
    <div className="window" style={{ top:50, right:20, width:200 }}>
      <div className="titlebar">
        <div className="tb-dots"><span className="dot dot-r"/><span className="dot dot-y"/><span className="dot dot-g"/></div>
        <span className="titlebar-title">👵 nani_mood.exe</span>
        <div style={{width:42}}/>
      </div>
      <div className="win-body" style={{padding:14,textAlign:'center'}}>
        <div style={{fontSize:'2.8rem',marginBottom:8,transition:'all .4s'}}>{m.emoji}</div>
        <div style={{
          height:12, background:'var(--pink)',
          border:'2px solid var(--border)', borderRadius:20,
          overflow:'hidden', marginBottom:8,
        }}>
          <div style={{
            height:'100%', borderRadius:20,
            width:`${m.pct}%`, background:m.color,
            transition:'width .6s ease, background .6s ease',
          }}/>
        </div>
        <div className="vt" style={{fontSize:'1rem',color:'var(--text)'}}>{m.text}</div>
        <div style={{fontSize:'.68rem',color:'var(--grey)',marginTop:3}}>{m.sub}</div>
      </div>
    </div>
  );
}
