// Tab Anxiety — Background Service Worker

// ─── Tab Cache ────────────────────────────────────────────────────────────────
// We cache tab info because onRemoved fires after the tab is gone
const tabCache = {};

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab.url) tabCache[tabId] = { url: tab.url, title: tab.title || '' };
  if (changeInfo.status === 'complete' && tab.url && !isSystemUrl(tab.url)) {
    checkTabOnLoad(tab);
  }
});

chrome.tabs.onCreated.addListener((tab) => {
  if (tab.url) tabCache[tab.id] = { url: tab.url, title: tab.title || '' };
});

chrome.tabs.onRemoved.addListener((tabId) => {
  const tab = tabCache[tabId];
  if (tab && tab.url && !isSystemUrl(tab.url)) {
    autoCapture(tab);
  }
  delete tabCache[tabId];
});

// ─── Commands ─────────────────────────────────────────────────────────────────
chrome.commands.onCommand.addListener((command, tab) => {
  if (!tab?.id) return;
  if (command === 'triage-tab')  sendToContent(tab.id, { action: 'showTriage' });
  if (command === 'assign-group') sendToContent(tab.id, { action: 'showGroupPicker' });
  if (command === 'scratchpad')   sendToContent(tab.id, { action: 'showScratchpad' });
});

// ─── Message Handler ──────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  if (msg.action === 'saveCapture') {
    saveCapture(msg.data).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.action === 'saveUncategorized') {
    autoCapture(msg.data).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.action === 'saveScratchpad') {
    saveScratchpad(msg.text).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.action === 'closeTab' && tabId) {
    chrome.tabs.remove(tabId);
    return;
  }
  if (msg.action === 'switchToTab') {
    chrome.tabs.update(msg.tabId, { active: true }, (tab) => {
      chrome.windows.update(tab.windowId, { focused: true });
    });
    return;
  }
  if (msg.action === 'assignToGroup') {
    assignToGroup(tabId, msg.groupName, msg.color)
      .then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.action === 'getTabGroups') {
    chrome.tabGroups.query({}).then(groups => sendResponse(groups));
    return true;
  }
  if (msg.action === 'getData') {
    getAllData().then(data => sendResponse(data));
    return true;
  }
  if (msg.action === 'deleteItem') {
    deleteItem(msg.list, msg.id).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.action === 'exportData') {
    exportData();
    return;
  }
});

// ─── Tab Load Checks ──────────────────────────────────────────────────────────
async function checkTabOnLoad(tab) {
  // 1. Duplicate tab check
  const allTabs = await chrome.tabs.query({});
  const dupes = allTabs.filter(t => t.url === tab.url && t.id !== tab.id);
  if (dupes.length > 0) {
    sendToContent(tab.id, { action: 'showBanner', type: 'duplicate', dupeTabId: dupes[0].id });
    return;
  }

  // 2. Already bookmarked
  const bookmarks = await chrome.bookmarks.search({ url: tab.url });
  if (bookmarks.length > 0) {
    sendToContent(tab.id, { action: 'showBanner', type: 'bookmarked' });
    return;
  }

  // 3. Previously captured
  const data = await chrome.storage.local.get(['captures', 'uncategorized']);
  const all = [...(data.captures || []), ...(data.uncategorized || [])];
  const prev = all.find(c => c.url === tab.url);
  if (prev) {
    sendToContent(tab.id, { action: 'showBanner', type: 'captured', capture: prev });
  }
}

// ─── Storage ──────────────────────────────────────────────────────────────────
async function autoCapture(tab) {
  const stored = await chrome.storage.local.get('uncategorized');
  const list = stored.uncategorized || [];
  // Avoid duplicate entries
  if (list.some(c => c.url === tab.url)) return;
  list.unshift({
    id: crypto.randomUUID(),
    url: tab.url,
    title: tab.title || tab.url,
    keywords: extractKeywords(tab.title, tab.url),
    timestamp: Date.now(),
    type: 'uncategorized'
  });
  await chrome.storage.local.set({ uncategorized: list });
}

