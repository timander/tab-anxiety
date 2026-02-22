// Tab Anxiety — Background Service Worker v2

// ─── In-memory state ──────────────────────────────────────────────────────────
const tabCache      = {};          // tabId → { url, title }
const bookmarkedUrls = new Set();  // normalized URLs that are bookmarked
const activeTabStart = {};         // tabId → timestamp when it became active

// ─── Settings defaults ────────────────────────────────────────────────────────
const DEFAULTS = {
  enabled:            true,
  autoDedupe:         true,
  interceptThreshold: 30,     // importance score to trigger auto-capture
  excludedDomains:    [],
  newTabOverride:     true
};

// ─── Startup ──────────────────────────────────────────────────────────────────
async function init() {
  await initTabCache();
  await initBookmarkCache();
  const settings = await getSettings();
  updateBadge(settings.enabled);
}
init();

async function initTabCache() {
  const tabs = await chrome.tabs.query({});
  tabs.forEach(tab => {
    if (tab.url && !isSystemUrl(tab.url)) {
      tabCache[tab.id] = { url: tab.url, title: tab.title || '' };
    }
  });
  const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (active?.id) activeTabStart[active.id] = Date.now();
}

async function initBookmarkCache() {
  const results = await chrome.bookmarks.search({});
  bookmarkedUrls.clear();
  results.forEach(b => { if (b.url) bookmarkedUrls.add(norm(b.url)); });
}

// ─── Settings ─────────────────────────────────────────────────────────────────
async function getSettings() {
  const data = await chrome.storage.local.get('settings');
  return { ...DEFAULTS, ...(data.settings || {}) };
}

async function saveSettings(partial) {
  const current = await getSettings();
  const updated = { ...current, ...partial };
  await chrome.storage.local.set({ settings: updated });
  updateBadge(updated.enabled);
  return updated;
}

function updateBadge(enabled) {
  chrome.action.setBadgeText({ text: enabled ? '' : 'OFF' });
  chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
}

// ─── Bookmark cache sync ──────────────────────────────────────────────────────
chrome.bookmarks.onCreated.addListener((id, bm) => {
  if (bm.url) bookmarkedUrls.add(norm(bm.url));
});
chrome.bookmarks.onRemoved.addListener((id, info) => {
  if (info.node?.url) bookmarkedUrls.delete(norm(info.node.url));
});
chrome.bookmarks.onChanged.addListener(() => initBookmarkCache());

// ─── Tab Events ───────────────────────────────────────────────────────────────
chrome.tabs.onCreated.addListener((tab) => {
  if (tab.url) tabCache[tab.id] = { url: tab.url, title: tab.title || '' };
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (tab.url) tabCache[tabId] = { url: tab.url, title: tab.title || '' };
  if (!changeInfo.url && changeInfo.status !== 'complete') return;
  if (!tab.url || isSystemUrl(tab.url)) return;

  const settings = await getSettings();

  // Auto-dedupe: on URL change, check if another tab already has this URL
  if (settings.enabled && settings.autoDedupe && changeInfo.url) {
    const allTabs = await chrome.tabs.query({});
    const others = allTabs.filter(t => t.id !== tabId && norm(t.url) === norm(tab.url));
    if (others.length > 0) {
      chrome.tabs.remove(tabId);
      chrome.tabs.update(others[0].id, { active: true });
      chrome.windows.update(others[0].windowId, { focused: true });
      setTimeout(() => sendToContent(others[0].id, {
        action: 'showToast', message: 'Duplicate redirected to existing tab', type: 'info'
      }), 150);
      return;
    }
  }

  if (changeInfo.status !== 'complete') return;
  if (!settings.enabled || isExcluded(tab.url, settings.excludedDomains)) return;

  // Record visit
  await recordVisit(tab);

  // Banners: bookmarked, previously captured (skip duplicate — handled above)
  await checkTabBanners(tab);
});

