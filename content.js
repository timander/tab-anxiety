// Tab Anxiety — Content Script v2

// ─── Styles ───────────────────────────────────────────────────────────────────
const TA_STYLES = `
  * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }

  /* ── Toast ─────────────────────────────────────────────────────── */
  .ta-toast {
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: #1e1e2e;
    border: 1px solid #6366f1;
    border-radius: 8px;
    color: #a5b4fc;
    font-size: 12px;
    font-weight: 500;
    padding: 8px 14px;
    z-index: 2147483647;
    animation: ta-toast-in 0.15s ease-out, ta-toast-out 0.2s ease-in 1.8s forwards;
    pointer-events: none;
  }
  .ta-toast.info    { border-color: #6366f1; color: #a5b4fc; background: #1e1e2e; }
  .ta-toast.success { border-color: #22c55e; color: #86efac; background: #0f1e14; }
  .ta-toast.warn    { border-color: #f59e0b; color: #fcd34d; background: #1e1a0e; }
  @keyframes ta-toast-in  { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
  @keyframes ta-toast-out { to   { opacity: 0; transform: translateY(8px); } }

  /* ── Base overlay ──────────────────────────────────────────────── */
  .ta-overlay {
    position: fixed;
    top: 20px;
    right: 20px;
    width: 360px;
    background: #141414;
    border: 1px solid #2a2a2a;
    border-radius: 10px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.7);
    z-index: 2147483647;
    color: #e0e0e0;
    font-size: 13px;
    animation: ta-slide-in 0.15s ease-out;
  }
  @keyframes ta-slide-in { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: none; } }

  .ta-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px 10px;
    border-bottom: 1px solid #222;
  }
  .ta-label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #666;
  }
  .ta-close {
    background: none; border: none; color: #555; font-size: 18px; line-height: 1;
    cursor: pointer; padding: 0 2px; transition: color 0.1s;
  }
  .ta-close:hover { color: #e0e0e0; }

  .ta-tab-info { padding: 12px 14px; border-bottom: 1px solid #1e1e1e; }
  .ta-tab-title {
    font-size: 13px; font-weight: 500; color: #d0d0d0;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 4px;
  }
  .ta-tab-url {
    font-size: 11px; color: #444;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }

  /* ── Action buttons ────────────────────────────────────────────── */
  .ta-actions { padding: 10px 14px; display: flex; flex-direction: column; gap: 4px; }
  .ta-actions button {
    background: none; border: 1px solid #222; border-radius: 6px; color: #bbb;
    font-size: 13px; padding: 8px 12px; text-align: left; cursor: pointer;
    display: flex; align-items: center; gap: 10px;
    transition: background 0.1s, border-color 0.1s, color 0.1s;
  }
  .ta-actions button:hover, .ta-actions button.ta-active {
    background: #1e1e2e; border-color: #6366f1; color: #e0e0e0;
  }
  kbd {
    display: inline-block; background: #222; border: 1px solid #333; border-radius: 4px;
    padding: 1px 6px; font-size: 11px; font-family: monospace; color: #888;
    min-width: 20px; text-align: center;
  }
  .ta-actions button:hover kbd, .ta-actions button.ta-active kbd {
    background: #2e2e4e; border-color: #6366f1; color: #a5b4fc;
  }

  /* ── Inputs ────────────────────────────────────────────────────── */
  .ta-note-row { padding: 0 14px 12px; }
  .ta-note-input, .ta-group-input, .ta-scratch-input {
    width: 100%; background: #1a1a1a; border: 1px solid #333; border-radius: 6px;
    color: #e0e0e0; font-size: 13px; padding: 8px 10px; outline: none;
    transition: border-color 0.15s;
  }
  .ta-note-input:focus, .ta-group-input:focus, .ta-scratch-input:focus { border-color: #6366f1; }
  .ta-note-input::placeholder, .ta-group-input::placeholder, .ta-scratch-input::placeholder { color: #444; }

  /* ── Group picker ──────────────────────────────────────────────── */
  .ta-fixed-groups { padding: 10px 14px; display: flex; gap: 6px; }
  .ta-group-btn {
    flex: 1; background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 6px;
    color: #bbb; font-size: 12px; padding: 8px 6px; cursor: pointer; text-align: center;
    transition: background 0.1s, border-color 0.1s, color 0.1s;
  }
  .ta-group-btn:hover { background: #1e1e2e; border-color: #6366f1; color: #e0e0e0; }
  .ta-divider {
    font-size: 11px; color: #444; text-align: center; padding: 4px 14px; position: relative;
  }
  .ta-input-row { padding: 8px 14px 14px; display: flex; gap: 6px; }
  .ta-group-input { flex: 1; width: auto; }
  .ta-confirm-btn {
    background: #6366f1; border: none; border-radius: 6px; color: #fff;
    font-size: 13px; padding: 8px 14px; cursor: pointer; white-space: nowrap;
    transition: background 0.1s;
  }
  .ta-confirm-btn:hover { background: #818cf8; }

  /* ── Scratchpad ────────────────────────────────────────────────── */
  .ta-scratchpad .ta-scratch-input {
    display: block; width: calc(100% - 28px); margin: 0 14px;
    resize: vertical; font-family: inherit; line-height: 1.5;
  }
  .ta-hint { font-size: 11px; color: #444; padding: 6px 14px 12px; text-align: right; }

  /* ── Annotate ──────────────────────────────────────────────────── */
  .ta-keyword-row { padding: 0 14px 8px; display: flex; flex-wrap: wrap; gap: 5px; }
  .ta-kw-chip {
    background: #222; border: 1px solid #333; border-radius: 4px;
    color: #888; font-size: 11px; padding: 3px 8px; cursor: pointer;
    transition: background 0.1s, border-color 0.1s, color 0.1s;
  }
  .ta-kw-chip.ta-kw-on { background: #1e1e2e; border-color: #6366f1; color: #a5b4fc; }

  /* ── Banners ───────────────────────────────────────────────────── */
  .ta-banner {
    position: fixed; top: 0; left: 0; right: 0; z-index: 2147483647;
    display: flex; align-items: center; gap: 10px;
    padding: 10px 16px; font-size: 13px;
    animation: ta-banner-in 0.2s ease-out;
  }
  @keyframes ta-banner-in { from { opacity: 0; transform: translateY(-100%); } to { opacity: 1; transform: none; } }
  .ta-banner span { flex: 1; }
  .ta-banner-duplicate  { background: #1a1a2e; border-bottom: 1px solid #3730a3; color: #a5b4fc; }
  .ta-banner-bookmarked { background: #1a2a1a; border-bottom: 1px solid #166534; color: #86efac; }
  .ta-banner-captured   { background: #2a1a1a; border-bottom: 1px solid #9a3412; color: #fdba74; }
  .ta-banner-action {
    background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.15);
    border-radius: 4px; color: inherit; font-size: 12px; padding: 4px 10px;
    cursor: pointer; white-space: nowrap; transition: background 0.1s;
  }
  .ta-banner-action:hover { background: rgba(255,255,255,0.2); }
  .ta-banner-dismiss {
    background: none; border: none; color: inherit; opacity: 0.5;
    font-size: 16px; cursor: pointer; padding: 0 2px; line-height: 1; transition: opacity 0.1s;
  }
  .ta-banner-dismiss:hover { opacity: 1; }
`;

