import { useState, useRef } from 'react';
import socket from '../socket';
import { showToast } from './Toast';

const WHEEL_ITEMS = [
  { name:'Biryani',        emoji:'🍛', color:'#c96b8a' },
  { name:'Gulab Jamun',    emoji:'🍮', color:'#e8a020' },
  { name:'Aloo Paratha',   emoji:'🫓', color:'#4db89a' },
  { name:'Chole Bhature',  emoji:'🍛', color:'#6a5acd' },
  { name:'Kheer',          emoji:'🍮', color:'#e65100' },
  { name:'Mango Lassi',    emoji:'🥤', color:'#2e7d32' },
  { name:'Rajma Chawal',   emoji:'🍚', color:'#c96b8a' },
  { name:'Halwa',          emoji:'🍮', color:'#e8a020' },
  { name:'Pav Bhaji',      emoji:'🍛', color:'#4db89a' },
  { name:'Jalebi',         emoji:'🍮', color:'#6a5acd' },
  { name:'Dahi Puri',      emoji:'🍿', color:'#e65100' },
  { name:'Butter Chicken', emoji:'🍛', color:'#2e7d32' },
];

const TOTAL   = WHEEL_ITEMS.length;
const SLICE   = 360 / TOTAL;

export default function RecipeRoulette({ user, onClose }) {
  const [spinning,  setSpinning]  = useState(false);
  const [rotation,  setRotation]  = useState(0);
  const [winner,    setWinner]    = useState(null);
  const [added,     setAdded]     = useState(false);
  const spinRef = useRef(0);

  function spin() {
    if (spinning) return;
    setWinner(null); setAdded(false);
    setSpinning(true);

    // Pick a random winner index
    const winIdx  = Math.floor(Math.random() * TOTAL);
    // Spin at least 5 full rotations + land on winner
    const extra   = 5 * 360;
    // The wheel needs to stop so that winIdx slice is at the top (pointer at 270deg)
    // Pointer is at top (0deg in CSS = 12 o'clock). Slice 0 starts at 0deg.
    // To land winIdx at top: rotate = extra + (360 - winIdx * SLICE - SLICE/2)
    const target  = extra + (360 - winIdx * SLICE - SLICE / 2);
    const newRot  = spinRef.current + target;
    spinRef.current = newRot;

    setRotation(newRot);

    setTimeout(() => {
      setSpinning(false);
      setWinner(WHEEL_ITEMS[winIdx]);
    }, 3200);
  }

  function addToWishlist() {
    if (!winner || added) return;
    socket.emit('add_dish', {
      name: winner.name, emoji: winner.emoji,
      addedBy: user.name, addedByAvatar: user.avatar,
    });
    setAdded(true);
    showToast(`${winner.emoji} "${winner.name}" added to wishlist!`);
  }

  return (
    <div style={{
      position:'fixed', inset:0, background:'rgba(90,58,74,.5)',
      zIndex:560, display:'flex', alignItems:'center', justifyContent:'center',
      animation:'fadeIn .2s ease',
    }}>
      <div className="window" style={{
        position:'relative', width:'min(420px, calc(100vw - 40px))',
        animation:'popIn .3s cubic-bezier(.34,1.56,.64,1)',
      }}>
        {/* titlebar */}
        <div className="titlebar">
          <div className="tb-dots">
            <span className="dot dot-r" onClick={onClose} style={{cursor:'pointer'}}/>
            <span className="dot dot-y"/>
            <span className="dot dot-g"/>
          </div>
          <span className="titlebar-title">🎰 roulette.exe — Recipe Roulette</span>
          <div style={{width:42}}/>
        </div>

        <div className="win-body" style={{padding:'20px 24px 24px', textAlign:'center'}}>
          <div style={{
            fontFamily:"'VT323',monospace", fontSize:'1rem',
            color:'var(--grey)', marginBottom:14,
          }}>
            Can't decide what to eat? Let fate decide! 🎲
          </div>

          {/* WHEEL */}
          <div style={{position:'relative', width:260, height:260, margin:'0 auto 16px'}}>
            {/* pointer */}
            <div style={{
              position:'absolute', top:-14, left:'50%', transform:'translateX(-50%)',
              zIndex:10, fontSize:'1.6rem', filter:'drop-shadow(0 2px 4px rgba(0,0,0,.3))',
            }}>▼</div>

            {/* spinning wheel */}
            <div style={{
              width:260, height:260, borderRadius:'50%',
              border:'4px solid var(--border)',
              boxShadow:'0 0 0 3px var(--pink), 4px 4px 0 var(--pink-deep)',
              overflow:'hidden', position:'relative',
              transform:`rotate(${rotation}deg)`,
              transition: spinning ? 'transform 3.2s cubic-bezier(.17,.67,.12,1)' : 'none',
            }}>
              {WHEEL_ITEMS.map((item, i) => {
                const angle = i * SLICE;
                return (
                  <div key={i} style={{
                    position:'absolute', top:0, left:0,
                    width:'100%', height:'100%',
                    transform:`rotate(${angle}deg)`,
                    transformOrigin:'50% 50%',
                  }}>
                    {/* slice background */}
                    <div style={{
                      position:'absolute',
                      top:0, left:'50%',
                      width:0, height:0,
                      borderLeft:`${130 * Math.tan((SLICE/2) * Math.PI/180)}px solid transparent`,
                      borderRight:`${130 * Math.tan((SLICE/2) * Math.PI/180)}px solid transparent`,
                      borderBottom:`130px solid ${item.color}${i%2===0?'dd':'99'}`,
                      transform:'translateX(-50%)',
                    }}/>
                    {/* label */}
                    <div style={{
                      position:'absolute',
                      top:18, left:'50%',
                      transform:`translateX(-50%) rotate(${SLICE/2}deg)`,
                      fontFamily:"'VT323',monospace",
                      fontSize:'.72rem', color:'#fff',
                      textShadow:'0 1px 3px rgba(0,0,0,.6)',
                      whiteSpace:'nowrap',
                      pointerEvents:'none',
                    }}>{item.emoji} {item.name.split(' ')[0]}</div>
                  </div>
                );
              })}
              {/* center circle */}
              <div style={{
                position:'absolute', top:'50%', left:'50%',
                transform:'translate(-50%,-50%)',
                width:40, height:40, borderRadius:'50%',
                background:'var(--win-bg)',
                border:'3px solid var(--border)',
                display:'flex', alignItems:'center', justifyContent:'center',
                fontSize:'1.2rem', zIndex:5,
              }}>🍱</div>
            </div>
          </div>

          {/* SPIN BUTTON */}
          {!winner && (
            <button className="btn btn-primary"
              onClick={spin} disabled={spinning}
              style={{
                fontSize:'1rem', padding:'10px 28px',
                opacity: spinning ? .7 : 1,
                animation: !spinning ? 'bounce .8s ease-in-out infinite' : 'none',
              }}>
              {spinning ? '🌀 Spinning...' : '🎰 SPIN!'}
            </button>
          )}

          {/* WINNER */}
          {winner && (
            <div style={{animation:'popIn .3s cubic-bezier(.34,1.56,.64,1)'}}>
              <div style={{
                background:'linear-gradient(135deg,#fff0f5,#f0faf6)',
                border:'2px solid var(--pink)', borderRadius:12,
                padding:'14px 18px', marginBottom:14,
              }}>
                <div style={{fontSize:'2.5rem',marginBottom:4}}>{winner.emoji}</div>
                <div style={{
                  fontFamily:"'VT323',monospace", fontSize:'1.6rem',
                  color:'var(--pink-deep)', marginBottom:4,
                }}>{winner.name}</div>
                <div style={{fontSize:'.82rem',color:'var(--grey)'}}>
                  Fate has spoken! 🎲
                </div>
              </div>
              <div style={{display:'flex',gap:10,justifyContent:'center'}}>
                {!added ? (
                  <button className="btn btn-primary" onClick={addToWishlist}>
                    ✅ Add to Wishlist!
                  </button>
                ) : (
                  <div style={{
                    fontFamily:"'VT323',monospace", fontSize:'1.1rem',
                    color:'var(--mint-dark)', padding:'8px 16px',
                    background:'#f0faf6', border:'2px solid var(--mint-md)',
                    borderRadius:8,
                  }}>✅ Added to wishlist!</div>
                )}
                <button className="btn btn-ghost" onClick={spin}>
                  🎰 Spin again
                </button>
                <button className="btn btn-ghost" onClick={onClose}>
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
