// Tab Anxiety — New Tab Page

let captures = [], uncategorized = [], scratchpad = [], metrics = [];
let searchActive = false;
let selectedIdx  = -1;
let searchResults = [];

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadAll();
  updateTabCount();
  renderGrid();
  bindSearch();
});

async function loadAll() {
  const [data, met] = await Promise.all([
    msg('getData'),
    msg('getMetrics', { limit: 20 })
  ]);
  captures      = data.captures      || [];
  uncategorized = data.uncategorized  || [];
  scratchpad    = data.scratchpad     || [];
  metrics       = met || [];
}

function msg(action, extra = {}) {
  return new Promise(r => chrome.runtime.sendMessage({ action, ...extra }, r));
}

function updateTabCount() {
  chrome.tabs.query({}, tabs => {
    const el = document.getElementById('tab-count');
    if (el) el.textContent = `${tabs.length} tab${tabs.length === 1 ? '' : 's'} open`;
  });
}

// ─── Grid rendering ───────────────────────────────────────────────────────────
function renderGrid() {
  const grid = document.getElementById('grid');
  grid.innerHTML = '';

  grid.appendChild(sectionInbox());
  grid.appendChild(sectionNextActions());
  grid.appendChild(sectionFrequent());
  grid.appendChild(sectionScratchpad());
}

// Inbox
function sectionInbox() {
  const sec = section('Inbox', '');
  const body = sec.querySelector('.section-body');
  const count = uncategorized.length;

  if (count === 0) {
    body.innerHTML = '<div class="s-empty">Inbox zero ✓</div>';
  } else {
    const pill = document.createElement('div');
    pill.className = 'inbox-pill';
    pill.innerHTML = `
      <div class="inbox-num">${count}</div>
      <div class="inbox-label">uncategorized tab${count === 1 ? '' : 's'} waiting</div>
    `;
    body.appendChild(pill);

    uncategorized.slice(0, 5).forEach(item => {
      body.appendChild(sItem(item.url, item.title || item.url, 'dot-inbox', fmtDate(item.timestamp)));
    });
    if (count > 5) {
      const more = document.createElement('div');
      more.className = 's-empty';
      more.style.borderTop = '1px solid var(--border)';
      more.textContent = `+${count - 5} more — open extension to review`;
      body.appendChild(more);
    }
  }
  return sec;
}

// Next Actions
function sectionNextActions() {
  const next = captures.filter(c => c.type === 'next');
  const sec  = section('Next Actions', `${next.length}`);
  const body = sec.querySelector('.section-body');

  if (!next.length) {
    body.innerHTML = '<div class="s-empty">No next actions — press ⌥W → N on a tab</div>';
    return sec;
  }

  next.slice(0, 8).forEach(item => {
    body.appendChild(sItem(item.url, item.title || item.url, 'dot-next', item.note || ''));
  });
  return sec;
}

// Frequent sites (from metrics)
function sectionFrequent() {
  const sec  = section('Frequent Sites', '');
  const body = sec.querySelector('.section-body');

  if (!metrics.length) {
    body.innerHTML = '<div class="s-empty">Browse more to see your frequent sites</div>';
    return sec;
  }

  metrics.slice(0, 10).forEach(m => {
    const host = (() => { try { return new URL(m.url).hostname; } catch { return m.url; } })();
    const visits = `${m.visits}×`;
    body.appendChild(sItem(m.url, m.title || host, 'dot-freq', visits));
  });
  return sec;
}

// Scratchpad
function sectionScratchpad() {
  const sec  = section('Recent Ideas', `${scratchpad.length}`);
  const body = sec.querySelector('.section-body');

  if (!scratchpad.length) {
    body.innerHTML = '<div class="s-empty">No ideas yet — press ⌥Q anywhere</div>';
    return sec;
  }

  scratchpad.slice(0, 6).forEach(item => {
    const div = document.createElement('div');
    div.className = 's-item';
    div.innerHTML = `<div class="s-dot dot-scratch"></div><div class="s-label">${esc(item.text)}</div><div class="s-meta">${fmtDate(item.timestamp)}</div>`;
    body.appendChild(div);
  });
  return sec;
}

