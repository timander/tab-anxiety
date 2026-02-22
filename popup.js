// Tab Anxiety — Popup v2

let allData    = { captures: [], uncategorized: [], scratchpad: [] };
let settings   = {};
let activeTab  = 'uncategorized';
let searchTerm = '';

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  [allData, settings] = await Promise.all([loadData(), loadSettings()]);
  applySettings();
  bindNav();
  bindSearch();
  bindExport();
  bindEnabledToggle();
  bindCloseBookmarked();
  render();
});

async function loadData() {
  return new Promise(r => chrome.runtime.sendMessage({ action: 'getData' }, d => r({
    captures:      d?.captures      || [],
    uncategorized: d?.uncategorized  || [],
    scratchpad:    d?.scratchpad     || []
  })));
}

async function loadSettings() {
  return new Promise(r => chrome.runtime.sendMessage({ action: 'getSettings' }, r));
}

function applySettings() {
  document.getElementById('enabled-toggle').checked = settings.enabled !== false;
}

// ─── Nav ──────────────────────────────────────────────────────────────────────
function bindNav() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b === btn));
      render();
    });
  });
}

// ─── Search ───────────────────────────────────────────────────────────────────
function bindSearch() {
  document.getElementById('search').addEventListener('input', e => {
    searchTerm = e.target.value.trim().toLowerCase();
    render();
  });
}

// ─── Export ───────────────────────────────────────────────────────────────────
function bindExport() {
  document.getElementById('export-btn').addEventListener('click', () =>
    chrome.runtime.sendMessage({ action: 'exportData' })
  );
}

// ─── Enable / disable toggle ──────────────────────────────────────────────────
function bindEnabledToggle() {
  document.getElementById('enabled-toggle').addEventListener('change', async (e) => {
    settings.enabled = e.target.checked;
    chrome.runtime.sendMessage({ action: 'saveSettings', settings: { enabled: settings.enabled } });
  });
}

// ─── Close all bookmarked ─────────────────────────────────────────────────────
function bindCloseBookmarked() {
  document.getElementById('close-bookmarked-btn').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'closeAllBookmarked' }, res => {
      if (res?.closed > 0) {
        showStatus(`Closed ${res.closed} bookmarked tab${res.closed === 1 ? '' : 's'}`);
      } else {
        showStatus('No bookmarked tabs were open');
      }
    });
  });
}

// ─── Render dispatcher ────────────────────────────────────────────────────────
function render() {
  updateBadges();
  updateTabActions();
  const main = document.getElementById('main');

  if (activeTab === 'scratchpad') { main.innerHTML = ''; main.appendChild(renderScratchpad()); return; }
  if (activeTab === 'settings')   { main.innerHTML = ''; main.appendChild(renderSettings()); return; }
  if (activeTab === 'reference')  { renderBookmarks(main); return; }

  const items = getFilteredItems();
  if (!items.length) { main.innerHTML = renderEmpty(); return; }
  main.innerHTML = '';
  items.forEach(item => main.appendChild(renderItem(item)));
}

function updateTabActions() {
  const row     = document.getElementById('tab-actions');
  const mainBtn = document.getElementById('action-main');
  const closeBtn = document.getElementById('close-bookmarked-btn');

  if (activeTab === 'uncategorized') {
    row.hidden = false;
    closeBtn.hidden = false;
    mainBtn.textContent = 'Auto-group open tabs';
    mainBtn.onclick = () => chrome.runtime.sendMessage({ action: 'autoGroupTabs' }, res =>
      showStatus(`Created ${res.groups} tab group${res.groups === 1 ? '' : 's'}`)
    );
  } else if (activeTab === 'next') {
    row.hidden = false;
    closeBtn.hidden = true;
    mainBtn.textContent = '↗ Open all as tab group';
    mainBtn.onclick = () => chrome.runtime.sendMessage({ action: 'openNextActionsGroup' }, res =>
      showStatus(res.ok ? `Opened ${res.count} tabs in group` : res.reason)
    );
  } else {
    row.hidden = true;
  }
}

// ─── Badge counts ─────────────────────────────────────────────────────────────
function updateBadges() {
  const counts = {
    uncategorized: allData.uncategorized.length,
    next:          allData.captures.filter(c => c.type === 'next').length,
    someday:       allData.captures.filter(c => c.type === 'someday').length,
    reference:     allData.captures.filter(c => c.type === 'reference').length,
    scratchpad:    allData.scratchpad.length
  };
  Object.entries(counts).forEach(([k, v]) => {
    const el = document.getElementById(`badge-${k}`);
    if (el) el.textContent = v || '';
  });
}