// ─── State ────────────────────────────────────────────────────────────────────
let activeOverlay = null;

// ─── Message listener ─────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'showToast')       showToast(msg.message, msg.type);
  if (msg.action === 'showTriage')      showTriage();
  if (msg.action === 'showGroupPicker') showGroupPicker();
  if (msg.action === 'showScratchpad')  showScratchpad();
  if (msg.action === 'showAnnotate')    showAnnotate();
  if (msg.action === 'showBanner')      showBanner(msg);
});

// Global Escape to dismiss active overlay
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && activeOverlay) dismissActive();
});

// ─── Toast ────────────────────────────────────────────────────────────────────
function showToast(message, type = 'info') {
  const host = document.createElement('div');
  host.setAttribute('data-ta-host', '');
  document.documentElement.appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = TA_STYLES;
  shadow.appendChild(style);
  const toast = document.createElement('div');
  toast.className = `ta-toast ${type}`;
  toast.textContent = message;
  shadow.appendChild(toast);
  setTimeout(() => host.remove(), 2100);
}

// ─── Shadow container helper ──────────────────────────────────────────────────
function createShadow(id) {
  dismissActive();
  const host = document.createElement('div');
  host.id = id;
  host.setAttribute('data-ta-host', '');
  document.documentElement.appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = TA_STYLES;
  shadow.appendChild(style);
  activeOverlay = host;
  return shadow;
}

