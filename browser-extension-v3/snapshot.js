(function captureVisibleConversation() {
  const page = document.querySelector('main, [role="main"]') || document.body;
  if (!page) return {error: 'Page vide.'};
  const selectors = [
    '[data-message-author-role]', '[data-message-role]',
    '[data-role="user"]', '[data-role="assistant"]',
    '[data-testid="user-message"]', '[data-testid="assistant-message"]',
    '[data-test-id="user-query"]', '[data-test-id="model-response"]',
    '.user-query', '.model-response-text'
  ];
  const selector = selectors.join(',');
  const nodes = [...page.querySelectorAll(selector)].filter(node => !node.parentElement?.closest(selector));
  const messages = [];
  for (const node of nodes) {
    const marker = [node.getAttribute('data-message-author-role'), node.getAttribute('data-message-role'),
      node.getAttribute('data-role'), node.getAttribute('data-testid'), node.getAttribute('data-test-id'), node.className]
      .filter(value => typeof value === 'string').join(' ').toLowerCase();
    const role = /(^|\W)(user|human|query)(\W|$)/.test(marker) ? 'user'
      : /(^|\W)(assistant|model|response|ai)(\W|$)/.test(marker) ? 'assistant' : null;
    const content = (node.innerText || '').trim();
    if (role && content) messages.push({role, content});
  }
  let extraction = 'structured';
  if (!messages.length) {
    const selection = String(window.getSelection() || '').trim();
    const text = selection.length >= 20 ? selection : (page.innerText || '').trim();
    if (!text) return {error: 'Aucun texte visible à capturer.'};
    messages.push({role: 'assistant', content: text});
    extraction = selection.length >= 20 ? 'selection' : 'page-text';
  }
  if (messages.length > 1000 || messages.some(message => message.content.length > 250000))
    return {error: 'Conversation trop longue pour une capture directe.'};
  if (JSON.stringify(messages).length > 16000000)
    return {error: 'Conversation trop volumineuse pour une capture directe.'};
  return {
    title: (document.title || location.hostname).slice(0, 300),
    url: location.href,
    messages,
    capture: {format: 'promptmistress.capture.v1', method: 'visible-page',
      extraction, captured_at: new Date().toISOString(), attachments: 'not-downloaded'}
  };
})();