// ─── Filtered items ───────────────────────────────────────────────────────────
function getFilteredItems() {
  const items = activeTab === 'uncategorized'
    ? allData.uncategorized
    : allData.captures.filter(c => c.type === activeTab);

  if (!searchTerm) return items;
  return items.filter(i =>
    [i.title, i.url, i.note, ...(i.keywords || [])].join(' ').toLowerCase().includes(searchTerm)
  );
}

// ─── Item rendering ───────────────────────────────────────────────────────────
function renderItem(item) {
  const div = document.createElement('div');
  div.className = 'item';

  const dot = document.createElement('div');
  dot.className = `item-dot dot-${item.type || 'uncategorized'}`;

  const body = document.createElement('div');
  body.className = 'item-body';

  const link = document.createElement('a');
  link.className = 'item-title';
  link.href = item.url || '#';
  link.target = '_blank';
  link.rel = 'noopener';
  link.title = item.url || '';
  link.innerHTML = hl(esc(item.title || item.url || 'Untitled'));
  body.appendChild(link);

  if (item.note) {
    const note = document.createElement('div');
    note.className = 'item-note';
    note.innerHTML = hl(esc(item.note));
    body.appendChild(note);
  }

  const meta = document.createElement('div');
  meta.className = 'item-meta';
  const date = document.createElement('span');
  date.className = 'item-date';
  date.textContent = fmtDate(item.timestamp);
  meta.appendChild(date);

  if (item.keywords?.length) {
    const kws = document.createElement('div');
    kws.className = 'item-keywords';
    item.keywords.slice(0, 4).forEach(kw => {
      const s = document.createElement('span');
      s.className = 'kw';
      s.innerHTML = hl(esc(kw));
      kws.appendChild(s);
    });
    meta.appendChild(kws);
  }
  body.appendChild(meta);

  const del = document.createElement('button');
  del.className = 'item-delete';
  del.textContent = '×';
  del.title = 'Remove from list';
  del.addEventListener('click', e => {
    e.preventDefault();
    const list = activeTab === 'uncategorized' ? 'uncategorized' : 'captures';
    chrome.runtime.sendMessage({ action: 'deleteItem', list, id: item.id }, () => {
      if (list === 'uncategorized') allData.uncategorized = allData.uncategorized.filter(i => i.id !== item.id);
      else allData.captures = allData.captures.filter(i => i.id !== item.id);
      div.remove();
      updateBadges();
    });
  });

  div.appendChild(dot);
  div.appendChild(body);
  div.appendChild(del);
  return div;
}

// ─── Bookmarks tab ────────────────────────────────────────────────────────────
function renderBookmarks(main) {
  main.innerHTML = '<div class="empty-state"><strong>Loading bookmarks…</strong></div>';
  chrome.runtime.sendMessage({ action: 'getBookmarks' }, bookmarks => {
    if (!bookmarks?.length) { main.innerHTML = '<div class="empty-state"><strong>No bookmarks yet</strong>Save a tab as Reference (⌥W → R) to create one.</div>'; return; }
    const filtered = searchTerm
      ? bookmarks.filter(b => [b.title, b.url, b.note].join(' ').toLowerCase().includes(searchTerm))
      : bookmarks;

    main.innerHTML = '';
    filtered.forEach(bm => {
      const div = document.createElement('div');
      div.className = 'item';
      div.innerHTML = `
        <div class="item-dot dot-bookmark"></div>
        <div class="item-body">
          <a class="item-title" href="${esc(bm.url)}" target="_blank" rel="noopener" title="${esc(bm.url)}">${hl(esc(bm.title || bm.url))}</a>
          ${bm.note ? `<div class="item-note">${hl(esc(bm.note))}</div>` : ''}
          <div class="item-meta">
            <span class="item-date">${fmtDate(bm.timestamp)}</span>
            ${bm.score > 0 ? `<span class="item-score">${Math.round(bm.score)} visits</span>` : ''}
          </div>
        </div>
      `;
      main.appendChild(div);
    });
  });
}

