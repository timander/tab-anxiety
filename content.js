// Tab Anxiety — Content Script

// ─── Styles (injected into Shadow DOM for isolation) ─────────────────────────
const TA_STYLES = `
  * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }

  .ta-overlay {
    position: fixed;
    top: 20px;
    right: 20px;
    width: 360px;
    background: #141414;
    border: 1px solid #2a2a2a;
    border-radius: 10px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.6);
    z-index: 2147483647;
    color: #e0e0e0;
    font-size: 13px;
    animation: ta-slide-in 0.15s ease-out;
  }

  @keyframes ta-slide-in {
    from { opacity: 0; transform: translateY(-8px); }
    to   { opacity: 1; transform: translateY(0); }
  }

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
    background: none;
    border: none;
    color: #555;
    font-size: 18px;
    line-height: 1;
    cursor: pointer;
    padding: 0 2px;
    transition: color 0.1s;
  }
  .ta-close:hover { color: #e0e0e0; }

  .ta-tab-info {
    padding: 12px 14px;
    border-bottom: 1px solid #1e1e1e;
  }
  .ta-tab-title {
    font-size: 13px;
    font-weight: 500;
    color: #d0d0d0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-bottom: 4px;
  }
  .ta-tab-url {
    font-size: 11px;
    color: #444;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .ta-actions {
    padding: 10px 14px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .ta-actions button {
    background: none;
    border: 1px solid #222;
    border-radius: 6px;
    color: #bbb;
    font-size: 13px;
    padding: 8px 12px;
    text-align: left;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 10px;
    transition: background 0.1s, border-color 0.1s, color 0.1s;
  }
  .ta-actions button:hover,
  .ta-actions button.ta-active {
    background: #1e1e2e;
    border-color: #6366f1;
    color: #e0e0e0;
  }

  kbd {
    display: inline-block;
    background: #222;
    border: 1px solid #333;
    border-radius: 4px;
    padding: 1px 6px;
    font-size: 11px;
    font-family: monospace;
    color: #888;
    min-width: 20px;
    text-align: center;
  }
  .ta-actions button:hover kbd,
  .ta-actions button.ta-active kbd {
    background: #2e2e4e;
    border-color: #6366f1;
    color: #a5b4fc;
  }

  .ta-note-row {
    padding: 0 14px 12px;
  }
  .ta-note-input {
    width: 100%;
    background: #1a1a1a;
    border: 1px solid #333;
    border-radius: 6px;
    color: #e0e0e0;
    font-size: 13px;
    padding: 8px 10px;
    outline: none;
    transition: border-color 0.15s;
  }
  .ta-note-input:focus { border-color: #6366f1; }
  .ta-note-input::placeholder { color: #444; }

  /* Group Picker */
  .ta-fixed-groups {
    padding: 10px 14px;
    display: flex;
    gap: 6px;
  }
  .ta-group-btn {
    flex: 1;
    background: #1a1a1a;
    border: 1px solid #2a2a2a;
    border-radius: 6px;
    color: #bbb;
    font-size: 12px;
    padding: 8px 6px;
    cursor: pointer;
    text-align: center;
    transition: background 0.1s, border-color 0.1s, color 0.1s;
  }
  .ta-group-btn:hover { background: #1e1e2e; border-color: #6366f1; color: #e0e0e0; }

  .ta-divider {
    font-size: 11px;
    color: #444;
    text-align: center;
    padding: 4px 14px;
    position: relative;
  }
  .ta-divider::before, .ta-divider::after {
    content: '';
    position: absolute;
    top: 50%;
    width: 30%;
    height: 1px;
    background: #222;
  }
  .ta-divider::before { left: 14px; }
  .ta-divider::after  { right: 14px; }

  .ta-input-row {
    padding: 8px 14px 14px;
    display: flex;
    gap: 6px;
  }
  .ta-group-input, .ta-scratch-input {
    flex: 1;
    background: #1a1a1a;
    border: 1px solid #333;
    border-radius: 6px;
    color: #e0e0e0;
    font-size: 13px;
    padding: 8px 10px;
    outline: none;
    transition: border-color 0.15s;
  }
  .ta-group-input:focus, .ta-scratch-input:focus { border-color: #6366f1; }
  .ta-group-input::placeholder, .ta-scratch-input::placeholder { color: #444; }

  .ta-confirm-btn {
    background: #6366f1;
    border: none;
    border-radius: 6px;
    color: #fff;
    font-size: 13px;
    padding: 8px 14px;
    cursor: pointer;
    transition: background 0.1s;
  }
  .ta-confirm-btn:hover { background: #818cf8; }

  /* Scratchpad */
  .ta-scratchpad .ta-scratch-input {
    display: block;
    width: calc(100% - 28px);
    margin: 0 14px;
    resize: vertical;
    font-family: inherit;
    line-height: 1.5;
  }
  .ta-hint {
    font-size: 11px;
    color: #444;
    padding: 6px 14px 12px;
    text-align: right;
  }

  /* Banners */
  .ta-banner {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 2147483647;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 16px;
    font-size: 13px;
    animation: ta-banner-in 0.2s ease-out;
  }
  @keyframes ta-banner-in {
    from { opacity: 0; transform: translateY(-100%); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .ta-banner span { flex: 1; }
  .ta-banner-duplicate  { background: #1a1a2e; border-bottom: 1px solid #3730a3; color: #a5b4fc; }
  .ta-banner-bookmarked { background: #1a2a1a; border-bottom: 1px solid #166534; color: #86efac; }
  .ta-banner-captured   { background: #2a1a1a; border-bottom: 1px solid #9a3412; color: #fdba74; }

  .ta-banner-action {
    background: rgba(255,255,255,0.1);
    border: 1px solid rgba(255,255,255,0.15);
    border-radius: 4px;
    color: inherit;
    font-size: 12px;
    padding: 4px 10px;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.1s;
  }
  .ta-banner-action:hover { background: rgba(255,255,255,0.2); }

  .ta-banner-dismiss {
    background: none;
    border: none;
    color: inherit;
    opacity: 0.5;
    font-size: 16px;
    cursor: pointer;
    padding: 0 2px;
    line-height: 1;
    transition: opacity 0.1s;
  }
  .ta-banner-dismiss:hover { opacity: 1; }
`;

