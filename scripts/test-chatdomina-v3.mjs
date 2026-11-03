import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { resolve } from 'node:path';

const binary = resolve('dist/PromptMistress-V3-preview.app/Contents/Resources/bin/chatdomina');
function render(request) {
  return new Promise((done, fail) => {
    const child = execFile(binary, [], { timeout: 15000, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) return fail(new Error(stderr || error.message));
      try { done(JSON.parse(stdout)); } catch (cause) { fail(cause); }
    });
    child.stdin.end(JSON.stringify({ version: '0.2.2', ...request }));
  });
}

const text = 'Extrait littéral {{date}} $client';
const result = await render({ mode: 'prompt', title: 'Titre exact - Claude', text,
  source: 'Claude', sourceLink: 'https://claude.ai/epitaxy/local_ae2355df-f82c-4f38-9527-d71599eb13e9',
  tags: '#PromptMistress' });
assert.equal(result.version, '0.2.2');
assert.match(result.markdown, /^## Titre exact\n/);
assert.ok(result.markdown.includes(text));
assert.ok(result.markdown.includes('#PromptMistress'));
assert.ok(result.sourceURL.startsWith('claude://'));
await assert.rejects(render({ mode: 'chat', text: 'fragment non confirmé' }));
const chat = await render({ mode: 'chat', title: 'Conversation test', text: 'Utilisateur : Bonjour\nAssistant : Salut',
  source: 'Codex', sourceLink: 'codex://threads/01a167b9-4353-7fe1-a073-b30a4bb32beb',
  tags: '#PromptMistress', completeChat: true });
assert.ok(chat.markdown.includes('Type : Chat'));
assert.ok(chat.markdown.includes('Utilisateur : Bonjour'));
console.log('V3 + CHATDomina : extrait, chat confirmé et refus du chat incomplet validés.');
