import { useState, useEffect, useRef } from 'react';
import { showToast } from './Toast';

// ── Seen-video rotation tracked in localStorage ────────────────────────────
const SEEN_KEY = 'nk_seen_vids';
function getSeen()        { try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')); } catch { return new Set(); } }
function markSeen(id)     { const s = getSeen(); s.add(id); localStorage.setItem(SEEN_KEY, JSON.stringify([...s])); }

export default function TrendingWindow({ onClose, onAddToWishlist }) {
  const [videos,   setVideos]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [active,   setActive]   = useState(null);
  const [query,    setQuery]    = useState('trending viral recipe');
  const [inputVal, setInputVal] = useState('trending viral recipe');
  const listRef = useRef(null);

  useEffect(() => { loadVideos(query); }, [query]);

  async function loadVideos(q) {
    setLoading(true); setError(null); setActive(null);
    try {
      const res  = await fetch(`http://localhost:3001/api/trending?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      const seen = getSeen();
      const sorted = [
        ...data.filter(v => !seen.has(v.id)),
        ...data.filter(v =>  seen.has(v.id)),
      ];
      setVideos(sorted);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function playVideo(video) {
    markSeen(video.id);
    setActive(video);
  }

  function addToWishlist(title) {
    const clean = title
      .replace(/\|.*$/,'').replace(/#\w+/g,'')
      .replace(/\b(recipe|easy|viral|trending|shorts?|how to make|homemade)\b/gi,'')
      .replace(/\s{2,}/g,' ').trim();
    onAddToWishlist(clean, '🍳');
    showToast(`🍳 "${clean}" added to wishlist!`);
  }

  function search(e) {
    e.preventDefault();
    if (inputVal.trim()) setQuery(inputVal.trim());
  }

  return (
    <div style={{
      position:'fixed', inset:0, background:'rgba(90,58,74,.5)',
      zIndex:500, display:'flex', alignItems:'center', justifyContent:'center',
      animation:'fadeIn .2s ease',
    }} onClick={e => e.target === e.currentTarget && onClose()}>

      <div className="window" style={{
        position:'relative', width:800, maxWidth:'97vw',
        height:'88vh', display:'flex', flexDirection:'column',
        animation:'popIn .28s cubic-bezier(.34,1.56,.64,1)',
      }}>
        {/* titlebar */}
        <div className="titlebar">
          <div className="tb-dots">
            <span className="dot dot-r" onClick={onClose} style={{cursor:'pointer'}}/>
            <span className="dot dot-y"/>
            <span className="dot dot-g"/>
          </div>
          <span className="titlebar-title">🔥 trending.exe — Viral Recipe Shorts</span>
          <div style={{width:42}}/>
        </div>

        {/* search bar */}
        <form onSubmit={search} style={{
          display:'flex', gap:8, padding:'10px 14px',
          borderBottom:'2px solid var(--pink)',
          background:'linear-gradient(90deg,#fff0f5,#f0faf6)',
        }}>
          <input
            type="text" value={inputVal}
            onChange={e => setInputVal(e.target.value)}
            placeholder="Search trending recipes..."
            style={{ flex:1, fontSize:'.88rem', padding:'7px 12px', borderRadius:20 }}
          />
          <button type="submit" className="btn btn-primary" style={{padding:'7px 16px',fontSize:'.82rem'}}>
            🔍 Search
          </button>
          <button type="button" className="btn btn-ghost" style={{padding:'7px 12px',fontSize:'.82rem'}}
            onClick={() => { setInputVal('trending viral recipe'); setQuery('trending viral recipe'); }}>
            Reset
          </button>
        </form>

        <div style={{display:'flex', flex:1, overflow:'hidden', minHeight:0}}>

          {/* LEFT — scrollable video grid with improved styling */}
          <div ref={listRef} style={{
            width:280, flexShrink:0, overflowY:'auto',
            borderRight:'2px solid var(--pink)',
            background:'linear-gradient(180deg,#fff9fb,#fff5f8)',
            padding:'12px 8px',
            display:'flex', flexDirection:'column', gap:10,
          }}>
            {loading && (
              <div style={{textAlign:'center',padding:'40px 10px',color:'var(--grey)'}}>
                <div style={{fontSize:'2rem',marginBottom:8,animation:'bounce 1s ease-in-out infinite'}}>🔥</div>
                <div style={{fontFamily:"'VT323',monospace",fontSize:'1.1rem'}}>Loading viral recipes...</div>
              </div>
            )}
            {error && (
              <div style={{textAlign:'center',padding:'30px 10px',color:'#c62828'}}>
                <div style={{fontSize:'2rem',marginBottom:8}}>⚠️</div>
                <div style={{fontFamily:"'VT323',monospace",fontSize:'1rem',marginBottom:8}}>{error}</div>
                {error.includes('API key') && (
                  <div style={{fontSize:'.75rem',color:'var(--grey)',lineHeight:1.5}}>
                    Add your YouTube Data API v3 key to<br/>
                    <code style={{background:'#fff0f5',padding:'2px 6px',borderRadius:4}}>server/.env</code><br/>
                    as <code style={{background:'#fff0f5',padding:'2px 6px',borderRadius:4}}>YOUTUBE_API_KEY=...</code>
                  </div>
                )}
                <button className="btn btn-primary" style={{marginTop:12,fontSize:'.78rem'}}
                  onClick={() => loadVideos(query)}>Retry</button>
              </div>
            )}
            {!loading && !error && videos.length === 0 && (
              <div style={{textAlign:'center',padding:'40px 10px',color:'var(--grey)'}}>
                <div style={{fontSize:'2rem',marginBottom:8}}>🍽️</div>
                <div style={{fontFamily:"'VT323',monospace",fontSize:'1rem'}}>No results found</div>
              </div>
            )}
            {!loading && videos.map((v, i) => {
              const seen = getSeen().has(v.id);
              const isActive = active?.id === v.id;
              return (
                <div key={v.id} onClick={() => playVideo(v)} style={{
                   borderRadius:12, cursor:'pointer', overflow:'hidden',
                   border:`2.5px solid ${isActive?'var(--pink-deep)':'#e8d4e0'}`,
                   background: isActive ? 'linear-gradient(135deg,#fff0f5,#f5e8f0)' : '#fff',
                   transition:'all .2s', animation:'slideIn .2s ease',
                   opacity: seen && !isActive ? .8 : 1,
                   boxShadow: isActive ? '0 4px 12px rgba(201,107,138,.25)' : '0 2px 6px rgba(201,107,138,.08)',
                   transform: isActive ? 'scale(1.02)' : 'scale(1)',
                 }}
                   onMouseEnter={e => { if(!isActive) { e.currentTarget.style.background='#fff5f9'; e.currentTarget.style.boxShadow='0 3px 8px rgba(201,107,138,.15)'; } }}
                   onMouseLeave={e => { if(!isActive) { e.currentTarget.style.background='#fff'; e.currentTarget.style.boxShadow='0 2px 6px rgba(201,107,138,.08)'; } }}
                 >
                   {/* thumbnail */}
                   <div style={{position:'relative'}}>
                     <img src={v.thumbnail} alt={v.title}
                       style={{width:'100%',height:100,objectFit:'cover',display:'block'}}/>
                     <div style={{
                       position:'absolute',inset:0,
                       display:'flex',alignItems:'center',justifyContent:'center',
                       background:'rgba(0,0,0,.2)',
                       opacity: isActive ? 1 : 0, transition:'opacity .15s',
                     }}>
                       <span style={{fontSize:'2.2rem',filter:'drop-shadow(0 2px 4px rgba(0,0,0,.5))'}}>▶</span>
                     </div>
                     {seen && !isActive && (
                       <div style={{
                         position:'absolute',bottom:4,right:4,
                         background:'rgba(201,107,138,.85)',color:'#fff',
                         fontSize:'.65rem',fontWeight:700,padding:'3px 7px',borderRadius:12,
                       }}>✓ seen</div>
                     )}
                     <div style={{
                       position:'absolute',top:6,left:6,
                       background:'var(--pink-deep)',color:'#fff',
                       fontFamily:"'Nunito',sans-serif",fontSize:'.9rem',
                       padding:'2px 8px',borderRadius:6,
                       boxShadow:'0 2px 4px rgba(0,0,0,.2)',
                       fontWeight:700,
                     }}>{i+1}</div>
                   </div>
                   {/* info */}
                   <div style={{padding:'8px 10px'}}>
                     <div style={{
                       fontFamily:"'Nunito',sans-serif",fontSize:'.85rem',
                       color:'var(--text)',lineHeight:1.25,
                       display:'-webkit-box',WebkitLineClamp:2,
                       WebkitBoxOrient:'vertical',overflow:'hidden',
                       fontWeight:600,
                     }}>{v.title}</div>
                     <div style={{fontSize:'.65rem',color:'var(--grey)',marginTop:2}}>📺 {v.channel}</div>
                   </div>
                 </div>
              );
            })}
          </div>

          {/* RIGHT — player + add button */}
          <div style={{flex:1, overflowY:'auto', background:'var(--win-bg)', display:'flex', flexDirection:'column'}}>
            {!active ? (
              <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:30,color:'var(--grey)',textAlign:'center'}}>
                <div style={{fontSize:'3.5rem',marginBottom:14}}>🔥</div>
                <div style={{fontFamily:"'VT323',monospace",fontSize:'1.5rem',marginBottom:8}}>
                  {loading ? 'Fetching viral recipes...' : 'Pick a video to watch'}
                </div>
                <div style={{fontSize:'.82rem',maxWidth:260,lineHeight:1.5}}>
                  {loading
                    ? 'Searching YouTube for trending recipe shorts...'
                    : 'Click any thumbnail on the left to play it here. Unseen videos are shown first!'}
                </div>
              </div>
            ) : (
              <div style={{display:'flex',flexDirection:'column',gap:0,height:'100%'}}>
                {/* video embed */}
                <div style={{
                  background:'#000',
                  aspectRatio:'16/9',
                  flexShrink:0,
                }}>
                  <iframe
                    key={active.id}
                    width="100%" height="100%"
                    src={`https://www.youtube.com/embed/${active.id}?autoplay=1&rel=0`}
                    title={active.title}
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    style={{display:'block',width:'100%',height:'100%'}}
                  />
                </div>

                {/* info + add button */}
                <div style={{padding:'14px 16px',flex:1}}>
                  <div style={{
                    fontFamily:"'VT323',monospace",fontSize:'1.3rem',
                    color:'var(--text)',lineHeight:1.3,marginBottom:6,
                  }}>{active.title}</div>
                  <div style={{fontSize:'.75rem',color:'var(--grey)',marginBottom:12}}>
                    📺 {active.channel}
                  </div>
                  <button className="btn btn-primary"
                    onClick={() => addToWishlist(active.title)}
                    style={{fontSize:'.85rem',padding:'8px 18px'}}>
                    + Add to Nani's Wishlist
                  </button>
                  <div style={{fontSize:'.65rem',color:'var(--grey)',marginTop:8}}>
                    Unseen videos are shown first · seen videos are marked automatically
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