function dismissActive() {
  if (activeOverlay) { activeOverlay.remove(); activeOverlay = null; }
}

// ─── Triage overlay ───────────────────────────────────────────────────────────
function showTriage() {
  const shadow = createShadow('ta-triage-host');
  const title = document.title;
  const url   = location.href;

  const wrap = el('div', 'ta-overlay ta-triage');
  wrap.innerHTML = `
    <div class="ta-header">
      <span class="ta-label">Triage Tab</span>
      <button class="ta-close">×</button>
    </div>
    <div class="ta-tab-info">
      <div class="ta-tab-title">${esc(title)}</div>
      <div class="ta-tab-url">${esc(url)}</div>
    </div>
    <div class="ta-actions">
      <button data-action="dismiss">  <kbd>D</kbd> Dismiss — just close it</button>
      <button data-action="reference"><kbd>R</kbd> Reference — bookmark with note</button>
      <button data-action="next">     <kbd>N</kbd> Next Action — I need to do something here</button>
      <button data-action="someday">  <kbd>S</kbd> Someday — interesting, not now</button>
      <button data-action="park">     <kbd>P</kbd> Park — move to a tab group, keep open</button>
    </div>
    <div class="ta-note-row" id="ta-note-row" hidden>
      <input class="ta-note-input" id="ta-note-input" placeholder="Quick note… (optional, Enter to save)" maxlength="200" />
    </div>
  `;
  shadow.appendChild(wrap);

  let pendingType = null;
  const noteRow   = wrap.querySelector('#ta-note-row');
  const noteInput = wrap.querySelector('#ta-note-input');

  wrap.querySelector('.ta-close').addEventListener('click', dismissActive);
  wrap.querySelectorAll('[data-action]').forEach(btn =>
    btn.addEventListener('click', () => handleAction(btn.dataset.action))
  );

  function handleAction(action) {
    if (action === 'dismiss') {
      chrome.runtime.sendMessage({ action: 'closeTab' });
      dismissActive();
      return;
    }
    if (action === 'park') { dismissActive(); showGroupPicker(); return; }
    pendingType = action;
    noteRow.hidden = false;
    noteInput.focus();
    wrap.querySelectorAll('[data-action]').forEach(b =>
      b.classList.toggle('ta-active', b.dataset.action === action)
    );
  }

  function commit() {
    chrome.runtime.sendMessage({
      action: 'saveCapture',
      data: { type: pendingType, url, title, note: noteInput.value.trim() }
    });
    dismissActive();
  }

  const onKey = (e) => {
    if (noteRow.hidden) {
      const map = { d: 'dismiss', r: 'reference', n: 'next', s: 'someday', p: 'park' };
      if (map[e.key.toLowerCase()]) { e.preventDefault(); handleAction(map[e.key.toLowerCase()]); }
    } else if (e.key === 'Enter') { e.preventDefault(); if (pendingType) commit(); }
  };
  document.addEventListener('keydown', onKey);
}

// ─── Group picker ─────────────────────────────────────────────────────────────
const FIXED_GROUPS = [
  { name: 'Reading',   color: 'blue'   },
  { name: 'Reference', color: 'grey'   },
  { name: 'Someday',   color: 'purple' }
];