chrome.tabs.onActivated.addListener(({ tabId, previousTabId }) => {
  const now = Date.now();
  if (previousTabId !== undefined && activeTabStart[previousTabId]) {
    const elapsed = now - activeTabStart[previousTabId];
    if (elapsed > 1000 && elapsed < 3_600_000) recordTimeSpent(previousTabId, elapsed);
    delete activeTabStart[previousTabId];
  }
  activeTabStart[tabId] = now;
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const tab = tabCache[tabId];

  if (activeTabStart[tabId] && tab?.url) {
    const elapsed = Date.now() - activeTabStart[tabId];
    if (elapsed > 1000 && elapsed < 3_600_000) recordTimeSpent(tabId, elapsed).catch(() => {});
    delete activeTabStart[tabId];
  }

  if (!tab?.url || isSystemUrl(tab.url)) { delete tabCache[tabId]; return; }

  const settings = await getSettings();

  // Bookmarked → close silently
  if (bookmarkedUrls.has(norm(tab.url))) { delete tabCache[tabId]; return; }

  // Disabled or excluded → close silently
  if (!settings.enabled || isExcluded(tab.url, settings.excludedDomains)) { delete tabCache[tabId]; return; }

  // Already captured → close silently
  const stored = await chrome.storage.local.get(['captures', 'uncategorized']);
  const all = [...(stored.captures || []), ...(stored.uncategorized || [])];
  if (all.some(c => norm(c.url) === norm(tab.url))) { delete tabCache[tabId]; return; }

  // Auto-capture to inbox
  await autoCapture(tab);
  delete tabCache[tabId];
});

// ─── Banner checks (non-blocking overlays on tab load) ────────────────────────
async function checkTabBanners(tab) {
  // Already bookmarked
  if (bookmarkedUrls.has(norm(tab.url))) {
    sendToContent(tab.id, { action: 'showBanner', type: 'bookmarked' });
    return;
  }
  // Previously captured
  const stored = await chrome.storage.local.get(['captures', 'uncategorized']);
  const all = [...(stored.captures || []), ...(stored.uncategorized || [])];
  const prev = all.find(c => norm(c.url) === norm(tab.url));
  if (prev) {
    sendToContent(tab.id, { action: 'showBanner', type: 'captured', capture: prev });
  }
}

// ─── Metrics ──────────────────────────────────────────────────────────────────
async function recordVisit(tab) {
  if (!tab.url || isSystemUrl(tab.url)) return;
  const key = `m:${norm(tab.url)}`;
  const stored = await chrome.storage.local.get(key);
  const m = stored[key] || { url: tab.url, title: tab.title, visits: 0, timeMs: 0, firstSeen: Date.now(), lastSeen: 0, keywords: [] };
  m.visits += 1;
  m.title = tab.title || m.title;
  m.lastSeen = Date.now();
  m.keywords = extractKeywords(tab.title, tab.url);
  await chrome.storage.local.set({ [key]: m });
}

async function recordTimeSpent(tabId, ms) {
  const tab = tabCache[tabId];
  if (!tab?.url || isSystemUrl(tab.url)) return;
  const key = `m:${norm(tab.url)}`;
  const stored = await chrome.storage.local.get(key);
  const m = stored[key] || { url: tab.url, title: tab.title, visits: 0, timeMs: 0, firstSeen: Date.now(), lastSeen: 0, keywords: [] };
  m.timeMs = (m.timeMs || 0) + ms;
  await chrome.storage.local.set({ [key]: m });
}

