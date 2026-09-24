const PM_ORIGIN = 'http://127.0.0.1:18431';

// Chrome gates requests from a public HTTPS page to a loopback address behind Local
// Network Access, and blocks them before they leave the browser. The service worker runs
// on the extension origin with host_permissions for 127.0.0.1, so it is not gated — every
// call to PromptMistress goes through here rather than from the content script.
async function pmFetch({path, body, token}) {
  const r = await fetch(PM_ORIGIN + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      ...(token ? {'X-Capture-Token': token} : {}),
      ...(body ? {'Content-Type': 'application/json'} : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data = null;
  try { data = JSON.parse(text); } catch {}
  if (!r.ok) throw new Error((data && data.error) || 'PromptMistress HTTP ' + r.status);
  return data;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'pm-fetch') {
    pmFetch(request)
      .then(data => sendResponse({ok: true, data}))
      .catch(e => sendResponse({ok: false, error: e.message}));
    return true;
  }
  if (request.action === 'open-promptmistress') {
    chrome.tabs.create({url: PM_ORIGIN + '/'});
    sendResponse({ok: true});
    return true;
  }
  return false;
});

chrome.action.onClicked.addListener(async (tab) => {
  const url = tab.url || '';
  if (url.startsWith('https://chatgpt.com/') || url.startsWith('https://www.perplexity.ai/')) {
    try {
      await chrome.tabs.sendMessage(tab.id, {action: 'start-capture'});
    } catch (e) {
      console.error(e);
    }
  } else {
    chrome.tabs.create({url: PM_ORIGIN + '/'});
  }
});
