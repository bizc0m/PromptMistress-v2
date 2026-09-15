document.getElementById('open-pm').onclick = () => {
  chrome.runtime.sendMessage({ action: 'open-promptmistress' });
  window.close();
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