// ─── Scratchpad tab ───────────────────────────────────────────────────────────
function renderScratchpad() {
  const frag = document.createDocumentFragment();
  const compose = document.createElement('div');
  compose.className = 'scratch-compose';
  compose.innerHTML = `<textarea placeholder="Capture an idea…" rows="2"></textarea><button>Save</button>`;

  const ta  = compose.querySelector('textarea');
  const btn = compose.querySelector('button');
  const save = () => {
    const text = ta.value.trim();
    if (!text) return;
    chrome.runtime.sendMessage({ action: 'saveScratchpad', text }, () => {
      allData.scratchpad.unshift({ id: crypto.randomUUID(), text, timestamp: Date.now() });
      ta.value = '';
      render();
    });
  };
  btn.addEventListener('click', save);
  ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); } });
  frag.appendChild(compose);

  const items = searchTerm
    ? allData.scratchpad.filter(s => s.text.toLowerCase().includes(searchTerm))
    : allData.scratchpad;

  if (!items.length) {
    const e = document.createElement('div');
    e.className = 'empty-state';
    e.innerHTML = '<strong>No ideas yet</strong>Press ⌥Q anywhere to capture without opening a tab.';
    frag.appendChild(e);
    return frag;
  }

  items.forEach(item => {
    const div = document.createElement('div');
    div.className = 'scratch-item';
    const dot = document.createElement('div');
    dot.className = 'item-dot dot-scratchpad';
    const body = document.createElement('div');
    body.className = 'item-body';
    const text = document.createElement('div');
    text.className = 'scratch-text';
    text.innerHTML = hl(esc(item.text));
    body.appendChild(text);
    const date = document.createElement('div');
    date.className = 'scratch-date';
    date.textContent = fmtDate(item.timestamp);
    body.appendChild(date);
    const del = document.createElement('button');
    del.className = 'item-delete';
    del.style.opacity = '1';
    del.textContent = '×';
    del.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'deleteItem', list: 'scratchpad', id: item.id }, () => {
        allData.scratchpad = allData.scratchpad.filter(i => i.id !== item.id);
        div.remove();
        updateBadges();
      });
    });
    div.appendChild(dot); div.appendChild(body); div.appendChild(del);
    frag.appendChild(div);
  });
  return frag;
}

