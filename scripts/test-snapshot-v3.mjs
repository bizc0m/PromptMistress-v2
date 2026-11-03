import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
const source=fs.readFileSync('browser-extension-v3/snapshot.js','utf8');
function capture(html, values, selection=''){
 const dom=new JSDOM(html,{url:'https://claude.ai/chat/example',runScripts:'outside-only'});
 for(const [selector,text] of Object.entries(values)){
  const element=dom.window.document.querySelector(selector);
  Object.defineProperty(element,'innerText',{value:text,configurable:true});
 }
 dom.window.getSelection=()=>({toString:()=>selection});
 return JSON.parse(JSON.stringify(dom.window.eval(source)));
}
const structured=capture('<title>Claude</title><main><div data-testid="user-message"></div><div data-testid="assistant-message"></div></main>',
 {'[data-testid="user-message"]':'Bonjour','[data-testid="assistant-message"]':'Salut'});
assert.deepEqual(structured.messages,[{role:'user',content:'Bonjour'},{role:'assistant',content:'Salut'}]);
assert.equal(structured.capture.extraction,'structured');
const selected=capture('<main></main>',{'main':'Texte de la page entière'},'Échange sélectionné par l’utilisateur');
assert.deepEqual(selected.messages,[{role:'assistant',content:'Échange sélectionné par l’utilisateur'}]);
assert.equal(selected.capture.extraction,'selection');
const fallback=capture('<main></main>',{'main':'Conversation visible sur cette page'});
assert.deepEqual(fallback.messages,[{role:'assistant',content:'Conversation visible sur cette page'}]);
assert.equal(fallback.capture.extraction,'page-text');
const empty=capture('<main></main>',{'main':''});
assert.match(empty.error,/Aucun texte/);
console.log('Capture universelle V3 : messages structurés, sélection et page visible validés.');
