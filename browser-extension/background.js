chrome.action.onClicked.addListener(async (tab) => {
  const url = tab.url || '';
  if (url.startsWith('https://chatgpt.com/') || url.startsWith('https://www.perplexity.ai/')) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => { window.postMessage({ pm: 'pm-ext-action', action: 'start-capture' }, location.origin); }
      });
    } catch (e) {
      console.error(e);
    }
  } else {
    chrome.tabs.create({ url: 'http://127.0.0.1:18431/' });
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'open-promptmistress') {
    chrome.tabs.create({ url: 'http://127.0.0.1:18431/' });
    sendResponse({ ok: true });
  }
  return true;
});
