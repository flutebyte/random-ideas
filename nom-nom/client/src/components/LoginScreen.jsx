import { useState } from 'react';
import { showToast } from './Toast';

const AVATARS = ['👦','👧','👨','👩','👴','👵','🧒','🧑'];
const DECO    = [
  { top:'8%',  left:'6%',   icon:'🍛' },
  { top:'15%', right:'8%',  icon:'🌸' },
  { bottom:'20%', left:'4%', icon:'🍮' },
  { bottom:'10%', right:'6%', icon:'🌺' },
  { top:'40%', left:'2%',   icon:'💕' },
  { top:'55%', right:'3%',  icon:'🍜' },
];

export default function LoginScreen({ onLogin }) {
  const [name, setName]   = useState('');
  const [avatar, setAvatar] = useState('👦');

  function handleLogin() {
    const n = name.trim();
    if (!n) { showToast('Enter your name first! 👀'); return; }
    onLogin({ name: n, avatar });
  }

  return (
    <div style={{
      position:'fixed', inset:0, zIndex:1,
      background: 'radial-gradient(ellipse at 20% 30%,#ffd6e7 0%,transparent 55%), radial-gradient(ellipse at 80% 70%,#c8f0e4 0%,transparent 55%), #fce4ec',
      display:'flex', alignItems:'center', justifyContent:'center',
    }}>
      {/* grid overlay */}
      <div style={{
        position:'absolute', inset:0, pointerEvents:'none',
        backgroundImage: 'linear-gradient(rgba(249,196,210,.3) 1px,transparent 1px),linear-gradient(90deg,rgba(249,196,210,.3) 1px,transparent 1px)',
        backgroundSize: '36px 36px',
      }}/>

      {/* scattered deco */}
      {DECO.map((d,i) => (
        <div key={i} style={{
          position:'absolute', fontSize:'2.2rem', opacity:.55,
          animation:'wobble 4s ease-in-out infinite',
          animationDelay: `${i*0.6}s`,
          ...d,
        }}>{d.icon}</div>
      ))}

      <div className="window login-win" style={{ width:400, maxWidth:'92vw', position:'relative' }}>
        <div className="titlebar">
          <div className="tb-dots">
            <span className="dot dot-r"/><span className="dot dot-y"/><span className="dot dot-g"/>
          </div>
          <span className="titlebar-title">🍱 nani_kitchen.exe</span>
          <div style={{width:42}}/>
        </div>
        <div className="win-body" style={{padding:'28px 28px 22px'}}>
          <div style={{fontSize:'4.5rem',textAlign:'center',marginBottom:6,animation:'bounce 2s ease-in-out infinite'}}>👵</div>
          <h1 className="vt" style={{fontSize:'2.4rem',textAlign:'center',color:'var(--pink-deep)',marginBottom:4}}>
            Nani's Kitchen
          </h1>
          <p style={{textAlign:'center',color:'var(--grey)',fontSize:'.85rem',marginBottom:22}}>
            ☀️ Summer Holidays Food Wishlist ☀️
          </p>

          <div style={{marginBottom:14}}>
            <label style={{display:'block',fontSize:'.78rem',fontWeight:700,marginBottom:6}}>Who are you?</label>
            <input
              type="text" value={name} maxLength={20}
              placeholder="Enter your name..."
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              autoComplete="off"
            />
          </div>

          <div style={{marginBottom:18}}>
            <label style={{display:'block',fontSize:'.78rem',fontWeight:700,marginBottom:6}}>Pick your avatar</label>
            <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
              {AVATARS.map(av => (
                <span key={av} className={`av${avatar===av?' selected':''}`}
                  onClick={() => setAvatar(av)}
                  style={{
                    fontSize:'1.7rem', cursor:'pointer', padding:6,
                    border: `2.5px solid ${avatar===av?'var(--pink-deep)':'transparent'}`,
                    borderRadius:10, background: avatar===av?'var(--pink)':'#fff',
                    boxShadow: avatar===av?'3px 3px 0 var(--border)':'none',
                    transition:'all .15s',
                  }}
                >{av}</span>
              ))}
            </div>
          </div>

          <button className="btn btn-primary btn-full" onClick={handleLogin}>
            Enter Nani's Kitchen →
          </button>
          <p style={{textAlign:'center',color:'var(--grey)',fontSize:'.72rem',marginTop:10}}>
            No password needed — it's family 💕
          </p>
        </div>
      </div>
    </div>
  );
}
