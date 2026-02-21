// Tab Anxiety — Popup

// ─── State ────────────────────────────────────────────────────────────────────
let allData    = { captures: [], uncategorized: [], scratchpad: [] };
let activeTab  = 'uncategorized';
let searchTerm = '';

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  bindNav();
  bindSearch();
  bindExport();
  render();
});

async function loadData() {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ action: 'getData' }, data => {
      allData = {
        captures:      data.captures      || [],
        uncategorized: data.uncategorized  || [],
        scratchpad:    data.scratchpad     || []
      };
      resolve();
    });
  });
}

// ─── Navigation ───────────────────────────────────────────────────────────────
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
  const input = document.getElementById('search');
  input.addEventListener('input', () => {
    searchTerm = input.value.trim().toLowerCase();
    render();
  });
}

// ─── Export ───────────────────────────────────────────────────────────────────
function bindExport() {
  document.getElementById('export-btn').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'exportData' });
  });
}

// ─── Render ───────────────────────────────────────────────────────────────────
function render() {
  updateBadges();
  const main = document.getElementById('main');

  if (activeTab === 'scratchpad') {
    main.innerHTML = '';
    main.appendChild(renderScratchpad());
    return;
  }

  const items = getFilteredItems();
  if (!items.length) {
    main.innerHTML = renderEmpty();
    return;
  }

  main.innerHTML = '';
  items.forEach(item => main.appendChild(renderItem(item)));
}

function getFilteredItems() {
  let items = [];

  if (activeTab === 'uncategorized') {
    items = allData.uncategorized;
  } else {
    items = allData.captures.filter(c => c.type === activeTab);
  }

  if (!searchTerm) return items;

  return items.filter(item => {
    const haystack = [
      item.title, item.url, item.note,
      ...(item.keywords || [])
    ].join(' ').toLowerCase();
    return haystack.includes(searchTerm);
  });
}

function updateBadges() {
  const counts = {
    uncategorized: allData.uncategorized.length,
    next:          allData.captures.filter(c => c.type === 'next').length,
    someday:       allData.captures.filter(c => c.type === 'someday').length,
    reference:     allData.captures.filter(c => c.type === 'reference').length,
    scratchpad:    allData.scratchpad.length
  };
  Object.entries(counts).forEach(([key, count]) => {
    const el = document.getElementById(`badge-${key}`);
    if (el) el.textContent = count || '';
  });
}

// ─── Item Rendering ───────────────────────────────────────────────────────────
function renderItem(item) {
  const div = document.createElement('div');
  div.className = 'item';

  const dot = document.createElement('div');
  dot.className = `item-dot dot-${item.type || 'uncategorized'}`;

  const body = document.createElement('div');
  body.className = 'item-body';

  // Title / link
  const titleEl = document.createElement('a');
  titleEl.className = 'item-title';
  titleEl.href = item.url || '#';
  titleEl.title = item.url || '';
  titleEl.target = '_blank';
  titleEl.rel = 'noopener';
  titleEl.innerHTML = highlight(esc(item.title || item.url || 'Untitled'));
  body.appendChild(titleEl);

  // Note
  if (item.note) {
    const noteEl = document.createElement('div');
    noteEl.className = 'item-note';
    noteEl.innerHTML = highlight(esc(item.note));
    body.appendChild(noteEl);
  }

  // Meta row
  const meta = document.createElement('div');
  meta.className = 'item-meta';

  const date = document.createElement('span');
  date.className = 'item-date';
  date.textContent = formatDate(item.timestamp);
  meta.appendChild(date);

  if (item.keywords?.length) {
    const kwWrap = document.createElement('div');
    kwWrap.className = 'item-keywords';
    item.keywords.slice(0, 4).forEach(kw => {
      const span = document.createElement('span');
      span.className = 'kw';
      span.innerHTML = highlight(esc(kw));
      kwWrap.appendChild(span);
    });
    meta.appendChild(kwWrap);
  }
  body.appendChild(meta);

  // Delete button
  const del = document.createElement('button');
  del.className = 'item-delete';
  del.title = 'Remove';
  del.textContent = '×';
  del.addEventListener('click', (e) => {
    e.preventDefault();
    const listKey = activeTab === 'uncategorized' ? 'uncategorized' : 'captures';
    chrome.runtime.sendMessage({ action: 'deleteItem', list: listKey, id: item.id }, () => {
      if (listKey === 'uncategorized') {
        allData.uncategorized = allData.uncategorized.filter(i => i.id !== item.id);
      } else {
        allData.captures = allData.captures.filter(i => i.id !== item.id);
      }
      render();
    });
  });

  div.appendChild(dot);
  div.appendChild(body);
  div.appendChild(del);
  return div;
}

// ─── Scratchpad Rendering ─────────────────────────────────────────────────────
function renderScratchpad() {
  const frag = document.createDocumentFragment();

  // Compose row
  const compose = document.createElement('div');
  compose.className = 'scratch-compose';
  compose.innerHTML = `
    <textarea placeholder="Capture an idea without opening a tab…" rows="2"></textarea>
    <button>Save</button>
  `;
  const textarea = compose.querySelector('textarea');
  const saveBtn  = compose.querySelector('button');

  function saveScratch() {
    const text = textarea.value.trim();
    if (!text) return;
    chrome.runtime.sendMessage({ action: 'saveScratchpad', text }, () => {
      allData.scratchpad.unshift({ id: crypto.randomUUID(), text, timestamp: Date.now() });
      textarea.value = '';
      render();
    });
  }

  saveBtn.addEventListener('click', saveScratch);
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveScratch(); }
  });
  frag.appendChild(compose);

  // Items
  const items = searchTerm
    ? allData.scratchpad.filter(s => s.text.toLowerCase().includes(searchTerm))
    : allData.scratchpad;

  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = '<strong>No ideas yet</strong>Press ⌥Q anywhere to capture one without opening a tab.';
    frag.appendChild(empty);
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
    text.innerHTML = highlight(esc(item.text));
    body.appendChild(text);

    const date = document.createElement('div');
    date.className = 'scratch-date';
    date.textContent = formatDate(item.timestamp);
    body.appendChild(date);

    const del = document.createElement('button');
    del.className = 'item-delete';
    del.textContent = '×';
    del.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'deleteItem', list: 'scratchpad', id: item.id }, () => {
        allData.scratchpad = allData.scratchpad.filter(i => i.id !== item.id);
        render();
      });
    });

    div.appendChild(dot);
    div.appendChild(body);
    div.appendChild(del);
    frag.appendChild(div);
  });

  return frag;
}

// ─── Empty States ─────────────────────────────────────────────────────────────
const EMPTY_MESSAGES = {
  uncategorized: ['Inbox zero', 'Tabs closed with ⌘W land here automatically.'],
  next:          ['No next actions', 'Press ⌥W on a tab and choose N to add one.'],
  someday:       ['Nothing on the back burner', 'Press ⌥W and choose S to park an idea.'],
  reference:     ['No reference material', 'Press ⌥W and choose R to save a tab with a note.'],
};

function renderEmpty() {
  const [title, hint] = EMPTY_MESSAGES[activeTab] || ['Nothing here', ''];
  return `<div class="empty-state"><strong>${title}</strong>${hint}</div>`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function highlight(str) {
  if (!searchTerm) return str;
  const escaped = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return str.replace(new RegExp(`(${escaped})`, 'gi'), '<mark>$1</mark>');
}

function esc(str = '') {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const today = new Date();
  const diff  = Math.floor((today - d) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7)  return `${diff} days ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
