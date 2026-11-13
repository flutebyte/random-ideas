// content.js — runs on TradingView. Detects the active symbol, injects a
// draggable signal panel, asks the background worker to analyze, and renders.
(() => {
  if (window.__forexLensLoaded) return;
  window.__forexLensLoaded = true;

  let manualSymbol = null;
  let autoTimer = null;
  let lastSymbol = null;

  // ---- live price sampler ----------------------------------------------
  // Samples the chart price (from the page title) every second into 1-minute
  // bars. This is the user's real broker feed; Yahoo is ~10 min delayed and
  // quotes futures, so the background worker fuses the two (engine/live.js).
  const TICK = (window.__flLive = { bars: [], price: null, sym: null });
  function priceFromTitle(t) {
    const m = String(t || '').match(/\s(\d[\d,]*\.?\d*)\s*[▲▼▶]/) || String(t || '').match(/\s(\d[\d,]*\.\d+)\s/);
    const v = m ? parseFloat(m[1].replace(/,/g, '')) : NaN;
    return v > 0 ? v : null;
  }
  function loadBars(sym) {
    try { TICK.bars = JSON.parse(localStorage.getItem('fl-bars-' + sym) || '[]'); } catch { TICK.bars = []; }
    TICK.sym = sym;
  }
  setInterval(() => {
    const sym = detectChartSymbol(), p = priceFromTitle(document.title);
    // price on screen is for the chart symbol; a typed symbol only counts if it IS the chart's
    if (manualSymbol && normSym(manualSymbol) !== normSym(sym)) return;
    if (!sym || !p) return;
    if (TICK.sym !== sym) loadBars(sym);
    TICK.price = p;
    const t = Math.floor(Date.now() / 60000) * 60000, last = TICK.bars[TICK.bars.length - 1];
    if (last && last.t === t) { last.h = Math.max(last.h, p); last.l = Math.min(last.l, p); last.c = p; }
    else { TICK.bars.push({ t, o: p, h: p, l: p, c: p }); if (TICK.bars.length > 400) TICK.bars.shift(); }
  }, 1000);
  setInterval(() => { if (TICK.sym) try { localStorage.setItem('fl-bars-' + TICK.sym, JSON.stringify(TICK.bars)); } catch {} }, 10000);

  // ---- symbol detection ------------------------------------------------
  function normSym(s) {
    return String(s || '').toUpperCase().split(':').pop().split(',')[0].replace(/[^A-Z0-9]/g, '');
  }
  function detectSymbol() {
    return manualSymbol || detectChartSymbol();
  }
  function detectChartSymbol() {
    // 1) URL ?symbol=FX:EURUSD
    const u = new URLSearchParams(location.search).get('symbol');
    if (u) return decodeURIComponent(u);
    // 2) /symbols/EURUSD/
    const pm = location.pathname.match(/\/symbols\/([A-Za-z0-9:_-]+)/);
    if (pm) return pm[1];
    // 3) chart legend / header element
    const el = document.querySelector('[data-name="legend-source-title"], [class*="mainTitle"], [class*="symbolName"]');
    if (el && el.textContent) {
      // The legend holds a logo-letter badge ("S") before the name; innerText
      // puts it on its own line, so take the last line ("SPX 500, Daily").
      const lines = (el.innerText || el.textContent).split('\n').map(x => x.trim()).filter(Boolean);
      const t = (lines[lines.length - 1] || '').split(',')[0].trim().replace(/\s+/g, '');
      if (/^[A-Za-z][A-Za-z0-9]{2,11}$/.test(t)) return t;
    }
    // 4) document.title, e.g. "EURUSD 1.0853 ..." or "EUR/USD, 1.08 ..."
    const m = document.title.match(/^([A-Za-z]{2,6}\/?[A-Za-z]{2,6})/);
    if (m) return m[1].replace('/', '');
    return null;
  }

  // ---- panel construction ---------------------------------------------
  const panel = document.createElement('div');
  panel.id = 'forexlens-panel';
  panel.innerHTML = `
    <div id="fl-head">
      <span id="fl-logo">◆ ForexLens</span>
      <span id="fl-sym"></span>
      <button id="fl-refresh" title="Refresh">⟳</button>
      <button id="fl-min" title="Minimize">–</button>
    </div>
    <div id="fl-body">
      <div id="fl-banner"></div>
      <div id="fl-badge">…</div>
      <div id="fl-confwrap"><div id="fl-conf"></div></div>
      <div id="fl-advice"></div>
      <div id="fl-meta"></div>
      <div id="fl-reasons"></div>
      <div id="fl-levels"></div>
      <div id="fl-paper"></div>
      <div id="fl-news"></div>
      <div id="fl-llm"></div>
      <div id="fl-engrow">
        <label>engine
          <select id="fl-engine">
            <option value="scalp">Scalp (3-min, best setup only)</option>
            <option value="scalp-any">Scalp (3-min, ANY time)</option>
            <option value="tori">Tori (trendlines)</option>
            <option value="indicators">Indicators</option>
          </select>
        </label>
      </div>
      <div id="fl-tfs">
        <label>TF
          <select id="fl-fasttf">
            <option>5m</option><option>15m</option><option>30m</option><option>1h</option>
          </select>
        </label>
        <label>vs
          <select id="fl-slowtf">
            <option>15m</option><option>30m</option><option>1h</option>
            <option>1d</option><option>1wk</option><option value="1mo">1mo</option>
          </select>
        </label>
        <label title="context = higher TF is guidance; strict = only trade with the higher trend">
          <select id="fl-htfmode">
            <option value="context">context</option><option value="filter">strict</option>
          </select>
        </label>
      </div>
      <div id="fl-manual">
        <input id="fl-input" placeholder="symbol e.g. EURUSD" spellcheck="false"/>
        <button id="fl-set">set</button>
        <label id="fl-autolabel"><input type="checkbox" id="fl-auto" checked/> auto</label>
      </div>
      <div id="fl-goldnote"></div>
      <div id="fl-disc">Signals are probabilistic, not advice. Test on demo. Never risk what you can't lose.</div>
    </div>`;
  document.documentElement.appendChild(panel);

  const $ = id => panel.querySelector(id);

  // ---- drag ------------------------------------------------------------
  (() => {
    const head = $('#fl-head');
    let dx = 0, dy = 0, dragging = false;
    head.addEventListener('mousedown', e => {
      if (e.target.tagName === 'BUTTON') return;
      dragging = true;
      dx = e.clientX - panel.offsetLeft;
      dy = e.clientY - panel.offsetTop;
      e.preventDefault();
    });
    window.addEventListener('mousemove', e => {
      if (!dragging) return;
      panel.style.left = Math.max(0, e.clientX - dx) + 'px';
      panel.style.top = Math.max(0, e.clientY - dy) + 'px';
      panel.style.right = 'auto';
    });
    window.addEventListener('mouseup', () => { dragging = false; });
  })();

  // ---- controls --------------------------------------------------------
  $('#fl-refresh').addEventListener('click', () => run(true));
  $('#fl-min').addEventListener('click', () => {
    const b = $('#fl-body');
    const hidden = b.style.display === 'none';
    b.style.display = hidden ? 'block' : 'none';
    $('#fl-min').textContent = hidden ? '–' : '+';
  });
  $('#fl-set').addEventListener('click', () => {
    const v = $('#fl-input').value.trim();
    manualSymbol = v || null;
    run(true);
  });
  $('#fl-input').addEventListener('keydown', e => { if (e.key === 'Enter') $('#fl-set').click(); });
  $('#fl-auto').addEventListener('change', e => setupAuto(e.target.checked));

  // Timeframe selectors — load current values, save + re-run on change.
  chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, s => {
    if (chrome.runtime.lastError || !s) return;
    if (s.fastTf) $('#fl-fasttf').value = s.fastTf;
    if (s.slowTf) $('#fl-slowtf').value = s.slowTf;
    if (s.htfMode) $('#fl-htfmode').value = s.htfMode;
    if (s.engine) $('#fl-engine').value = s.engine;
    toggleTfRow();
  });
  function toggleTfRow() {
    // Tori is fixed to 4h — the confluence TF selectors don't apply there.
    $('#fl-tfs').style.display = ['tori', 'scalp', 'scalp-any'].includes($('#fl-engine').value) ? 'none' : 'flex';
  }
  function saveTf() {
    const settings = {
      engine: $('#fl-engine').value,
      fastTf: $('#fl-fasttf').value, slowTf: $('#fl-slowtf').value,
      htfMode: $('#fl-htfmode').value
    };
    chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings }, () => run(true));
  }
  $('#fl-engine').addEventListener('change', () => { toggleTfRow(); saveTf(); });
  $('#fl-fasttf').addEventListener('change', saveTf);
  $('#fl-slowtf').addEventListener('change', saveTf);
  $('#fl-htfmode').addEventListener('change', saveTf);

  // ---- rendering -------------------------------------------------------
  function render(sig) {
    const badge = $('#fl-badge');
    if (!sig || !sig.ok) {
      badge.textContent = 'NO DATA';
      badge.className = 'wait';
      $('#fl-advice').textContent = '';
      $('#fl-advice').className = '';
      $('#fl-meta').textContent = sig?.error || 'Could not fetch data for this symbol.';
      $('#fl-reasons').innerHTML = '';
      $('#fl-levels').innerHTML = '';
      $('#fl-conf').style.width = '0%';
      $('#fl-news').innerHTML = '';
      $('#fl-banner').innerHTML = '';
      $('#fl-body').classList.remove('newsfocus');
      $('#fl-llm').innerHTML = '';
      return;
    }
    const stance = sig.stance || sig.action;
    const cls = stance === 'BUY' ? 'buy' : stance === 'SELL' ? 'sell' : 'wait';
    badge.textContent = stance;
    badge.className = cls;

    $('#fl-conf').style.width = sig.confidence + '%';
    $('#fl-conf').className = cls;

    // "What to do" — the plain instruction, tiered by conviction.
    const adv = $('#fl-advice');
    adv.textContent = sig.advice || '';
    adv.className = 'tier-' + (sig.tier || 'wait');

    const align = sig.alignment
      ? `<span class="fl-tag ${sig.alignment}">${sig.fastTf}↔${sig.slowTf} ${sig.alignment}</span>` : '';
    $('#fl-meta').innerHTML =
      `<b>${sig.confidence}%</b> confidence · score ${sig.score} · px ${fmtPx(sig.price)} ${align}`;

    $('#fl-reasons').innerHTML = sig.reasons.map(r =>
      `<div class="fl-r"><span class="fl-dot ${r.vote}"></span>${r.name}
       <span class="fl-rd">${r.detail}</span></div>`).join('');

    lastLevels = sig.levels || null; lastFeed = sig.feed || null;
    renderLevels();
    paperOnSignal(sig);

    // ---- news layer: RED (high-impact) events take over the panel ----
    renderNews(sig);

    if (sig.llm) {
      const v = sig.llm.verdict;
      const vc = v === 'CONFIRM' ? 'buy' : v === 'VETO' ? 'sell' : 'neutral';
      $('#fl-llm').innerHTML =
        `<div class="fl-llm"><span class="fl-tag ${vc}">Gemini ${v}</span>
         <span class="fl-rd">${escapeHtml(sig.llm.note || '')} · risk ${sig.llm.risk}</span></div>`;
    } else {
      $('#fl-llm').innerHTML = '';
    }
  }

  function fv(x) { return x === '' || x == null ? '—' : x; }

  function renderNews(sig) {
    const news = sig.news;
    const banner = $('#fl-banner');
    const body = $('#fl-body');
    if (!news || !news.ok) { banner.innerHTML = ''; $('#fl-news').innerHTML = ''; body.classList.remove('newsfocus'); return; }

    // RED FOCUS: a high-impact event is inside the window -> panel focuses on news.
    if (news.level === 'high' && news.active) {
      const a = news.active;
      const when = a.minsAway >= 0 ? `in ${a.minsAway} min` : `${-a.minsAway} min ago`;
      banner.className = 'red';
      banner.innerHTML =
        `<div class="fl-bhead">🔴 RED NEWS ${when} — STAND ASIDE</div>
         <div class="fl-btitle">${escapeHtml(a.ccy)} · ${escapeHtml(a.title)}</div>
         <div class="fl-bfc">forecast <b>${escapeHtml(fv(a.forecast))}</b> · prev <b>${escapeHtml(fv(a.previous))}</b></div>`;
      body.classList.add('newsfocus'); // dim the chart signal below
      $('#fl-news').innerHTML = '';
      return;
    }
    body.classList.remove('newsfocus');

    // MEDIUM active -> caution strip (not a takeover)
    if (news.level === 'medium' && news.active) {
      const a = news.active;
      const when = a.minsAway >= 0 ? `in ${a.minsAway}m` : `${-a.minsAway}m ago`;
      banner.className = 'orange';
      banner.innerHTML = `<div class="fl-bhead">🟠 Medium news ${when} — reduced confidence</div>
        <div class="fl-btitle">${escapeHtml(a.ccy)} · ${escapeHtml(a.title)}</div>`;
    } else {
      banner.className = '';
      banner.innerHTML = '';
    }

    // Always show a countdown to the next RED event (what you care about most).
    const nh = news.nextHigh;
    if (nh) {
      const t = nh.minsAway >= 60 ? `${Math.floor(nh.minsAway / 60)}h ${nh.minsAway % 60}m` : `${nh.minsAway}m`;
      $('#fl-news').innerHTML =
        `<div class="fl-llm"><span class="fl-tag sell">next 🔴 in ${t}</span>
         <span class="fl-rd">${escapeHtml(nh.ccy)} · ${escapeHtml(nh.title)}</span></div>`;
    } else if (news.next) {
      const n = news.next;
      const t = n.minsAway >= 60 ? `${Math.floor(n.minsAway / 60)}h ${n.minsAway % 60}m` : `${n.minsAway}m`;
      $('#fl-news').innerHTML =
        `<div class="fl-llm"><span class="fl-tag mixed">next ${n.impact} in ${t}</span>
         <span class="fl-rd">${escapeHtml(n.ccy)} · ${escapeHtml(n.title)}</span></div>`;
    } else {
      $('#fl-news').innerHTML = '';
    }
  }

  function fmtPx(p) {
    if (p == null) return '—';
    return p >= 100 ? p.toFixed(2) : p >= 1 ? p.toFixed(4) : p.toFixed(5);
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  // Levels are shown as POINT DISTANCES (feed-independent) and re-based onto the
  // broker price the user types, because Yahoo's feed (futures, delayed) differs
  // from the broker's CFD price by a moving premium.
  let lastLevels = null, lastFeed = null;
  function renderLevels() {
    const box = $('#fl-levels');
    if (!lastLevels) { box.innerHTML = '<div class="fl-lv fl-muted">No trade — waiting for confluence.</div>'; return; }
    const L = lastLevels, buy = L.target > L.entry;
    const risk = Math.abs(L.entry - L.stop), reward = Math.abs(L.target - L.entry);
    const fresh = Date.now() - Number(localStorage.getItem('fl-mypx-t') || 0) < 120000; // expires after 2 min
    const my = fresh ? parseFloat(localStorage.getItem('fl-mypx')) : NaN;
    const e = my > 0 ? my : (lastFeed === 'live' && TICK.price ? TICK.price : L.entry);
    const st = buy ? e - risk : e + risk, tg = buy ? e + reward : e - reward;
    box.innerHTML =
      `<div class="fl-lv">
         <span>entry <b>${fmtPx(e)}</b></span>
         <span class="sell">stop <b>${fmtPx(st)}</b> (${buy ? '-' : '+'}${risk.toFixed(1)} pts)</span>
         <span class="buy">target <b>${fmtPx(tg)}</b> (${buy ? '+' : '-'}${reward.toFixed(1)} pts)</span>
         <span>R:R 1:${L.rr}</span>
       </div>
       <div class="fl-lv"><span>your broker price: <input id="fl-mypx" type="number" step="0.01" style="width:90px" value="${my > 0 ? my : ''}" placeholder="${fmtPx(L.entry)}"/>
         <small class="fl-muted">${my > 0 ? 're-based (expires in 2 min)' : 'type it to re-base levels (feed price differs)'}</small></span></div>`;
    const inp = $('#fl-mypx');
    inp.addEventListener('change', () => { localStorage.setItem('fl-mypx', inp.value || ''); localStorage.setItem('fl-mypx-t', Date.now()); renderLevels(); });
  }


  // ---- paper trading tracker (scalp mode) ---------------------------------
  // Every scalp call is "taken" in a simulated account using the LIVE chart price:
  // stop -> -1R, target -> +2R, otherwise closed at market after the hold time.
  // Results persist in localStorage so the win rate is real, not a backtest.
  const PK = 'fl-paper-v1';
  let paper = (() => { try { return JSON.parse(localStorage.getItem(PK)) || { open: null, closed: [] }; } catch { return { open: null, closed: [] }; } })();
  function paperSave() { try { localStorage.setItem(PK, JSON.stringify({ open: paper.open, closed: paper.closed.slice(-300) })); } catch {} }
  let spreadPts = 0;
  chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, s => { if (!chrome.runtime.lastError && s) spreadPts = Number(s.spreadPts) || 0; });

  function paperOnSignal(sig) {
    if (!sig || !sig.ok || !sig.scalp || !sig.levels || !TICK.price) return;
    if (paper.open) return;                                   // one paper trade at a time
    const buy = sig.levels.target > sig.levels.entry;
    const risk = Math.abs(sig.levels.entry - sig.levels.stop), reward = Math.abs(sig.levels.target - sig.levels.entry);
    const e = TICK.price;                                     // fill at the live chart price
    paper.open = { sym: sig.symbol, side: buy ? 'BUY' : 'SELL', e, stop: buy ? e - risk : e + risk, target: buy ? e + reward : e - reward,
      risk, t: Date.now(), holdMs: sig.scalp.holdMin * 60000, forced: !!sig.forced };
    paperSave(); paperRender();
  }
  function paperTick() {
    const o = paper.open, p = TICK.price;
    if (!o || !p) return;
    const buy = o.side === 'BUY';
    let exit = null, why = '';
    if (buy ? p <= o.stop : p >= o.stop) { exit = o.stop; why = 'stop'; }
    else if (buy ? p >= o.target : p <= o.target) { exit = o.target; why = 'target'; }
    else if (Date.now() - o.t >= o.holdMs) { exit = p; why = 'time'; }
    if (exit == null) { paperRender(); return; }
    const pnl = (buy ? exit - o.e : o.e - exit) - spreadPts;
    paper.closed.push({ ...o, exit, why, r: pnl / o.risk, tEnd: Date.now() });
    paper.open = null; paperSave(); paperRender();
    setTimeout(() => run(true), 500);                         // immediately look for the next call
  }
  function paperRender() {
    const box = $('#fl-paper'); if (!box) return;
    const c = paper.closed, n = c.length, w = c.filter(t => t.r > 0).length, net = c.reduce((a, t) => a + t.r, 0);
    const o = paper.open;
    let openTxt = '<span class="fl-muted">no open paper trade — next call opens one</span>';
    if (o) {
      const left = Math.max(0, Math.round((o.t + o.holdMs - Date.now()) / 1000));
      const live = TICK.price ? ((o.side === 'BUY' ? TICK.price - o.e : o.e - TICK.price) / o.risk) : 0;
      openTxt = `<b>${o.side}</b> @ ${fmtPx(o.e)} · exit ${String(Math.floor(left / 60))}:${String(left % 60).padStart(2, '0')} · now ${live >= 0 ? '+' : ''}${live.toFixed(2)}R`;
    }
    box.innerHTML = `<div class="fl-lv"><span>📝 paper: ${openTxt}</span></div>
      <div class="fl-lv"><span>${n} trades · ${n ? Math.round(100 * w / n) : 0}% win · net <b class="${net >= 0 ? 'buy' : 'sell'}">${net.toFixed(2)}R</b> <small class="fl-muted">(after ${spreadPts} pt spread)</small>
      <a href="#" id="fl-paper-reset" class="fl-muted">reset</a></span></div>`;
    const rs = $('#fl-paper-reset');
    if (rs) rs.onclick = ev => { ev.preventDefault(); paper = { open: null, closed: [] }; paperSave(); paperRender(); };
  }
  setInterval(paperTick, 1000);
  paperRender();

  // ---- run cycle -------------------------------------------------------
  let busy = false;
  function run(force) {
    const sym = detectSymbol();
    const isGold = /XAU|GOLD|GC=F/i.test(sym || '');
    $('#fl-sym').textContent = (isGold ? '🥇 ' : '') + (sym || '(no symbol)');
    const isIdx = /^(\^|SPX|SP500|US500|NDX|NAS100|US100|USTEC|DJI|US30|DJ30|DOW|RUT|US2000|DAX|GER40|DE40|UK100|FTSE|NI225|JP225|HSI|HK50|CAC40|FRA40|NIFTY|SENSEX)/i.test((sym || '').split(':').pop());
    const toriOn = $('#fl-engine').value === 'tori', scalpOn = ['scalp', 'scalp-any'].includes($('#fl-engine').value);
    $('#fl-goldnote').innerHTML = scalpOn
      ? 'Scalp mode: always a BUY/SELL call with entry, stop, target and a 3-min exit. Low-conviction calls are labelled. Every call is paper-traded below so you can see the real win rate.'
      : toriOn
      ? 'Tori 4h trendline-break strategy (from the video): BUY/SELL only on a 4h close through a 3-touch line; otherwise do nothing. Exit on the safety-line break.'
      : sym && isIdx
      ? 'Index SCALP profile: 1m + 5m trend, 1:2 R:R, 3-min exit. Edge only exists if your spread is tiny — set it in the popup.'
      : sym && !isGold
      ? '⚠ This engine is tuned for <b>XAUUSD (gold)</b> — it has little edge here.'
      : '';
    if (!sym) { render({ ok: false, error: 'No symbol detected. Type one below.' }); return; }
    if (busy && !force) return;
    busy = true;
    $('#fl-badge').textContent = '…';
    const liveBars = TICK.sym && normSym(TICK.sym) === normSym(sym) ? TICK.bars : null;
    chrome.runtime.sendMessage({ type: 'ANALYZE', symbol: sym, liveBars }, resp => {
      busy = false;
      if (chrome.runtime.lastError) {
        render({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      render(resp);
    });
    lastSymbol = sym;
  }

  function setupAuto(on) {
    if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
    if (on) autoTimer = setInterval(() => run(false), 20000);
  }

  // Re-run when the user switches symbol (title changes on TradingView).
  const titleObs = new MutationObserver(() => {
    const s = detectSymbol();
    if (s && s !== lastSymbol && !manualSymbol) run(true);
  });
  const titleEl = document.querySelector('title');
  if (titleEl) titleObs.observe(titleEl, { childList: true });

  setupAuto(true);
  setTimeout(() => run(true), 1200); // let TradingView paint first
})();
