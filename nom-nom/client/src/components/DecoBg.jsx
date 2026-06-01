import { useMemo } from 'react';

const ITEMS = ['♥','♡','🌸','✿','❀','💕','🌺','✦','🍃'];

export default function DecoBg() {
  const els = useMemo(() => Array.from({ length: 20 }, (_, i) => ({
    id: i,
    symbol: ITEMS[Math.floor(Math.random() * ITEMS.length)],
    left:     Math.random() * 100,
    duration: 9 + Math.random() * 14,
    delay:    Math.random() * 14,
    size:     0.7 + Math.random() * 1.1,
  })), []);

  return (
    <div style={{ position:'fixed', inset:0, pointerEvents:'none', zIndex:0, overflow:'hidden' }}>
      {els.map(e => (
        <span key={e.id} style={{
          position: 'absolute',
          left: `${e.left}vw`,
          fontSize: `${e.size}rem`,
          animation: `floatUp ${e.duration}s ${e.delay}s linear infinite`,
          opacity: .35,
        }}>{e.symbol}</span>
      ))}
    </div>
  );
}