// ─── Settings tab ─────────────────────────────────────────────────────────────
function renderSettings() {
  const frag = document.createElement('div');
  frag.className = 'settings-body';

  frag.innerHTML = `
    <div class="setting-group">
      <div class="setting-label">Behavior</div>
      <div class="setting-row">
        <span class="setting-desc">Auto-deduplicate tabs<br><span class="setting-sub">Redirect to existing tab if URL already open</span></span>
        <label class="toggle"><input type="checkbox" id="s-dedup" ${settings.autoDedupe !== false ? 'checked' : ''} /><span class="toggle-track"></span></label>
      </div>
      <div class="setting-row">
        <span class="setting-desc">New tab page override<br><span class="setting-sub">Replace Ctrl+T with Tab Anxiety landing page</span></span>
        <label class="toggle"><input type="checkbox" id="s-newtab" ${settings.newTabOverride !== false ? 'checked' : ''} /><span class="toggle-track"></span></label>
      </div>
    </div>

    <div class="setting-divider"></div>

    <div class="setting-group">
      <div class="setting-label">Intercept sensitivity</div>
      <div class="setting-sub" style="margin-bottom:6px;">How much activity before a tab is auto-captured when closed (0 = always, 100 = rarely)</div>
      <div class="range-row">
        <input type="range" id="s-threshold" min="0" max="100" value="${settings.interceptThreshold ?? 30}" />
        <span class="range-val" id="s-threshold-val">${settings.interceptThreshold ?? 30}</span>
      </div>
    </div>

    <div class="setting-divider"></div>

    <div class="setting-group">
      <div class="setting-label">Excluded domains</div>
      <div class="setting-sub" style="margin-bottom:6px;">Tabs from these domains are never intercepted or captured</div>
      <div class="domain-chip-row" id="s-domain-chips"></div>
      <div class="domain-add">
        <input type="text" id="s-domain-input" placeholder="e.g. gmail.com" />
        <button id="s-domain-add">Add</button>
      </div>
    </div>

    <div class="setting-divider"></div>

    <div class="setting-group">
      <div class="setting-label">Clear data</div>
      <div class="clear-section">
        <label class="clear-row"><input type="checkbox" class="clear-check" value="uncategorized" checked /> Inbox (auto-captured)</label>
        <label class="clear-row"><input type="checkbox" class="clear-check" value="captures" checked /> Triaged captures</label>
        <label class="clear-row"><input type="checkbox" class="clear-check" value="scratchpad" /> Scratchpad ideas</label>
        <label class="clear-row"><input type="checkbox" class="clear-check" value="metrics" /> Visit metrics</label>
        <button class="btn-danger" id="s-clear-btn">Clear selected data</button>
      </div>
    </div>
  `;

  // Domain chips
  function refreshDomainChips() {
    const row = frag.querySelector('#s-domain-chips');
    row.innerHTML = '';
    (settings.excludedDomains || []).forEach(d => {
      const chip = document.createElement('div');
      chip.className = 'domain-chip';
      chip.innerHTML = `${esc(d)}<button data-domain="${esc(d)}">×</button>`;
      chip.querySelector('button').addEventListener('click', () => {
        settings.excludedDomains = settings.excludedDomains.filter(x => x !== d);
        chrome.runtime.sendMessage({ action: 'saveSettings', settings: { excludedDomains: settings.excludedDomains } });
        refreshDomainChips();
      });
      row.appendChild(chip);
    });
  }
  refreshDomainChips();

  frag.querySelector('#s-domain-add').addEventListener('click', () => {
    const input = frag.querySelector('#s-domain-input');
    const val = input.value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*/, '');
    if (!val || settings.excludedDomains?.includes(val)) return;
    settings.excludedDomains = [...(settings.excludedDomains || []), val];
    chrome.runtime.sendMessage({ action: 'saveSettings', settings: { excludedDomains: settings.excludedDomains } });
    input.value = '';
    refreshDomainChips();
  });
  frag.querySelector('#s-domain-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') frag.querySelector('#s-domain-add').click();
  });

  // Toggle listeners
  const saveSetting = (key, val) => {
    settings[key] = val;
    chrome.runtime.sendMessage({ action: 'saveSettings', settings: { [key]: val } });
  };
  frag.querySelector('#s-dedup').addEventListener('change', e => saveSetting('autoDedupe', e.target.checked));
  frag.querySelector('#s-newtab').addEventListener('change', e => saveSetting('newTabOverride', e.target.checked));

  const threshold = frag.querySelector('#s-threshold');
  const threshVal = frag.querySelector('#s-threshold-val');
  threshold.addEventListener('input', () => { threshVal.textContent = threshold.value; });
  threshold.addEventListener('change', () => saveSetting('interceptThreshold', Number(threshold.value)));

  // Clear data
  frag.querySelector('#s-clear-btn').addEventListener('click', () => {
    const what = [...frag.querySelectorAll('.clear-check:checked')].map(c => c.value);
    if (!what.length) return;
    if (!confirm(`Clear: ${what.join(', ')}? This cannot be undone.`)) return;
    chrome.runtime.sendMessage({ action: 'clearHistory', what }, () => {
      what.forEach(k => { if (allData[k]) allData[k] = []; });
      showStatus('Data cleared');
      render();
    });
  });

  return frag;
}

// ─── Empty states ─────────────────────────────────────────────────────────────
const EMPTY = {
  uncategorized: ['Inbox zero',      'Tabs closed with ⌘W land here automatically.'],
  next:          ['No next actions', 'Press ⌥W on a tab and choose N.'],
  someday:       ['Nothing parked',  'Press ⌥W and choose S.'],
  reference:     ['No captures yet', 'Press ⌥W and choose R to save a tab.']
};
function renderEmpty() {
  const [title, hint] = EMPTY[activeTab] || ['Nothing here', ''];
  return `<div class="empty-state"><strong>${title}</strong>${hint}</div>`;
}

// ─── Status flash ─────────────────────────────────────────────────────────────
function showStatus(msg) {
  const footer = document.getElementById('footer-hint');
  const prev = footer.innerHTML;
  footer.textContent = msg;
  setTimeout(() => { footer.innerHTML = prev; }, 3000);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function hl(str) {
  if (!searchTerm) return str;
  const rx = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return str.replace(new RegExp(`(${rx})`, 'gi'), '<mark>$1</mark>');
}
function esc(s = '') {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function fmtDate(ts) {
  if (!ts) return '';
  const d = new Date(ts), diff = Math.floor((Date.now() - d) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7)  return `${diff}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
