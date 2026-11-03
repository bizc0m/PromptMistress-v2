document.getElementById('open-pm').onclick = () => {
  chrome.runtime.sendMessage({ action: 'open-promptmistress' });
  window.close();
};

document.getElementById('capture-page').onclick = async () => {
  const status = document.getElementById('status');
  const button = document.getElementById('capture-page');
  button.disabled = true;
  status.textContent = 'Lecture de la page…';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw Error('Aucun onglet actif.');
    const reply = await chrome.runtime.sendMessage({ action: 'capture-visible-tab', tabId: tab.id });
    if (!reply?.ok) throw Error(reply?.error || 'Capture impossible.');
    const result = reply.data;
    status.textContent = `${result.imported} importée(s), ${result.skipped} doublon(s) ignoré(s) · ${result.provider} · ${result.extraction}`;
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
};

document.getElementById('start-capture').onclick = async () => {
  const status = document.getElementById('status');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) { status.textContent = 'Aucun onglet actif.'; return; }
    const url = tab.url || '';
    if (!url.startsWith('https://chatgpt.com/') && !url.startsWith('https://www.perplexity.ai/')) {
      status.textContent = 'Ouvrez ChatGPT ou Perplexity dans cet onglet.';
      return;
    }
    await chrome.tabs.sendMessage(tab.id, { action: 'start-capture' });
    status.textContent = 'Capture lancée.';
    setTimeout(() => window.close(), 600);
  } catch (e) {
    status.textContent = 'Erreur : ' + e.message;
  }
};
