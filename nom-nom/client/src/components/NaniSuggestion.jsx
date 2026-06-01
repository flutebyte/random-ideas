import { useState, useEffect } from 'react';
import socket from '../socket';

// Nani picks a random dish from trending and suggests it
const SUGGESTIONS = [
  { name: 'Biryani',          emoji: '🍛', msg: "Beta, you haven't added biryani yet. What is this life?" },
  { name: 'Kheer',            emoji: '🍮', msg: "I already know you want kheer. Just add it. I'll make extra." },
  { name: 'Aloo Paratha',     emoji: '🫓', msg: "Aloo paratha with white butter. Say no more. Add it." },
  { name: 'Mango Lassi',      emoji: '🥤', msg: "It's summer. You NEED mango lassi. I insist." },
  { name: 'Gulab Jamun',      emoji: '🍮', msg: "Gulab jamun? I already made the syrup. Just add it to the list." },
  { name: 'Chole Bhature',    emoji: '🍛', msg: "Sunday morning. Chole bhature. This is not a suggestion, it's a schedule." },
  { name: 'Halwa',            emoji: '🍮', msg: "You look tired. Halwa fixes everything. Add it." },
  { name: 'Rajma Chawal',     emoji: '🍚', msg: "Rajma chawal is love. Rajma chawal is life. Add it beta." },
];

const SEEN_KEY = 'nk_suggestion_seen';

export default function NaniSuggestion({ user, onClose }) {
  const [suggestion] = useState(() => {
    const seen = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]');
    const unseen = SUGGESTIONS.filter(s => !seen.includes(s.name));
    const pool = unseen.length > 0 ? unseen : SUGGESTIONS;
    return pool[Math.floor(Math.random() * pool.length)];
  });

  function addToWishlist() {
    socket.emit('add_dish', {
      name: suggestion.name,
      emoji: suggestion.emoji,
      addedBy: user.name,
      addedByAvatar: user.avatar,
    });
    // Mark as seen
    const seen = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]');
    if (!seen.includes(suggestion.name)) {
      seen.push(suggestion.name);
      localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
    }
    onClose(true); // true = added
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(90,58,74,.4)',
      zIndex: 550, display: 'flex', alignItems: 'center', justifyContent: 'center',
      animation: 'fadeIn .2s ease',
    }}>
      <div className="window" style={{
        position: 'relative', width: 'min(340px, calc(100vw - 40px))',
        animation: 'popIn .3s cubic-bezier(.34,1.56,.64,1)',
      }}>
        <div className="titlebar">
          <div className="tb-dots">
            <span className="dot dot-r" onClick={() => onClose(false)} style={{ cursor: 'pointer' }} />
            <span className="dot dot-y" />
            <span className="dot dot-g" />
          </div>
          <span className="titlebar-title">👵 nani_suggestion.exe</span>
          <div style={{ width: 42 }} />
        </div>

        <div className="win-body" style={{ padding: 22, textAlign: 'center' }}>
          <div style={{ fontSize: '3.5rem', marginBottom: 8, animation: 'bounce 2s ease-in-out infinite' }}>
            👵
          </div>
          <div style={{
            fontFamily: "'VT323', monospace", fontSize: '1.3rem',
            color: 'var(--pink-deep)', marginBottom: 12,
          }}>
            Nani has a suggestion...
          </div>

          {/* suggestion card */}
          <div style={{
            background: 'linear-gradient(135deg,#fff0f5,#f0faf6)',
            border: '2px solid var(--pink)', borderRadius: 12,
            padding: '14px 16px', marginBottom: 14,
          }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 6 }}>{suggestion.emoji}</div>
            <div style={{
              fontFamily: "'VT323', monospace", fontSize: '1.5rem',
              color: 'var(--text)', marginBottom: 8,
            }}>{suggestion.name}</div>
            <div style={{
              fontFamily: "'Caveat', cursive", fontSize: '1.1rem',
              color: 'var(--text)', lineHeight: 1.4,
              background: '#fff', border: '1.5px solid var(--pink)',
              borderRadius: 8, padding: '8px 12px',
            }}>
              "{suggestion.msg}"
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button className="btn btn-primary" onClick={addToWishlist}>
              ✅ Add it, Nani!
            </button>
            <button className="btn btn-ghost" onClick={() => onClose(false)}>
              🙈 Maybe later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