function showGroupPicker() {
  const shadow = createShadow('ta-group-host');
  const wrap = el('div', 'ta-overlay ta-group-picker');
  wrap.innerHTML = `
    <div class="ta-header">
      <span class="ta-label">Park in Group</span>
      <button class="ta-close">×</button>
    </div>
    <div class="ta-fixed-groups">
      ${FIXED_GROUPS.map(g =>
        `<button class="ta-group-btn" data-name="${g.name}" data-color="${g.color}">${g.name}</button>`
      ).join('')}
    </div>
    <div class="ta-divider">or type a project name</div>
    <div class="ta-input-row">
      <input class="ta-group-input" id="ta-group-input" placeholder="Project name…" maxlength="40" />
      <button class="ta-confirm-btn">Park</button>
    </div>
  `;
  shadow.appendChild(wrap);

  wrap.querySelector('.ta-close').addEventListener('click', dismissActive);
  const input = wrap.querySelector('#ta-group-input');

  function assign(name, color) {
    if (!name) return;
    chrome.runtime.sendMessage({ action: 'assignToGroup', groupName: name, color });
    dismissActive();
  }

  wrap.querySelectorAll('.ta-group-btn').forEach(btn =>
    btn.addEventListener('click', () => assign(btn.dataset.name, btn.dataset.color))
  );
  wrap.querySelector('.ta-confirm-btn').addEventListener('click', () => assign(input.value.trim(), null));
  input.focus();

  const onKey = (e) => { if (e.key === 'Enter') assign(input.value.trim(), null); };
  document.addEventListener('keydown', onKey);
}

// ─── Scratchpad ───────────────────────────────────────────────────────────────
function showScratchpad() {
  const shadow = createShadow('ta-scratchpad-host');
  const wrap = el('div', 'ta-overlay ta-scratchpad');
  wrap.innerHTML = `
    <div class="ta-header">
      <span class="ta-label">Capture Idea</span>
      <button class="ta-close">×</button>
    </div>
    <textarea class="ta-scratch-input" id="ta-scratch"
      placeholder="What's the idea? Enter to save, Shift+Enter for new line."
      rows="3" maxlength="500"></textarea>
    <div class="ta-hint">Enter to save · Esc to cancel</div>
  `;
  shadow.appendChild(wrap);

  wrap.querySelector('.ta-close').addEventListener('click', dismissActive);
  const textarea = wrap.querySelector('#ta-scratch');
  textarea.focus();

  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const text = textarea.value.trim();
      if (text) chrome.runtime.sendMessage({ action: 'saveScratchpad', text }, dismissActive);
    }
  };
  document.addEventListener('keydown', onKey);
}

