import { useEffect, useRef, useState } from 'react';
import socket from '../socket';

const PALETTE = ['#c96b8a','#4db89a','#e8a020','#6a5acd','#e65100','#2e7d32'];
const senderColor = (() => {
  const map = {};
  let idx = 0;
  return (name) => {
    if (!map[name]) { map[name] = PALETTE[idx % PALETTE.length]; idx++; }
    return map[name];
  };
})();

export default function ChatWindow({ messages, user, onClose }) {
  const inputRef  = useRef(null);
  const bottomRef = useRef(null);
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function send() {
    const text = inputRef.current?.value.trim();
    if (!text) return;
    socket.emit('send_msg', { text, sender: user.name, avatar: user.avatar });
    inputRef.current.value = '';
  }

  return (
    <div className="window" style={{
      bottom: '70px', right: '20px', 
      width: 'min(360px, calc(100vw - 40px))',
      maxHeight: 'calc(100vh - 100px)',
      boxShadow: '4px 4px 0 var(--pink-deep), 8px 8px 0 var(--pink)',
    }}>

      {/* ── TITLEBAR — Friendly family chat style ── */}
      <div style={{
        background: 'linear-gradient(90deg,#f9c4d2,#e8a0b4)',
        padding: '8px 12px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '2.5px solid var(--pink-deep)',
        userSelect: 'none',
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ display:'flex', gap:4 }}>
            {['#ff6b6b','#ffd93d','#6bcb77'].map((c,i) => (
              <span key={i} onClick={i===0?onClose:undefined} style={{
                width:12, height:12, borderRadius:'50%',
                background:c, border:'1.5px solid rgba(0,0,0,.2)',
                cursor: i===0?'pointer':'default',
                display:'inline-block',
                boxShadow: '0 2px 4px rgba(0,0,0,.1)',
              }}/>
            ))}
          </div>
          <span style={{
            fontFamily:"'VT323',monospace", fontSize:'1.1rem',
            color:'var(--text)', letterSpacing:0.5, fontWeight:700,
          }}>💬 Family Chat</span>
        </div>
        {/* online indicator */}
        <div style={{
          fontFamily:"'VT323',monospace", fontSize:'.85rem', fontWeight:700,
          color:'var(--mint-dark)', display:'flex', alignItems:'center', gap:4,
          letterSpacing:'.5px',
        }}>
          <span style={{
            width:7, height:7, borderRadius:'50%', background:'var(--mint-dark)',
            display:'inline-block', animation:'twinkle 1.5s ease-in-out infinite',
          }}/>
          ONLINE
        </div>
      </div>

      {/* ── MESSAGES — Warm family chat style ── */}
      <div style={{
        maxHeight: 330, minHeight: 150, overflowY: 'auto',
        padding: '12px',
        display: 'flex', flexDirection: 'column', gap: 8,
        background: 'linear-gradient(135deg,#fef9fa,#f8fbf8)',
        backgroundImage: 'linear-gradient(135deg,#fef9fa,#f8fbf8), radial-gradient(circle at 20% 50%, rgba(248,184,208,.06) 0%, transparent 50%), radial-gradient(circle at 80% 50%, rgba(184,232,216,.06) 0%, transparent 50%)',
      }}>
        {messages.length === 0 ? (
          <div style={{
            textAlign:'center', padding:'28px 10px',
            fontFamily:"'VT323',monospace", fontSize:'1.1rem',
            color:'var(--grey)', lineHeight:1.6,
            letterSpacing:'.3px',
          }}>
            <div style={{fontSize:'2rem',marginBottom:8}}>💌</div>
            <span style={{color:'var(--text)',fontWeight:700}}>Say hello!</span><br/>
            <span style={{fontSize:'.95rem',color:'var(--pink-md)'}}>Start chatting with the family...</span>
          </div>
        ) : messages.map((msg, i) => {
          const mine     = msg.sender === user.name;
          const time     = new Date(msg.createdAt).toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' });
          const showHead = i === 0 || messages[i-1]?.sender !== msg.sender;
          const color    = senderColor(msg.sender);

          return (
            <div key={msg._id} style={{
              display:'flex', flexDirection: mine ? 'row-reverse' : 'row',
              gap:8, alignItems:'flex-end',
              animation:'slideIn .18s ease',
            }}>
              {/* avatar — only on first of group */}
              <div style={{
                width:34, height:34, flexShrink:0,
                borderRadius:8,
                border: showHead ? `2.5px solid ${color}` : '2px solid transparent',
                background: showHead ? '#fff' : 'transparent',
                display:'flex', alignItems:'center', justifyContent:'center',
                fontSize:'1.2rem',
                boxShadow: showHead ? `0 2px 6px ${color}40` : 'none',
              }}>
                {showHead ? msg.avatar : ''}
              </div>

              <div style={{
                display:'flex', flexDirection:'column',
                alignItems: mine ? 'flex-end' : 'flex-start',
                maxWidth:'70%',
              }}>
                {/* name tag */}
                {showHead && (
                  <div style={{
                    fontFamily:"'VT323',monospace", fontSize:'.9rem', fontWeight:700,
                    color, marginBottom:2,
                    textShadow:`0 1px 2px rgba(0,0,0,.08)`,
                    letterSpacing:'.3px',
                  }}>
                    {mine ? '👤 You' : msg.sender}
                  </div>
                )}

                {/* Chat bubble */}
                <div style={{
                   padding:'9px 13px',
                   background: mine ? `${color}18` : 'rgba(255,255,255,.7)',
                   border: `2px solid ${mine ? color : '#e8d4e0'}`,
                   borderRadius: mine ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                   fontFamily:"'VT323',monospace",
                   fontSize:'.95rem',
                   color: mine ? color : 'var(--text)',
                   lineHeight:1.4,
                   wordBreak:'break-word',
                   boxShadow: mine ? `0 2px 6px ${color}15` : '0 1px 3px rgba(201,107,138,.08)',
                   position:'relative',
                   fontWeight: 500,
                   letterSpacing:'.3px',
                }}>
                  {msg.text}
                  {i === messages.length - 1 && (
                    <span style={{
                       marginLeft:3, color: mine ? color : 'var(--pink-md)',
                       animation:'twinkle 1s step-end infinite', fontSize:'1.1rem',
                    }}>▌</span>
                  )}
                </div>

                {/* timestamp */}
                <div style={{
                  fontFamily:"'VT323',monospace", fontSize:'.7rem',
                  color:'var(--grey)', marginTop:2, fontWeight:500,
                  letterSpacing:'.2px',
                }}>{time}</div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef}/>
      </div>

      {/* ── INPUT — Friendly console style ── */}
      <div style={{
        display:'flex', gap:0,
        borderTop:'2.5px solid var(--pink-deep)',
        background:'linear-gradient(90deg,#fff9fb,#f8fbf8)',
        alignItems:'stretch',
      }}>
        <div style={{
          padding:'0 10px',
          display:'flex', alignItems:'center',
          fontFamily:"'VT323',monospace", fontSize:'1.2rem',
          color:'var(--pink-deep)', flexShrink:0,
          borderRight:'2px solid var(--pink)',
        }}>▶</div>
        <input
          ref={inputRef}
          type="text" maxLength={200}
          placeholder="Say something..."
          autoComplete="off"
          style={{
            flex:1, fontSize:'.95rem', padding:'9px 10px',
            fontFamily:"'VT323',monospace",
            background:'transparent', border:'none', outline:'none',
            color:'var(--text)',
            caretColor:'var(--pink-deep)',
            letterSpacing:'.2px',
          }}
          onKeyDown={e => e.key === 'Enter' && send()}
          onFocus={() => setTyping(true)}
          onBlur={() => setTyping(false)}
        />
        <button onClick={send} style={{
          padding:'0 12px', flexShrink:0,
          background: typing ? 'var(--pink)' : 'transparent',
          color:'var(--pink-deep)', border:'none',
          borderLeft:'2px solid var(--pink)',
          fontFamily:"'VT323',monospace", fontSize:'1rem', fontWeight:700,
          cursor:'pointer', transition:'all .15s',
          display:'flex', alignItems:'center', justifyContent:'center',
          letterSpacing:'.3px',
        }}
          onMouseEnter={e => e.currentTarget.style.background='rgba(249,196,210,.5)'}
          onMouseLeave={e => e.currentTarget.style.background= typing?'var(--pink)':'transparent'}
        >💬</button>
      </div>
    </div>
  );
}