async function getMetrics(limit = 20) {
  const all = await chrome.storage.local.get(null);
  return Object.values(all)
    .filter(v => v && typeof v === 'object' && v.url && v.visits !== undefined)
    .map(m => ({ ...m, score: score(m) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function score(m) {
  return (m.visits || 0) * 10 + ((m.timeMs || 0) / 1000) * 0.05;
}

// ─── Commands ─────────────────────────────────────────────────────────────────
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (!tab?.id) return;

  if (command === 'triage-tab')   sendToContent(tab.id, { action: 'showTriage' });
  if (command === 'assign-group') sendToContent(tab.id, { action: 'showGroupPicker' });
  if (command === 'scratchpad')   sendToContent(tab.id, { action: 'showScratchpad' });
  if (command === 'annotate-tab') sendToContent(tab.id, { action: 'showAnnotate' });
});

// ─── Omnibox ──────────────────────────────────────────────────────────────────
chrome.omnibox.onInputStarted.addListener(() => {
  chrome.omnibox.setDefaultSuggestion({ description: 'Search Tab Anxiety captures…' });
});

chrome.omnibox.onInputChanged.addListener(async (text, suggest) => {
  if (!text.trim()) return;
  const term = text.toLowerCase();
  const stored = await chrome.storage.local.get(['captures', 'uncategorized']);
  const all = [...(stored.captures || []), ...(stored.uncategorized || [])];
  const metrics = await getMetrics(50);

  const fromCaptures = all
    .filter(c => matchesTerm(c, term))
    .slice(0, 4)
    .map(c => ({
      content: c.url,
      description: `${escXml(c.title || c.url)}${c.note ? ' — ' + escXml(c.note) : ''} [${c.type || 'inbox'}]`
    }));

  const fromMetrics = metrics
    .filter(m => matchesTerm(m, term) && !fromCaptures.some(c => c.content === m.url))
    .slice(0, 3)
    .map(m => ({
      content: m.url,
      description: `${escXml(m.title || m.url)} — ${m.visits} visits [frequent]`
    }));

  suggest([...fromCaptures, ...fromMetrics].slice(0, 6));
});

chrome.omnibox.onInputEntered.addListener((text, disposition) => {
  const url = text.startsWith('http') ? text : `https://www.google.com/search?q=${encodeURIComponent(text)}`;
  if (disposition === 'currentTab') chrome.tabs.update({ url });
  else chrome.tabs.create({ url });
});

function matchesTerm(item, term) {
  return [item.title, item.url, item.note, ...(item.keywords || [])].join(' ').toLowerCase().includes(term);
}

// ─── Message Handler ──────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender.tab?.id;
  handle(msg, tabId, sendResponse);
  return true; // keep channel open for async responses
});

async function handle(msg, tabId, respond) {
  switch (msg.action) {

    case 'saveCapture':
      await saveCapture(msg.data);
      if (msg.data.type === 'reference') await createBookmark(msg.data);
      if (tabId) chrome.tabs.remove(tabId);
      respond({ ok: true });
      break;

    case 'saveScratchpad':
      await saveScratchpad(msg.text);
      respond({ ok: true });
      break;

    case 'saveAnnotation': {
      const key = `m:${norm(msg.url)}`;
      const stored = await chrome.storage.local.get(key);
      const m = stored[key] || { url: msg.url, visits: 0, timeMs: 0, firstSeen: Date.now(), lastSeen: Date.now(), keywords: [] };
      if (msg.note) m.note = msg.note;
      if (msg.keywords?.length) m.keywords = [...new Set([...m.keywords, ...msg.keywords])];
      await chrome.storage.local.set({ [key]: m });
      respond({ ok: true });
      break;
    }

    case 'closeTab':
      if (tabId) chrome.tabs.remove(tabId);
      break;

    case 'switchToTab':
      chrome.tabs.update(msg.tabId, { active: true }, t => {
        chrome.windows.update(t.windowId, { focused: true });
      });
      break;

    case 'assignToGroup':
      await assignToGroup(tabId, msg.groupName, msg.color);
      respond({ ok: true });
      break;

    case 'getData': {
      const data = await chrome.storage.local.get(['captures', 'uncategorized', 'scratchpad']);
      respond({
        captures:      data.captures      || [],
        uncategorized: data.uncategorized  || [],
        scratchpad:    data.scratchpad     || []
      });
      break;
    }

    case 'getSettings':
      respond(await getSettings());
      break;

    case 'saveSettings':
      respond(await saveSettings(msg.settings));
      break;

    case 'getMetrics':
      respond(await getMetrics(msg.limit || 30));
      break;

    case 'getBookmarks': {
      const notes = await chrome.storage.local.get(null);
      const bms = await chrome.bookmarks.search({});
      const withNotes = bms
        .filter(b => b.url)
        .map(b => {
          const noteKey = `bn:${norm(b.url)}`;
          const metricKey = `m:${norm(b.url)}`;
          return {
            id: b.id, url: b.url, title: b.title,
            note: notes[noteKey]?.note || '',
            score: score(notes[metricKey] || {}),
            timestamp: b.dateAdded
          };
        })
        .sort((a, b) => b.score - a.score);
      respond(withNotes);
      break;
    }

    case 'saveBookmarkNote': {
      const key = `bn:${norm(msg.url)}`;
      await chrome.storage.local.set({ [key]: { note: msg.note, timestamp: Date.now() } });
      respond({ ok: true });
      break;
    }

    case 'deleteItem': {
      const stored = await chrome.storage.local.get(msg.list);
      const updated = (stored[msg.list] || []).filter(i => i.id !== msg.id);
      await chrome.storage.local.set({ [msg.list]: updated });
      respond({ ok: true });
      break;
    }

    case 'clearHistory': {
      const toDelete = {};
      if (msg.what.includes('uncategorized')) toDelete.uncategorized = [];
      if (msg.what.includes('captures'))      toDelete.captures = [];
      if (msg.what.includes('scratchpad'))    toDelete.scratchpad = [];
      await chrome.storage.local.set(toDelete);
      if (msg.what.includes('metrics')) {
        const all = await chrome.storage.local.get(null);
        const metricKeys = Object.keys(all).filter(k => k.startsWith('m:'));
        await chrome.storage.local.remove(metricKeys);
      }
      respond({ ok: true });
      break;
    }

    case 'closeAllBookmarked': {
      const tabs = await chrome.tabs.query({});
      const toClose = tabs.filter(t => t.url && bookmarkedUrls.has(norm(t.url)));
      if (toClose.length) chrome.tabs.remove(toClose.map(t => t.id));
      respond({ closed: toClose.length });
      break;
    }

    case 'openNextActionsGroup': {
      const stored = await chrome.storage.local.get('captures');
      const next = (stored.captures || []).filter(c => c.type === 'next');
      if (!next.length) { respond({ ok: false, reason: 'No next actions' }); break; }
      const tabIds = await Promise.all(next.map(c =>
        chrome.tabs.create({ url: c.url, active: false }).then(t => t.id)
      ));
      const groupId = await chrome.tabs.group({ tabIds });
      await chrome.tabGroups.update(groupId, { title: 'Next Actions', color: 'green' });
      respond({ ok: true, count: next.length });
      break;
    }

    case 'autoGroupTabs': {
      const count = await autoGroupAllTabs();
      respond({ ok: true, groups: count });
      break;
    }

    case 'exportData':
      await exportData();
      break;

    case 'getTabGroups':
      chrome.tabGroups.query({}).then(groups => respond(groups));
      break;

    default:
      respond({ ok: false, reason: 'Unknown action' });
  }
}

