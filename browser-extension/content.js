const PM_ORIGIN = 'http://127.0.0.1:18431';

function getProvider() {
  const host = location.hostname;
  if (host === 'chatgpt.com') return 'chatgpt';
  if (host === 'perplexity.ai' || host === 'www.perplexity.ai') return 'perplexity';
  return null;
}

// chatgpt.com and perplexity.ai cannot share a browser window, so conversations are
// handed to the service instead and every source meets in its staging area.
//
// The calls are relayed through the background service worker: a fetch issued from this
// page would come from a public HTTPS origin aimed at a loopback address, which Chrome
// blocks under Local Network Access before it even leaves the browser.
let pmToken = '';

async function pm(path, body) {
  const reply = await chrome.runtime.sendMessage({action: 'pm-fetch', path, body, token: pmToken});
  if (!reply) throw new Error('Extension PromptMistress non disponible');
  if (!reply.ok) throw new Error(reply.error || 'PromptMistress injoignable');
  return reply.data;
}

async function connectPM() {
  const auth = await pm('/api/capture-token');
  if (!auth || !auth.token) throw new Error('Jeton de capture indisponible');
  pmToken = auth.token;
}

const delay = (ms = 450) => new Promise(r => setTimeout(r, ms));

// ---------- ChatGPT helpers ----------
async function gptGet(url, token, auth = true) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const headers = auth ? { Authorization: 'Bearer ' + token } : {};
    const r = await fetch(url, { credentials: 'same-origin', headers, signal: controller.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function listChatGPT(sendMsg) {
  const known = new Set();
  const notes = [];
  let token = '';
  try {
    token = (await gptGet('/api/auth/session', token, false)).accessToken;
    if (!token) throw new Error('Session ChatGPT non connectée');
  } catch (e) {
    sendMsg('error', { message: e.message });
    return;
  }
  for (const archived of [false, true]) {
    let offset = 0, cursor = null;
    const cursors = new Set();
    let pageCount = 0;
    try {
      while (true) {
        pageCount++;
        const q = new URLSearchParams({ offset: String(offset), limit: '100', order: 'updated', is_archived: String(archived) });
        if (cursor) q.set('cursor', cursor);
        const page = await gptGet('/backend-api/conversations?' + q, token);
        if (!Array.isArray(page.items)) throw new Error('Format de liste non reconnu');
        const rows = [];
        for (const item of page.items) {
          const id = item.id || item.conversation_id;
          if (typeof id !== 'string' || known.has(id)) continue;
          known.add(id);
          rows.push({ id, title: String(item.title || 'Sans titre'), archived, updated: item.update_time || '' });
        }
        if (rows.length) sendMsg('rows', rows);
        if (page.items.length === 0) break;
        offset += page.items.length;
        const next = page.next_cursor;
        if (next && !cursors.has(next)) {
          cursors.add(next); cursor = next;
        } else if (!next || page.has_more === false || (typeof page.total === 'number' && offset >= page.total)) {
          break;
        }
        await delay();
      }
      notes.push((archived ? 'Archives' : 'Conversations') + ' : ' + pageCount + ' pages lues');
    } catch (e) {
      notes.push((archived ? 'Archives' : 'Conversations') + ' : ' + e.message);
    }
  }
  sendMsg('listed', { count: known.size, notes, stopped: false });
}

async function captureChatGPT(ids, plus, sendMsg, stopRef) {
  const known = new Set(ids);
  let token = '';
  try {
    token = (await gptGet('/api/auth/session', token, false)).accessToken;
    if (!token) throw new Error('Session ChatGPT non connectée');
  } catch (e) {
    sendMsg('error', { message: e.message });
    return;
  }
  for (const id of ids) {
    if (stopRef.stopped) break;
    if (!known.has(id)) continue;
    try {
      sendMsg('progress', { id });
      const c = await gptGet('/backend-api/conversation/' + encodeURIComponent(id), token);
      if (!c.mapping) throw new Error('Conversation sans messages');
      sendMsg('conversation', { ...c, id, conversation_id: id, url: 'https://chatgpt.com/c/' + encodeURIComponent(id), capture: { format: 'promptmistress.capture.v1', method: 'api', scope: 'returned-conversation-mapping', attachments: plus ? 'attempted-v1' : 'not-downloaded', captured_at: new Date().toISOString() } });
    } catch (e) {
      if (stopRef.stopped) break;
      sendMsg('capture-error', { id, message: e.message });
      if (/HTTP (401|403|429)/.test(e.message)) { stopRef.stopped = true; break; }
    }
    await delay();
  }
  sendMsg('done', { stopped: stopRef.stopped });
}

// ---------- Perplexity helpers ----------
async function pplxGet(url, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const opts = { credentials: 'same-origin', signal: controller.signal };
    if (body) {
      opts.method = 'POST';
      opts.headers = { 'Content-Type': 'application/json' };
      opts.body = JSON.stringify(body);
    }
    const r = await fetch(url, opts);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

async function listPerplexity(sendMsg) {
  const known = new Map();
  const notes = [];
  try {
    for (let offset = 0; ; offset += 100) {
      const d = await pplxGet('/rest/thread/list_ask_threads?version=2.18&source=default', { limit: 100, offset, ascending: false, search_term: '', exclude_asi: false });
      const items = Array.isArray(d) ? d : d.data || d.threads;
      if (!Array.isArray(items)) throw new Error('Format de liste Perplexity non reconnu');
      const rows = [];
      for (const t of items) {
        const id = t.slug || t.uuid || t.url_slug || t.id;
        if (typeof id !== 'string' || known.has(id)) continue;
        const row = { id, title: String(t.title || t.query || t.name || id), source: 'perplexity' };
        known.set(id, row);
        rows.push(row);
      }
      if (rows.length) sendMsg('rows', rows);
      if (!items.length || items.length < 100) break;
      await delay(1000);
    }
  } catch (e) {
    notes.push(e.message);
  }
  // Ajoute aussi les liens visibles dans la page courante.
  const pageLinks = [...document.querySelectorAll('a[href*="/search/"]')].flatMap(a => {
    try {
      const u = new URL(a.href);
      return (u.origin === location.origin && u.pathname.startsWith('/search/')) ? [{ slug: decodeURIComponent(u.pathname.slice(8)), title: a.textContent.trim() }] : [];
    } catch { return []; }
  });
  if (pageLinks.length) {
    const rows = [];
    for (const t of pageLinks) {
      if (known.has(t.slug)) continue;
      const row = { id: t.slug, title: t.title || t.slug, source: 'perplexity' };
      known.set(t.slug, row); rows.push(row);
    }
    if (rows.length) sendMsg('rows', rows);
  }
  notes.push('Couverture : liste renvoyée par Perplexity et liens chargés dans cette page.');
  sendMsg('listed', { count: known.size, notes, stopped: false });
}

async function capturePerplexity(ids, plus, sendMsg, stopRef) {
  const known = new Map(ids.map(id => [id, true]));
  for (const id of ids) {
    if (stopRef.stopped) break;
    if (!known.has(id)) continue;
    try {
      sendMsg('progress', { id });
      const raw = await pplxGet('/rest/thread/' + encodeURIComponent(id) + '?version=2.18&source=default');
      if (!Array.isArray(raw.entries)) throw new Error('Format de conversation Perplexity non reconnu');
      sendMsg('conversation', { id, source: 'perplexity', title: raw.title || id, url: location.origin + '/search/' + encodeURIComponent(id), raw, capture: { captured_at: new Date().toISOString(), scope: 'returned-thread-entries', attachments: plus ? 'attempted-v1' : 'not-downloaded' } });
    } catch (e) {
      if (stopRef.stopped) break;
      sendMsg('capture-error', { id, message: e.message });
      if (/HTTP (401|403|429)/.test(e.message)) { stopRef.stopped = true; break; }
    }
    await delay(1000);
  }
  sendMsg('done', { stopped: stopRef.stopped });
}

// ---------- UI injection ----------
function ensureButton() {
  const existing = document.getElementById('pm-capture-fab');
  if (existing) return existing;
  const btn = document.createElement('button');
  btn.id = 'pm-capture-fab';
  btn.title = 'Capturer dans PromptMistress';
  btn.textContent = 'PM';
  btn.style.cssText = 'position:fixed;bottom:22px;right:22px;z-index:2147483647;min-width:48px;height:48px;padding:0 14px;border-radius:24px;border:1px solid #30323d;background:#17283e;color:#80bdff;font:700 13px system-ui;cursor:pointer;box-shadow:0 6px 24px #0006;transition:transform .15s;pointer-events:auto';
  btn.addEventListener('mouseenter', () => btn.style.transform = 'scale(1.08)');
  btn.addEventListener('mouseleave', () => btn.style.transform = 'scale(1)');
  document.body.append(btn);
  return btn;
}

// ---------- Staging bridge ----------
function run(provider) {
  const btn = ensureButton();
  const known = new Set();
  const sent = new Set();
  let running = false;
  const stopRef = { stopped: false };
  const label = t => { btn.textContent = t; };

  // The API helpers report progress through this one callback, so routing them to the
  // staging area is all that changes: titles and conversations go to the service,
  // everything else is local feedback.
  function report(type, payload) {
    if (type === 'rows') {
      for (const r of payload) known.add(r.id);
      void pm('/api/stage/rows', { rows: payload }).catch(e => label('PM ⚠ ' + e.message));
      label('PM ' + known.size);
    } else if (type === 'conversation') {
      sent.add(payload.id);
      void pm('/api/stage/conversations', { conversations: [payload] }).catch(e => label('PM ⚠ ' + e.message));
      label('PM ↑' + sent.size);
    } else if (type === 'listed') {
      label('PM ' + payload.count);
    } else if (type === 'progress') {
      label('PM …');
    } else if (type === 'error' || type === 'capture-error') {
      label('PM ⚠');
      console.warn('[PromptMistress]', payload.message || payload);
    }
  }

  // Keep answering whatever the /capture screen asks for, for as long as this tab lives.
  async function serve() {
    while (!stopRef.stopped) {
      try {
        const state = await pm('/api/stage');
        const todo = (state.wanted || []).filter(id => known.has(id) && !sent.has(id));
        if (todo.length) {
          if (provider === 'chatgpt') await captureChatGPT(todo, false, report, stopRef);
          else await capturePerplexity(todo, false, report, stopRef);
        }
      } catch (e) {
        label('PM ⚠');
        console.warn('[PromptMistress]', e.message);
      }
      await delay(1500);
    }
  }

  async function start() {
    if (running) { stopRef.stopped = true; label('PM'); running = false; return; }
    running = true;
    stopRef.stopped = false;
    try {
      await connectPM();
    } catch (e) {
      running = false;
      alert('PromptMistress est injoignable sur ' + PM_ORIGIN + '.\nLancez l’application, puis réessayez.');
      return;
    }
    label('PM …');
    if (provider === 'chatgpt') await listChatGPT(report);
    else await listPerplexity(report);
    void serve();
  }

  btn.onclick = start;
  btn.title = 'Capturer dans PromptMistress (recliquer pour arrêter)';

  chrome.runtime?.onMessage?.addListener((msg, sender, respond) => {
    if (msg.action === 'start-capture') { void start(); respond({ ok: true }); return true; }
    if (msg.action === 'get-state') { respond({ provider, running, listed: known.size, sent: sent.size }); return true; }
  });
}

const provider = getProvider();
if (provider) run(provider);
