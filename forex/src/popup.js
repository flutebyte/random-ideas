const fields = ['fastTf', 'slowTf', 'rr', 'atrMult', 'spreadPts', 'notify', 'notifyMinConfidence', 'useGemini', 'geminiKey'];

function load() {
  chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, s => {
    if (!s) return;
    for (const f of fields) {
      const el = document.getElementById(f);
      if (!el) continue;
      if (el.type === 'checkbox') el.checked = !!s[f];
      else el.value = s[f];
    }
  });
}

function save() {
  const settings = {};
  for (const f of fields) {
    const el = document.getElementById(f);
    if (!el) continue;
    if (el.type === 'checkbox') settings[f] = el.checked;
    else if (el.type === 'number') settings[f] = parseFloat(el.value);
    else settings[f] = el.value;
  }
  chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings }, () => {
    const st = document.getElementById('status');
    st.textContent = '✓ saved — refresh TradingView to apply';
    setTimeout(() => (st.textContent = ''), 2500);
  });
}

document.getElementById('save').addEventListener('click', save);
load();