// ─── Storage helpers ──────────────────────────────────────────────────────────
async function autoCapture(tab) {
  const stored = await chrome.storage.local.get('uncategorized');
  const list = stored.uncategorized || [];
  if (list.some(c => norm(c.url) === norm(tab.url))) return;
  list.unshift({
    id: crypto.randomUUID(), url: tab.url, title: tab.title || tab.url,
    keywords: extractKeywords(tab.title, tab.url), timestamp: Date.now(), type: 'uncategorized'
  });
  await chrome.storage.local.set({ uncategorized: list });
}

async function saveCapture(data) {
  const stored = await chrome.storage.local.get('captures');
  const list = stored.captures || [];
  list.unshift({
    id: crypto.randomUUID(), ...data,
    keywords: extractKeywords(data.title || '', data.url || ''),
    timestamp: Date.now()
  });
  await chrome.storage.local.set({ captures: list });
}

async function saveScratchpad(text) {
  const stored = await chrome.storage.local.get('scratchpad');
  const list = stored.scratchpad || [];
  list.unshift({ id: crypto.randomUUID(), text, timestamp: Date.now() });
  await chrome.storage.local.set({ scratchpad: list });
}

async function createBookmark(data) {
  try {
    await chrome.bookmarks.create({ url: data.url, title: data.title || data.url });
    bookmarkedUrls.add(norm(data.url));
    if (data.note) {
      await chrome.storage.local.set({ [`bn:${norm(data.url)}`]: { note: data.note, timestamp: Date.now() } });
    }
  } catch {}
}

// ─── Tab Groups ───────────────────────────────────────────────────────────────
const GROUP_COLORS = ['grey','blue','red','yellow','green','pink','purple','cyan','orange'];

