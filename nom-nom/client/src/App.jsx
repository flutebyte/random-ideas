import { useState, useEffect } from 'react';
import socket from './socket';
import { getMood } from './components/MoodMeter';
import { showToast } from './components/Toast';

import DecoBg          from './components/DecoBg';
import Toast           from './components/Toast';
import LoginScreen     from './components/LoginScreen';
import MoodMeter       from './components/MoodMeter';
import WishlistWindow  from './components/WishlistWindow';
import ChatWindow      from './components/ChatWindow';
import RoastPopup      from './components/RoastPopup';
import TrendingWindow  from './components/TrendingWindow';
import NaniSuggestion  from './components/NaniSuggestion';
import RecipeRoulette  from './components/RecipeRoulette';

// ── Session ────────────────────────────────────────────────────────────────
const SK = 'nkUser';
const saveSession  = u => sessionStorage.setItem(SK, JSON.stringify(u));
const loadSession  = () => { try { return JSON.parse(sessionStorage.getItem(SK)); } catch { return null; } };
const clearSession = () => sessionStorage.removeItem(SK);

export default function App() {
  const [user,        setUser]        = useState(() => loadSession());
  const [dishes,      setDishes]      = useState([]);
  const [messages,    setMessages]    = useState([]);
  const [roastMsg,    setRoastMsg]    = useState('');
  const [chatOpen,    setChatOpen]    = useState(false);
  const [chatUnread,  setChatUnread]  = useState(false);
  const [trendOpen,   setTrendOpen]   = useState(false);
  const [showSuggest, setShowSuggest] = useState(false);
  const [rouletteOpen, setRouletteOpen] = useState(false);
  const [startOpen,   setStartOpen]   = useState(false);

  // ── Initial data load ────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/dishes')
      .then(r => r.json()).then(setDishes).catch(console.error);
    fetch('/api/messages')
      .then(r => r.json()).then(setMessages).catch(console.error);
  }, []);

  // ── Socket events ────────────────────────────────────────────────────────
  useEffect(() => {
    socket.on('dish_added',   d  => setDishes(p => [d, ...p]));
    socket.on('dish_updated', d  => setDishes(p => p.map(x => x._id === d._id ? d : x)));
    socket.on('dish_deleted', id => setDishes(p => p.filter(x => x._id !== id)));
    socket.on('new_msg', m => {
      setMessages(p => [...p, m]);
      if (!chatOpen) setChatUnread(true);
    });
    socket.on('roast', msg => setRoastMsg(msg));
    socket.on('error', msg => showToast('⚠️ ' + msg));
    return () => {
      ['dish_added','dish_updated','dish_deleted','new_msg','roast','error']
        .forEach(e => socket.off(e));
    };
  }, [chatOpen]);

  // ── Auth ─────────────────────────────────────────────────────────────────
  function handleLogin(u) {
    saveSession(u);
    setUser(u);
    showToast(`Welcome ${u.avatar} ${u.name}! 🎉`);
    // Show Nani's suggestion after a short delay
    setTimeout(() => setShowSuggest(true), 800);
  }
  function handleLogout() {
    clearSession(); setUser(null);
    setChatOpen(false); setStartOpen(false); setTrendOpen(false); setRouletteOpen(false);
  }

  // ── Add to wishlist from trending ────────────────────────────────────────
  function addFromTrending(name, emoji) {
    if (!user) return;
    socket.emit('add_dish', { name, emoji, addedBy: user.name, addedByAvatar: user.avatar });
  }

  const pendingCount = dishes.filter(d => !d.done).length;
  const mood         = getMood(pendingCount);

  // ── LOGIN ─────────────────────────────────────────────────────────────────
  if (!user) return (
    <>
      <DecoBg/>
      <LoginScreen onLogin={handleLogin}/>
      <Toast/>
    </>
  );

  // ── DOCK items ────────────────────────────────────────────────────────────
  const dockItems = [
    { icon: '📋', label: 'wishlist.exe',  action: () => {} },
    {
      icon: '💬',
      label: chatUnread ? 'chat.exe 🔴' : 'chat.exe',
      action: () => { setChatOpen(p => !p); setChatUnread(false); },
    },
    { icon: '🔥', label: 'trending.exe',  action: () => setTrendOpen(true) },
    { icon: '🎰', label: 'roulette.exe',  action: () => setRouletteOpen(true) },
  ];

  return (
    <>
      <DecoBg/>

      {/* ── DESKTOP BG ── */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 1,
        background: 'radial-gradient(ellipse at 15% 20%,#ffd6e7 0%,transparent 50%), radial-gradient(ellipse at 85% 80%,#c8f0e4 0%,transparent 50%), radial-gradient(ellipse at 50% 50%,#fff0f8 0%,transparent 70%), #fce4ec',
      }}>
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: 'linear-gradient(rgba(249,196,210,.25) 1px,transparent 1px),linear-gradient(90deg,rgba(249,196,210,.25) 1px,transparent 1px)',
          backgroundSize: '40px 40px',
        }}/>
        {[{t:'8%',l:'10%',d:0},{t:'5%',l:'40%',d:2},{t:'12%',r:'15%',d:4}].map((c,i)=>(
          <div key={i} style={{ position:'absolute', top:c.t, left:c.l, right:c.r, fontSize:'3rem', opacity:.35, animation:`driftCloud 20s ${c.d}s ease-in-out infinite` }}>☁️</div>
        ))}
        {[{t:'20%',l:'25%'},{t:'35%',r:'20%'},{b:'30%',l:'15%'},{b:'20%',r:'30%'}].map((s,i)=>(
          <div key={i} style={{ position:'absolute', top:s.t, left:s.l, right:s.r, bottom:s.b, fontSize:'1.1rem', color:'var(--pink-deep)', opacity:.4, animation:`twinkle ${3+i*.5}s ease-in-out infinite` }}>✦</div>
        ))}
      </div>

      {/* ── MENUBAR ── */}
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, height: 30, zIndex: 200,
        background: 'rgba(255,240,248,.92)', backdropFilter: 'blur(8px)',
        borderBottom: '1.5px solid var(--pink-md)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 max(10px, 1vw)', fontSize: 'clamp(.65rem, 1vw, .78rem)', fontWeight: 700,
        overflowX: 'auto',
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:'max(6px, 0.5vw)', whiteSpace:'nowrap' }}>
          <span>🍱</span>
          {['File','View'].map(label => (
            <span key={label} style={{ cursor:'pointer', padding:'2px 6px', borderRadius:4, transition:'background .15s' }}
              onClick={() => label === 'File' && setStartOpen(p => !p)}
              onMouseEnter={e => e.currentTarget.style.background='var(--pink)'}
              onMouseLeave={e => e.currentTarget.style.background='transparent'}
            >{label}</span>
          ))}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'max(6px, 0.5vw)', whiteSpace:'nowrap', marginLeft:'auto' }}>
          <span style={{ fontSize:'clamp(.65rem, 0.9vw, .72rem)', color:'var(--pink-deep)' }}>{mood.emoji} {mood.text}</span>
          <span style={{ color:'var(--pink-md)', display:'inline-block' }}>|</span>
          <span style={{display:'inline-block', overflow:'hidden', textOverflow:'ellipsis', maxWidth:'80px'}}>{user.avatar} {user.name}</span>
          <span style={{ color:'var(--pink-md)', display:'inline-block' }}>|</span>
          <span style={{ cursor:'pointer', padding:'2px 6px', borderRadius:4 }}
            onClick={handleLogout}
            onMouseEnter={e => e.currentTarget.style.background='var(--pink)'}
            onMouseLeave={e => e.currentTarget.style.background='transparent'}
          >Logout</span>
        </div>
      </div>

      {/* ── START MENU ── */}
      {startOpen && (
        <>
          <div style={{ position:'fixed', inset:0, zIndex:250 }} onClick={() => setStartOpen(false)}/>
          <div style={{
            position:'fixed', top:34, left:10, zIndex:300,
            background:'var(--win-bg)', border:'2.5px solid var(--border)',
            borderRadius:'0 12px 12px 12px', boxShadow:'4px 4px 0 var(--pink-deep)',
            minWidth:200, overflow:'hidden', animation:'popIn .15s ease',
          }}>
            {[
              { label:'🔥 Trending Recipes',  action: () => { setTrendOpen(true); setStartOpen(false); } },
              { label:'🎰 Recipe Roulette',    action: () => { setRouletteOpen(true); setStartOpen(false); } },
              { label:'💬 Family Chat',        action: () => { setChatOpen(true); setChatUnread(false); setStartOpen(false); } },
              { label:"👵 Nani's Suggestion",  action: () => { setShowSuggest(true); setStartOpen(false); } },
              null,
              { label:'🚪 Logout',             action: handleLogout },
            ].map((item, i) => item === null
              ? <div key={i} style={{ height:2, background:'var(--pink)', margin:'3px 0' }}/>
              : <div key={i} style={{ padding:'9px 16px', fontSize:'.85rem', fontWeight:600, cursor:'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background='var(--pink)'}
                  onMouseLeave={e => e.currentTarget.style.background='transparent'}
                  onClick={item.action}
                >{item.label}</div>
            )}
          </div>
        </>
      )}

      {/* ── DESKTOP WINDOWS ── */}
      <div style={{ position:'fixed', inset:'30px 0 0 0', zIndex:2, overflow:'hidden' }}>
        <MoodMeter pendingCount={pendingCount}/>
        <WishlistWindow dishes={dishes} user={user}/>
        {chatOpen && (
          <ChatWindow messages={messages} user={user} onClose={() => setChatOpen(false)}/>
        )}
      </div>

      {/* ── DOCK ── */}
      <div style={{
        position:'fixed', bottom:'20px', left:'50%', transform:'translateX(-50%)',
        display:'flex', gap:'max(12px, 1vw)', zIndex:10,
        background:'rgba(255,240,248,.75)', backdropFilter:'blur(6px)',
        border:'2px solid var(--pink-md)', borderRadius:20,
        padding:'8px max(12px, 3vw)', boxShadow:'0 4px 0 var(--pink-md)',
        maxWidth:'calc(100vw - 40px)',
        overflowX:'auto',
      }}>
        {dockItems.map(d => (
          <div key={d.label} onClick={d.action} style={{
            display:'flex', flexDirection:'column', alignItems:'center', gap:3,
            cursor:'pointer', padding:'6px 10px', borderRadius:10, transition:'background .15s',
          }}
            onMouseEnter={e => e.currentTarget.style.background='rgba(249,196,210,.6)'}
            onMouseLeave={e => e.currentTarget.style.background='transparent'}
          >
            <span style={{ fontSize:'1.6rem' }}>{d.icon}</span>
            <label style={{ fontSize:'.6rem', fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}>{d.label}</label>
          </div>
        ))}
      </div>

      {/* ── POPUPS ── */}
      <RoastPopup msg={roastMsg} onClose={() => setRoastMsg('')}/>

      {trendOpen && (
        <TrendingWindow
          onClose={() => setTrendOpen(false)}
          onAddToWishlist={addFromTrending}
        />
      )}

      {rouletteOpen && (
        <RecipeRoulette user={user} onClose={() => setRouletteOpen(false)}/>
      )}

      {showSuggest && (
        <NaniSuggestion
          user={user}
          onClose={(added) => {
            setShowSuggest(false);
            if (added) showToast('✅ Added to wishlist!');
          }}
        />
      )}

      <Toast/>
    </>
  );
}