// ─── State ────────────────────────────────────────────────────────────────────
let activeOverlay = null;

// ─── Message Listener ─────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'showTriage')      showTriage();
  if (msg.action === 'showGroupPicker') showGroupPicker();
  if (msg.action === 'showScratchpad')  showScratchpad();
  if (msg.action === 'showBanner')      showBanner(msg);
});

// ─── Shadow Container ─────────────────────────────────────────────────────────
function createShadowContainer(id) {
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
  if (activeOverlay) {
    activeOverlay.remove();
    activeOverlay = null;
  }
}

// Close on Escape globally
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && activeOverlay) dismissActive();
});

// ─── Triage Overlay ───────────────────────────────────────────────────────────
function showTriage() {
  const shadow = createShadowContainer('ta-triage-host');
  const title = document.title;
  const url = location.href;

  const wrap = document.createElement('div');
  wrap.className = 'ta-overlay ta-triage';
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
      <button data-action="park">     <kbd>P</kbd> Park — move to a tab group</button>
    </div>
    <div class="ta-note-row" id="ta-note-row" hidden>
      <input class="ta-note-input" id="ta-note-input" placeholder="Quick note… (optional, Enter to save)" maxlength="140" />
    </div>
  `;
  shadow.appendChild(wrap);

  let pendingType = null;
  const noteRow   = wrap.querySelector('#ta-note-row');
  const noteInput = wrap.querySelector('#ta-note-input');

  wrap.querySelector('.ta-close').addEventListener('click', dismissActive);

  wrap.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => handleAction(btn.dataset.action));
  });

  function handleAction(action) {
    if (action === 'dismiss') {
      chrome.runtime.sendMessage({ action: 'closeTab' });
      dismissActive();
      return;
    }
    if (action === 'park') {
      dismissActive();
      showGroupPicker();
      return;
    }
    pendingType = action;
    noteRow.hidden = false;
    noteInput.focus();
    wrap.querySelectorAll('[data-action]').forEach(b =>
      b.classList.toggle('ta-active', b.dataset.action === action)
    );
  }

  function commit() {
    const typeMap = { reference: 'reference', next: 'next', someday: 'someday' };
    chrome.runtime.sendMessage({
      action: 'saveCapture',
      data: { type: typeMap[pendingType], url, title, note: noteInput.value.trim() }
    }, () => {
      chrome.runtime.sendMessage({ action: 'closeTab' });
      dismissActive();
    });
  }

  const onKey = (e) => {
    if (noteRow.hidden) {
      const map = { d: 'dismiss', r: 'reference', n: 'next', s: 'someday', p: 'park' };
      if (map[e.key.toLowerCase()]) { e.preventDefault(); handleAction(map[e.key.toLowerCase()]); }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (pendingType) commit();
    }
  };
  document.addEventListener('keydown', onKey);
  wrap.addEventListener('remove', () => document.removeEventListener('keydown', onKey));
}

// ─── Group Picker ─────────────────────────────────────────────────────────────
const FIXED_GROUPS = [
  { name: 'Reading',   color: 'blue'   },
  { name: 'Reference', color: 'grey'   },
  { name: 'Someday',   color: 'purple' }
];

function showGroupPicker() {
  const shadow = createShadowContainer('ta-group-host');

  const wrap = document.createElement('div');
  wrap.className = 'ta-overlay ta-group-picker';
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
  const onKey = (e) => {
    if (e.key === 'Enter') assign(input.value.trim(), null);
  };
  document.addEventListener('keydown', onKey);
}

// ─── Scratchpad ───────────────────────────────────────────────────────────────
function showScratchpad() {
  const shadow = createShadowContainer('ta-scratchpad-host');

  const wrap = document.createElement('div');
  wrap.className = 'ta-overlay ta-scratchpad';
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

// ─── Banners (non-blocking) ───────────────────────────────────────────────────
function showBanner(msg) {
  const bannerId = `ta-banner-${msg.type}`;
  if (document.getElementById(bannerId)) return;

  const host = document.createElement('div');
  host.id = bannerId;
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
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
    wrap.innerHTML = `
      <span>You already have this bookmarked.</span>
      <button class="ta-banner-dismiss">×</button>
    `;
  } else if (msg.type === 'captured') {
    const date = new Date(msg.capture.timestamp).toLocaleDateString();
    const note = msg.capture.note ? ` · "${esc(msg.capture.note)}"` : '';
    wrap.className = 'ta-banner ta-banner-captured';
    wrap.innerHTML = `
      <span>You captured this on ${date}${note}</span>
      <button class="ta-banner-dismiss">×</button>
    `;
  }

  wrap.querySelector('.ta-banner-dismiss').addEventListener('click', () => host.remove());
  shadow.appendChild(wrap);
  setTimeout(() => host.remove(), 8000);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function esc(str = '') {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