async function assignToGroup(tabId, groupName, color) {
  const groups = await chrome.tabGroups.query({});
  const existing = groups.find(g => g.title === groupName);
  if (existing) {
    await chrome.tabs.group({ tabIds: [tabId], groupId: existing.id });
  } else {
    const idx = groups.length % GROUP_COLORS.length;
    const groupId = await chrome.tabs.group({ tabIds: [tabId] });
    await chrome.tabGroups.update(groupId, { title: groupName, color: color || GROUP_COLORS[idx] });
  }
}

async function autoGroupAllTabs() {
  const tabs = await chrome.tabs.query({ pinned: false });
  const ungrouped = tabs.filter(t => t.url && !isSystemUrl(t.url) && t.groupId === -1);

  // Cluster by domain
  const domainMap = {};
  ungrouped.forEach(tab => {
    try {
      const domain = new URL(tab.url).hostname.replace(/^www\./, '');
      (domainMap[domain] = domainMap[domain] || []).push(tab.id);
    } catch {}
  });

  let created = 0;
  for (const [domain, tabIds] of Object.entries(domainMap)) {
    if (tabIds.length < 2) continue; // Only group if 2+ tabs from same domain
    const groupId = await chrome.tabs.group({ tabIds });
    const color = GROUP_COLORS[created % GROUP_COLORS.length];
    await chrome.tabGroups.update(groupId, { title: domain, color });
    created++;
  }
  return created;
}

// ─── Export ───────────────────────────────────────────────────────────────────
async function exportData() {
  const data = await chrome.storage.local.get(['captures', 'uncategorized', 'scratchpad']);
  const lines = ['# Tab Anxiety Export', `Generated: ${new Date().toISOString()}`, ''];

  const sections = [
    ['uncategorized', 'Inbox (Auto-captured)', data.uncategorized || []],
    ['next',      'Next Actions', (data.captures || []).filter(c => c.type === 'next')],
    ['someday',   'Someday / Maybe', (data.captures || []).filter(c => c.type === 'someday')],
    ['reference', 'Reference', (data.captures || []).filter(c => c.type === 'reference')]
  ];

  for (const [, label, items] of sections) {
    if (!items.length) continue;
    lines.push(`## ${label}`);
    items.forEach(c => {
      lines.push(`- [${c.title || c.url}](${c.url})`);
      if (c.note) lines.push(`  > ${c.note}`);
      if (c.keywords?.length) lines.push(`  Tags: ${c.keywords.slice(0, 5).join(', ')}`);
      lines.push(`  *${new Date(c.timestamp).toLocaleDateString()}*`);
    });
    lines.push('');
  }

  if (data.scratchpad?.length) {
    lines.push('## Ideas (Scratchpad)');
    data.scratchpad.forEach(s => {
      lines.push(`- ${s.text}`);
      lines.push(`  *${new Date(s.timestamp).toLocaleDateString()}*`);
    });
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
  chrome.downloads.download({
    url: URL.createObjectURL(blob),
    filename: `tab-anxiety-${new Date().toISOString().slice(0,10)}.md`,
    saveAs: true
  });
}

// ─── Content script injection (reliability fix) ───────────────────────────────
async function sendToContent(tabId, message) {
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch {
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
      await chrome.tabs.sendMessage(tabId, message);
    } catch {
      // System page or restricted URL — silently ignore
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function norm(url = '') {
  try { const u = new URL(url); return (u.hostname + u.pathname).replace(/\/$/, '').toLowerCase(); }
  catch { return url.toLowerCase(); }
}

function isSystemUrl(url) {
  return !url ||
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('about:') ||
    url === 'about:blank';
}

function isExcluded(url, domains = []) {
  if (!domains.length) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return domains.some(d => host === d.toLowerCase() || host.endsWith(`.${d.toLowerCase()}`));
  } catch { return false; }
}

const STOP_WORDS = new Set([
  'the','a','an','in','on','at','to','for','of','and','or','is','it',
  'with','from','by','as','be','was','are','this','that','have','had',
  'has','not','but','what','how','when','where','who','which',
  'www','com','http','https','html','php','page','home','index'
]);

function extractKeywords(title = '', url = '') {
  let path = '';
  try { path = new URL(url).pathname; } catch {}
  return (title + ' ' + path)
    .toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w) && !/^\d+$/.test(w))
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 12);
}

function escXml(str = '') {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
