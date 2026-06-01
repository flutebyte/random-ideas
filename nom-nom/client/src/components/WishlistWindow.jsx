import { useState } from 'react';
import socket from '../socket';
import { showToast } from './Toast';

const CATEGORIES = [
  { value:'🍛', label:'🍛 Curry' },
  { value:'🍚', label:'🍚 Rice'  },
  { value:'🫓', label:'🫓 Roti'  },
  { value:'🍜', label:'🍜 Dal'   },
  { value:'🥗', label:'🥗 Sabzi' },
  { value:'🍮', label:'🍮 Sweet' },
  { value:'🥤', label:'🥤 Drink' },
  { value:'🍿', label:'🍿 Snack' },
];

const STATUS_TABS = [
  { key:'all',     label:'All'        },
  { key:'pending', label:'⏳ Pending' },
  { key:'done',    label:'✅ Eaten'   },
  { key:'mine',    label:'👤 Mine'    },
];

export default function WishlistWindow({ dishes, user }) {
  const [dishName,   setDishName]   = useState('');
  const [emoji,      setEmoji]      = useState('🍛');
  const [statusFilter, setStatus]   = useState('all');
  const [catFilter,  setCat]        = useState('all');
  const [newestFirst, setNewest]    = useState(true);

  function addDish() {
    const name = dishName.trim();
    if (!name) { showToast('Type a dish name first! 🍳'); return; }
    socket.emit('add_dish', { name, emoji, addedBy: user.name, addedByAvatar: user.avatar });
    setDishName('');
    showToast(`${emoji} "${name}" added!`);
  }

  function toggleDone(id, isDone) {
    socket.emit('toggle_done', id);
    if (!isDone) showToast('✅ Marked as eaten!');
  }

  function deleteDish(id, name) {
    socket.emit('delete_dish', { id, requester: user.name });
    showToast(`🗑️ Removed "${name}"`);
  }

  // Filter + sort
  let visible = [...dishes];
  if (statusFilter === 'pending') visible = visible.filter(d => !d.done);
  else if (statusFilter === 'done')  visible = visible.filter(d => d.done);
  else if (statusFilter === 'mine')  visible = visible.filter(d => d.addedBy === user.name);
  if (catFilter !== 'all') visible = visible.filter(d => d.emoji === catFilter);
  if (!newestFirst) visible = visible.reverse();

  const all     = dishes;
  const eaten   = all.filter(d => d.done).length;
  const pending = all.filter(d => !d.done).length;

  return (
    <div className="window" style={{ top:'50px', left:'50%', transform:'translateX(-50%)', width:'min(560px, calc(100vw - 40px))', maxHeight:'calc(100vh - 100px)', overflowY:'auto' }}>
      <div className="titlebar">
        <div className="tb-dots"><span className="dot dot-r"/><span className="dot dot-y"/><span className="dot dot-g"/></div>
        <span className="titlebar-title">📋 wishlist.exe — Nani's Food Wishlist</span>
        <div style={{width:42}}/>
      </div>
      <div className="win-body">

        {/* ADD ROW */}
        <div style={{
          display:'flex', gap:8, alignItems:'center', flexWrap:'wrap',
          background:'linear-gradient(135deg,#fff0f5,#f0faf6)',
          border:'2px solid var(--pink)', borderRadius:10,
          padding:12, marginBottom:12,
        }}>
          <input
            type="text" value={dishName} maxLength={60}
            placeholder="What do you want Nani to cook? 🍳"
            onChange={e => setDishName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addDish()}
            style={{ flex:1, minWidth:160 }}
          />
          <select value={emoji} onChange={e => setEmoji(e.target.value)} style={{ width:120, flexShrink:0 }}>
            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <button className="btn btn-primary" onClick={addDish} style={{flexShrink:0}}>+ Add</button>
        </div>

        {/* FILTER BAR */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, marginBottom:8, flexWrap:'wrap' }}>
          <div style={{ display:'flex', gap:5 }}>
            {STATUS_TABS.map(t => (
              <button key={t.key}
                onClick={() => setStatus(t.key)}
                style={{
                  padding:'5px 13px',
                  border:`2px solid ${statusFilter===t.key?'var(--pink-dark)':'var(--pink-md)'}`,
                  borderRadius:20,
                  background: statusFilter===t.key ? 'var(--pink-deep)' : '#fff',
                  color: statusFilter===t.key ? '#fff' : 'var(--text)',
                  fontFamily:'Nunito,sans-serif', fontSize:'.78rem', fontWeight:700,
                  cursor:'pointer', transition:'all .15s', whiteSpace:'nowrap',
                }}
              >{t.label}</button>
            ))}
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <select value={catFilter} onChange={e => setCat(e.target.value)} style={{
              width:'auto', padding:'5px 24px 5px 10px',
              border:'2px solid var(--pink-md)', borderRadius:20,
              background:'#fff url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'6\'%3E%3Cpath d=\'M0 0l5 6 5-6z\' fill=\'%23c96b8a\'/%3E%3C/svg%3E") no-repeat right 8px center',
              fontFamily:'Nunito,sans-serif', fontSize:'.75rem', fontWeight:700,
              color:'var(--text)', cursor:'pointer', outline:'none', appearance:'none',
            }}>
              <option value="all">All types</option>
              {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            <button
              onClick={() => setNewest(p => !p)}
              title={newestFirst ? 'Newest first' : 'Oldest first'}
              style={{
                width:30, height:30, borderRadius:'50%',
                border:'2px solid var(--pink-md)',
                background: newestFirst ? '#fff' : 'var(--pink-deep)',
                color: newestFirst ? 'var(--pink-deep)' : '#fff',
                fontSize:'1rem', fontWeight:700, cursor:'pointer',
                display:'flex', alignItems:'center', justifyContent:'center',
                transition:'all .15s', flexShrink:0,
              }}
            >↕</button>
          </div>
        </div>

        {/* STATS */}
        <div style={{ display:'flex', gap:12, marginBottom:10, fontSize:'.7rem', color:'var(--grey)', fontWeight:600, alignItems:'center' }}>
          <span>{all.length} dish{all.length!==1?'es':''}</span>
          <span>{eaten} eaten ✅</span>
          <span>{pending} pending ⏳</span>
          <span style={{ marginLeft:'auto', color:'var(--mint-dark)', fontSize:'.68rem' }}>● live</span>
        </div>

        {/* DISH LIST */}
        <div style={{ display:'flex', flexDirection:'column', gap:7, maxHeight:340, overflowY:'auto', paddingRight:4 }}
          className="dish-scroll">
          {visible.length === 0 ? (
            <div style={{ textAlign:'center', padding:'36px 20px', color:'var(--grey)' }}>
              <div style={{ fontSize:'2.8rem', marginBottom:8 }}>🍽️</div>
              <p>{statusFilter==='mine' ? "You haven't added anything yet!" : statusFilter==='done' ? 'Nothing eaten yet!' : 'No dishes yet!'}</p>
              <p style={{ fontSize:'.75rem', marginTop:4 }}>
                {statusFilter==='mine' ? 'Add your favourites above ☝️' : statusFilter==='done' ? 'Nani is still cooking... 👵🍳' : 'Add what you want Nani to cook ☝️'}
              </p>
            </div>
          ) : visible.map(dish => (
            <DishItem key={dish._id} dish={dish} user={user} onToggle={toggleDone} onDelete={deleteDish}/>
          ))}
        </div>
      </div>
    </div>
  );
}