async function saveCapture(data) {
  const stored = await chrome.storage.local.get('captures');
  const list = stored.captures || [];
  list.unshift({
    id: crypto.randomUUID(),
    ...data,
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

async function getAllData() {
  return chrome.storage.local.get(['captures', 'uncategorized', 'scratchpad']);
}

async function deleteItem(list, id) {
  const stored = await chrome.storage.local.get(list);
  const updated = (stored[list] || []).filter(i => i.id !== id);
  await chrome.storage.local.set({ [list]: updated });
}

async function exportData() {
  const data = await getAllData();
  const lines = ['# Tab Anxiety Export', `Generated: ${new Date().toISOString()}`, ''];

  if (data.uncategorized?.length) {
    lines.push('## Uncategorized (auto-captured)');
    data.uncategorized.forEach(c => {
      lines.push(`- [${c.title}](${c.url})`);
      lines.push(`  *${new Date(c.timestamp).toLocaleDateString()}*`);
    });
    lines.push('');
  }
  if (data.captures?.length) {
    const groups = { next: [], someday: [], reference: [] };
    data.captures.forEach(c => (groups[c.type] || groups.reference).push(c));

    [['next', 'Next Actions'], ['someday', 'Someday / Maybe'], ['reference', 'Reference']].forEach(([key, label]) => {
      if (!groups[key].length) return;
      lines.push(`## ${label}`);
      groups[key].forEach(c => {
        lines.push(`- [${c.title}](${c.url})`);
        if (c.note) lines.push(`  > ${c.note}`);
        lines.push(`  *${new Date(c.timestamp).toLocaleDateString()}*`);
      });
      lines.push('');
    });
  }
  if (data.scratchpad?.length) {
    lines.push('## Scratchpad');
    data.scratchpad.forEach(s => {
      lines.push(`- ${s.text}`);
      lines.push(`  *${new Date(s.timestamp).toLocaleDateString()}*`);
    });
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  chrome.downloads.download({ url, filename: 'tab-anxiety-export.md', saveAs: true });
}

// ─── Tab Groups ───────────────────────────────────────────────────────────────
const GROUP_COLORS = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];
const FIXED_GROUPS = [
  { name: 'Reading',   color: 'blue'   },
  { name: 'Reference', color: 'grey'   },
  { name: 'Someday',   color: 'purple' }
];

async function assignToGroup(tabId, groupName, color) {
  const groups = await chrome.tabGroups.query({});
  const existing = groups.find(g => g.title === groupName);
  if (existing) {
    await chrome.tabs.group({ tabIds: [tabId], groupId: existing.id });
  } else {
    const newColor = color || GROUP_COLORS[groups.length % GROUP_COLORS.length];
    const groupId = await chrome.tabs.group({ tabIds: [tabId] });
    await chrome.tabGroups.update(groupId, { title: groupName, color: newColor });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function sendToContent(tabId, message) {
  chrome.tabs.sendMessage(tabId, message).catch(() => {
    // Content script not ready yet — retry once after a short delay
    setTimeout(() => chrome.tabs.sendMessage(tabId, message).catch(() => {}), 500);
  });
}

function isSystemUrl(url) {
  return !url || url.startsWith('chrome://') || url.startsWith('chrome-extension://') ||
    url.startsWith('about:') || url === 'about:blank';
}

const STOP_WORDS = new Set([
  'the','a','an','in','on','at','to','for','of','and','or','is','it',
  'with','from','by','as','be','was','are','this','that','have','had',
  'has','not','but','what','how','when','where','who','which',
  'www','com','http','https','html','php'
]);

function extractKeywords(title = '', url = '') {
  let urlPath = '';
  try { urlPath = new URL(url).pathname; } catch {}
  return (title + ' ' + urlPath)
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w) && !/^\d+$/.test(w))
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 12);
}
