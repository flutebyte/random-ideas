// content.js — runs on TradingView. Detects the active symbol, injects a
// draggable signal panel, asks the background worker to analyze, and renders.
(() => {
  if (window.__forexLensLoaded) return;
  window.__forexLensLoaded = true;

  let manualSymbol = null;
  let autoTimer = null;
  let lastSymbol = null;

  // ---- symbol detection ------------------------------------------------
  function detectSymbol() {
    if (manualSymbol) return manualSymbol;
    // 1) URL ?symbol=FX:EURUSD
    const u = new URLSearchParams(location.search).get('symbol');
    if (u) return decodeURIComponent(u);
    // 2) /symbols/EURUSD/
    const pm = location.pathname.match(/\/symbols\/([A-Za-z0-9:_-]+)/);
    if (pm) return pm[1];
    // 3) chart legend / header element
    const el = document.querySelector('[data-name="legend-source-title"], [class*="mainTitle"], [class*="symbolName"]');
    if (el && el.textContent) {
      const t = el.textContent.trim().replace(/\s+/g, '');
      if (/^[A-Za-z]{3,12}$/.test(t)) return t;
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
      <div id="fl-news"></div>
      <div id="fl-llm"></div>
      <div id="fl-engrow">
        <label>engine
          <select id="fl-engine">
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
    $('#fl-tfs').style.display = $('#fl-engine').value === 'tori' ? 'none' : 'flex';
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

    if (sig.levels) {
      const L = sig.levels;
      $('#fl-levels').innerHTML =
        `<div class="fl-lv">
          <span>entry <b>${fmtPx(L.entry)}</b></span>
          <span class="sell">stop <b>${fmtPx(L.stop)}</b></span>
          <span class="buy">target <b>${fmtPx(L.target)}</b></span>
          <span>R:R 1:${L.rr}</span>
        </div>`;
    } else {
      $('#fl-levels').innerHTML = '<div class="fl-lv fl-muted">No trade — waiting for confluence.</div>';
    }

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

  // ---- run cycle -------------------------------------------------------
  let busy = false;
  function run(force) {
    const sym = detectSymbol();
    const isGold = /XAU|GOLD|GC=F/i.test(sym || '');
    $('#fl-sym').textContent = (isGold ? '🥇 ' : '') + (sym || '(no symbol)');
    const isIdx = /^(\^|SPX|SP500|US500|NDX|NAS100|US100|USTEC|DJI|US30|DJ30|DOW|RUT|US2000|DAX|GER40|DE40|UK100|FTSE|NI225|JP225|HSI|HK50|CAC40|FRA40|NIFTY|SENSEX)/i.test((sym || '').split(':').pop());
    $('#fl-goldnote').innerHTML = sym && isIdx
      ? 'Index SCALP profile: 1m + 5m trend, 1:2 R:R, 3-min exit. Edge only exists if your spread is tiny — set it in the popup.'
      : sym && !isGold
      ? '⚠ This engine is tuned for <b>XAUUSD (gold)</b> — it has little edge here.'
      : '';
    if (!sym) { render({ ok: false, error: 'No symbol detected. Type one below.' }); return; }
    if (busy && !force) return;
    busy = true;
    $('#fl-badge').textContent = '…';
    chrome.runtime.sendMessage({ type: 'ANALYZE', symbol: sym }, resp => {
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