function DishItem({ dish, user, onToggle, onDelete }) {
  const isOwner = dish.addedBy === user.name;
  const date    = new Date(dish.createdAt).toLocaleDateString('en-IN', { day:'numeric', month:'short' });

  return (
    <div style={{
      display:'flex', alignItems:'center', gap:10,
      background: dish.done ? '#f0faf6' : '#fff',
      border:`2px solid ${dish.done?'var(--mint-md)':'var(--pink)'}`,
      borderRadius:10, padding:'9px 12px',
      transition:'all .2s', animation:'slideIn .22s ease',
      opacity: dish.done ? .8 : 1,
    }}>
      <div onClick={() => onToggle(dish._id, dish.done)} style={{
        width:22, height:22, flexShrink:0,
        border:`2.5px solid ${dish.done?'var(--mint-dark)':'var(--pink-md)'}`,
        borderRadius:5, background: dish.done?'var(--mint-dark)':'#fff',
        cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
        fontSize:'.85rem', color:'#fff', transition:'all .15s',
      }}>{dish.done ? '✓' : ''}</div>

      <span style={{ fontSize:'1.3rem', flexShrink:0 }}>{dish.emoji}</span>

      <div style={{ flex:1, minWidth:0 }}>
        <div className="vt" style={{
          fontSize:'1.25rem', letterSpacing:'.4px',
          color: dish.done ? 'var(--grey)' : 'var(--text)',
          textDecoration: dish.done ? 'line-through' : 'none',
          whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
        }}>{dish.name}</div>
        <div style={{ fontSize:'.72rem', color:'var(--grey)', marginTop:1 }}>
          {dish.addedByAvatar} requested by {dish.addedBy} · {date}
        </div>
      </div>

      {isOwner && (
        <button onClick={() => onDelete(dish._id, dish.name)} style={{
          width:26, height:26, border:'1.5px solid #ffb3c1',
          borderRadius:6, background:'#fff5f8', cursor:'pointer',
          display:'flex', alignItems:'center', justifyContent:'center',
          fontSize:'.72rem', color:'#ff6b8a', transition:'all .15s', flexShrink:0,
        }}
          onMouseEnter={e => { e.currentTarget.style.background='#ff6b8a'; e.currentTarget.style.color='#fff'; }}
          onMouseLeave={e => { e.currentTarget.style.background='#fff5f8'; e.currentTarget.style.color='#ff6b8a'; }}
        >✕</button>
      )}
    </div>
  );
}