// ─── Section builder ──────────────────────────────────────────────────────────
function section(title, count) {
  const div = document.createElement('div');
  div.className = 'section';
  div.innerHTML = `
    <div class="section-header">
      <div class="section-title">${esc(title)}</div>
      <div class="section-count">${esc(String(count))}</div>
    </div>
    <div class="section-body"></div>
  `;
  return div;
}

function sItem(url, label, dotClass, meta) {
  const a = document.createElement('a');
  a.className = 's-item';
  a.href = url || '#';
  a.target = '_self';
  a.innerHTML = `<div class="s-dot ${dotClass}"></div><div class="s-label">${esc(label)}</div><div class="s-meta">${esc(meta)}</div>`;
  return a;
}

// ─── Search ───────────────────────────────────────────────────────────────────
function bindSearch() {
  const input  = document.getElementById('search');
  const results = document.getElementById('search-results');

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    if (!q) { results.hidden = true; selectedIdx = -1; searchResults = []; return; }
    renderSearchResults(q);
  });

  input.addEventListener('keydown', (e) => {
    if (!searchResults.length) {
      if (e.key === 'Enter') navigate(`https://www.google.com/search?q=${encodeURIComponent(input.value)}`);
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); moveSelection(1); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); moveSelection(-1); }
    if (e.key === 'Enter') {
      e.preventDefault();
      const sel = searchResults[selectedIdx] || searchResults[0];
      if (sel) navigate(sel.url || `https://www.google.com/search?q=${encodeURIComponent(input.value)}`);
    }
    if (e.key === 'Escape') { results.hidden = true; input.value = ''; selectedIdx = -1; searchResults = []; }
  });

  document.addEventListener('click', (e) => {
    if (!results.contains(e.target) && e.target !== input) results.hidden = true;
  });
}

function renderSearchResults(q) {
  const resultsEl = document.getElementById('search-results');
  const all = [
    ...captures.map(c => ({ ...c, src: c.type })),
    ...uncategorized.map(c => ({ ...c, src: 'inbox' }))
  ];

  const matched = all
    .filter(c => [c.title, c.url, c.note, ...(c.keywords || [])].join(' ').toLowerCase().includes(q))
    .slice(0, 5)
    .map(c => ({ url: c.url, label: c.title || c.url, meta: c.src, web: false }));

  const freqMatched = metrics
    .filter(m => [m.title, m.url, ...(m.keywords || [])].join(' ').toLowerCase().includes(q) && !matched.some(x => x.url === m.url))
    .slice(0, 3)
    .map(m => ({ url: m.url, label: m.title || m.url, meta: `${m.visits}×`, web: false }));

  searchResults = [
    ...matched, ...freqMatched,
    { url: `https://www.google.com/search?q=${encodeURIComponent(q)}`, label: `Search Google for "${q}"`, meta: 'web', web: true }
  ];
  selectedIdx = 0;

  resultsEl.innerHTML = '';
  searchResults.forEach((r, i) => {
    const a = document.createElement('a');
    a.className = `sr-item${i === selectedIdx ? ' sr-active' : ''}`;
    a.href = r.url;
    a.dataset.idx = i;
    a.innerHTML = `
      <div class="sr-dot${r.web ? ' web' : ''}"></div>
      <div class="sr-title">${hl(esc(r.label), q)}</div>
      <div class="sr-meta">${esc(r.meta)}</div>
    `;
    a.addEventListener('mouseenter', () => {
      selectedIdx = i;
      refreshActiveResult();
    });
    a.addEventListener('click', e => { e.preventDefault(); navigate(r.url); });
    resultsEl.appendChild(a);
  });
  resultsEl.hidden = false;
}

function moveSelection(dir) {
  selectedIdx = Math.max(0, Math.min(searchResults.length - 1, selectedIdx + dir));
  refreshActiveResult();
}

function refreshActiveResult() {
  document.querySelectorAll('.sr-item').forEach((el, i) =>
    el.classList.toggle('sr-active', i === selectedIdx)
  );
}

function navigate(url) {
  window.location.href = url;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function esc(s = '') {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function hl(str, q) {
  if (!q) return str;
  const rx = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return str.replace(new RegExp(`(${rx})`, 'gi'), '<mark>$1</mark>');
}
function fmtDate(ts) {
  if (!ts) return '';
  const diff = Math.floor((Date.now() - ts) / 86400000);
  if (diff === 0) return 'today';
  if (diff === 1) return 'yesterday';
  if (diff < 7)  return `${diff}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
