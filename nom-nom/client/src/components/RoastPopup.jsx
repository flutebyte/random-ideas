export default function RoastPopup({ msg, onClose }) {
  if (!msg) return null;
  return (
    <div style={{
      position:'fixed', inset:0, background:'rgba(90,58,74,.4)',
      zIndex:600, display:'flex', alignItems:'center', justifyContent:'center',
      animation:'fadeIn .2s ease',
    }}>
      <div className="window" style={{ position:'relative', width:360, maxWidth:'92vw', animation:'popIn .28s cubic-bezier(.34,1.56,.64,1)' }}>
        <div className="titlebar" style={{ background:'linear-gradient(90deg,#ffb347,#ffd580)', borderBottomColor:'#e8a020' }}>
          <div className="tb-dots"><span className="dot dot-r"/><span className="dot dot-y"/><span className="dot dot-g"/></div>
          <span className="titlebar-title" style={{color:'#5a3a10'}}>⚠️ reminder.exe</span>
          <div style={{width:42}}/>
        </div>
        <div className="win-body" style={{padding:22,textAlign:'center'}}>
          <div style={{fontSize:'3.5rem',marginBottom:8,animation:'shake .5s ease'}}>👵</div>
          <div className="vt" style={{fontSize:'1.5rem',color:'#c96b20',marginBottom:10}}>A Message from Nani</div>
          <div style={{
            fontSize:'.88rem', color:'var(--text)', lineHeight:1.65,
            background:'#fff8f0', border:'2px solid #ffd580',
            borderRadius:10, padding:'12px 14px', marginBottom:16,
          }}>{msg}</div>
          <div style={{display:'flex',gap:10,justifyContent:'center'}}>
            <button className="btn btn-orange" onClick={onClose}>😇 Sorry Nani</button>
            <button className="btn btn-ghost"  onClick={onClose}>🙈 Add more anyway</button>
          </div>
        </div>
      </div>
    </div>
  );
}