// ─── Annotate overlay (⌥A — add note/keywords without closing) ───────────────
function showAnnotate() {
  const shadow = createShadow('ta-annotate-host');
  const url   = location.href;
  const keywords = extractPageKeywords();

  const wrap = el('div', 'ta-overlay ta-annotate');
  wrap.innerHTML = `
    <div class="ta-header">
      <span class="ta-label">Annotate Tab</span>
      <button class="ta-close">×</button>
    </div>
    <div class="ta-tab-info">
      <div class="ta-tab-title">${esc(document.title)}</div>
    </div>
    <div class="ta-actions" style="padding-bottom:6px;">
      <input class="ta-note-input" id="ta-ann-note" placeholder="Add a note to this tab…" maxlength="200" style="border:1px solid #333; border-radius:6px; padding:8px 10px; background:#1a1a1a; color:#e0e0e0; font-size:13px; outline:none; width:100%;" />
    </div>
    <div class="ta-label" style="padding:0 14px 6px; font-size:10px; color:#555;">SUGGESTED KEYWORDS — click to include</div>
    <div class="ta-keyword-row" id="ta-kw-row">
      ${keywords.map(kw => `<button class="ta-kw-chip" data-kw="${esc(kw)}">${esc(kw)}</button>`).join('')}
    </div>
    <div class="ta-input-row" style="padding-top:4px;">
      <input class="ta-group-input" id="ta-ann-kw" placeholder="Add keyword…" maxlength="30" />
      <button class="ta-confirm-btn" id="ta-ann-save">Save</button>
    </div>
  `;
  shadow.appendChild(wrap);

  const noteInput = wrap.querySelector('#ta-ann-note');
  const kwInput   = wrap.querySelector('#ta-ann-kw');
  const selected  = new Set();

  wrap.querySelector('.ta-close').addEventListener('click', dismissActive);
  wrap.querySelectorAll('.ta-kw-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      chip.classList.toggle('ta-kw-on');
      chip.classList.contains('ta-kw-on') ? selected.add(chip.dataset.kw) : selected.delete(chip.dataset.kw);
    });
  });

  kwInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && kwInput.value.trim()) {
      selected.add(kwInput.value.trim().toLowerCase());
      kwInput.value = '';
      e.preventDefault();
    }
  });

  function save() {
    chrome.runtime.sendMessage({
      action: 'saveAnnotation',
      url,
      note: noteInput.value.trim(),
      keywords: [...selected]
    }, () => {
      showToast('Annotation saved', 'success');
      dismissActive();
    });
  }

  wrap.querySelector('#ta-ann-save').addEventListener('click', save);
  noteInput.focus();

  const onKey = (e) => {
    if (e.key === 'Enter' && document.activeElement !== kwInput) { e.preventDefault(); save(); }
  };
  document.addEventListener('keydown', onKey);
}

function extractPageKeywords() {
  const stop = new Set(['the','a','an','in','on','at','to','for','of','and','or','is','it','with','from','by','as','be','was','are','this','that','have','had','has','not','but','what','how','when','where','who','which','www','com','http','https']);
  const text = (document.title + ' ' + location.pathname).toLowerCase().replace(/[^\w\s]/g, ' ');
  return [...new Set(text.split(/\s+/).filter(w => w.length > 2 && !stop.has(w) && !/^\d+$/.test(w)))].slice(0, 10);
}

// ─── Banners (non-blocking) ───────────────────────────────────────────────────
function showBanner(msg) {
  const bannerId = `ta-banner-${msg.type}`;
  if (document.getElementById(bannerId)) return;

  const host = document.createElement('div');
  host.id = bannerId;
  host.setAttribute('data-ta-host', '');
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });
  const style  = document.createElement('style');
  style.textContent = TA_STYLES;
  shadow.appendChild(style);

  const wrap = document.createElement('div');

  if (msg.type === 'duplicate') {
    wrap.className = 'ta-banner ta-banner-duplicate';
    wrap.innerHTML = `
      <span>This tab is already open.</span>
      <button class="ta-banner-action" id="ta-switch">Switch to it</button>
      <button class="ta-banner-dismiss">×</button>
    `;
    wrap.querySelector('#ta-switch').addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'switchToTab', tabId: msg.dupeTabId });
      host.remove();
    });
  } else if (msg.type === 'bookmarked') {
    wrap.className = 'ta-banner ta-banner-bookmarked';
    wrap.innerHTML = `<span>You already have this bookmarked.</span><button class="ta-banner-dismiss">×</button>`;
  } else if (msg.type === 'captured') {
    const date = new Date(msg.capture.timestamp).toLocaleDateString();
    const note = msg.capture.note ? ` · "${esc(msg.capture.note)}"` : '';
    wrap.className = 'ta-banner ta-banner-captured';
    wrap.innerHTML = `<span>You saved this on ${date}${note}</span><button class="ta-banner-dismiss">×</button>`;
  }

  wrap.querySelector('.ta-banner-dismiss').addEventListener('click', () => host.remove());
  shadow.appendChild(wrap);
  setTimeout(() => host?.remove(), 8000);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function el(tag, cls) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}
function esc(str = '') {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
