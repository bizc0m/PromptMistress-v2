import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';

const source=fs.readFileSync('browser-extension-v3/content.js','utf8');
const store={};
const imported=[];
const listing=[];
const statuses=[];

async function visit(){
  const dom=new JSDOM('<!doctype html><body></body>',{url:'https://chatgpt.com/',pretendToBeVisual:true});
  const {window}=dom;
  Object.defineProperty(window.document,'visibilityState',{value:'hidden',configurable:true});
  const chrome={
    runtime:{sendMessage:async request=>{
      if(request.path==='/api/preferences')return {ok:true,data:{autoImport:true}};
      if(request.path==='/api/capture-token')return {ok:true,data:{token:'test'}};
      if(request.path==='/api/source-status'){statuses.push(request.body);return {ok:true,data:request.body};}
      if(request.path==='/api/capture'){
        imported.push(...request.body.conversations.map(conversation=>conversation.id));
        return {ok:true,data:{imported:request.body.conversations.length,skipped:0}};
      }
      throw Error('Unexpected native request '+request.path);
    },onMessage:{addListener(){}}},
    storage:{local:{get:async key=>({[key]:store[key]}),set:async values=>Object.assign(store,values)}}
  };
  const fetch=async url=>{
    if(url==='/api/auth/session')return {ok:true,json:async()=>({accessToken:'test-token'})};
    if(url.startsWith('/backend-api/conversations?')){
      const params=new URL(url,'https://chatgpt.com').searchParams;
      const archived=params.get('is_archived')==='true';
      const offset=Number(params.get('offset'));
      listing.push({archived,offset});
      const items=archived?[]:offset===0?[
        {id:'one',title:'Premier',update_time:'2026-11-01'},
        {id:'two',title:'Second',update_time:'2026-11-01'}
      ]:offset===2?[{id:'three',title:'Troisième',update_time:'2026-11-02'}]:[];
      return {ok:true,json:async()=>({items,has_more:!archived&&offset===0})};
    }
    if(url.startsWith('/backend-api/conversation/')){
      const id=decodeURIComponent(url.split('/').pop());
      return {ok:true,json:async()=>({mapping:{node:{message:{content:{parts:[id]}}}}})};
    }
    throw Error('Unexpected fetch '+url);
  };
  const context=vm.createContext({
    window,document:window.document,location:window.location,chrome,fetch,
    URL,URLSearchParams,AbortController,console,
    setTimeout,clearTimeout,setInterval:()=>0
  });
  vm.runInContext(source,context,{filename:'content.js'});
  for(let i=0;i<50;i++){
    if(window.document.getElementById('pm-capture-fab')?.textContent?.startsWith('PM ✓'))break;
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.match(window.document.getElementById('pm-capture-fab')?.textContent||'',/^PM ✓/);
  dom.window.close();
}

await visit();
assert.deepEqual(imported,['one','two','three']);
assert(listing.some(page=>!page.archived&&page.offset===2),'Offset pagination must reach the second page');
assert.equal(Object.keys(store['autoHistoryV3:chatgpt']).length,3);
assert(statuses.some(status=>status.provider==='chatgpt'&&status.state==='running'&&status.listed===3),'Running status must show the discovered history');
assert(statuses.some(status=>status.provider==='chatgpt'&&status.state==='running'&&status.imported===3),'Running status must show imported batches');
await visit();
assert.deepEqual(imported,['one','two','three'],'Unchanged conversations must not be captured twice');
console.log('Historique V3 : pagination, import en onglet masqué et reprise sans doublons validés.');

async function visitPerplexity(){
  const dom=new JSDOM('<!doctype html><body></body>',{url:'https://www.perplexity.ai/',pretendToBeVisual:true});
  const {window}=dom;
  Object.defineProperty(window.document,'visibilityState',{value:'hidden',configurable:true});
  const chrome={
    runtime:{sendMessage:async request=>{
      if(request.path==='/api/preferences')return {ok:true,data:{autoImport:true}};
      if(request.path==='/api/capture-token')return {ok:true,data:{token:'test'}};
      if(request.path==='/api/source-status')return {ok:true,data:request.body};
      if(request.path==='/api/capture'){
        imported.push(...request.body.conversations.map(conversation=>conversation.id));
        return {ok:true,data:{imported:request.body.conversations.length,skipped:0}};
      }
      throw Error('Unexpected native request '+request.path);
    },onMessage:{addListener(){}}},
    storage:{local:{get:async key=>({[key]:store[key]}),set:async values=>Object.assign(store,values)}}
  };
  const fetch=async (url,options={})=>{
    if(url.startsWith('/rest/thread/list_ask_threads?')){const offset=JSON.parse(options.body).offset;return {ok:true,json:async()=>({data:offset===0?[
      {slug:'p-one',title:'Recherche une',updated_at:'2026-11-01'},
      {slug:'p-two',title:'Recherche deux',updated_at:'2026-11-02'}
    ]:offset===100?[{slug:'p-three',title:'Page suivante',updated_at:'2026-11-03'}]:[]})};}
    if(url.startsWith('/rest/thread/'))return {ok:true,json:async()=>({entries:[{text:[{step_type:'INITIAL_QUERY',content:{query:'Texte'}},{step_type:'FINAL',content:{answer:'Réponse'}}]}]})};
    throw Error('Unexpected fetch '+url);
  };
  const context=vm.createContext({window,document:window.document,location:window.location,chrome,fetch,
    URL,URLSearchParams,AbortController,console,setTimeout,clearTimeout,setInterval:()=>0});
  vm.runInContext(source,context,{filename:'content.js'});
  for(let i=0;i<120;i++){
    if(window.document.getElementById('pm-capture-fab')?.textContent?.startsWith('PM ✓'))break;
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.match(window.document.getElementById('pm-capture-fab')?.textContent||'',/^PM ✓/);
  dom.window.close();
}
await visitPerplexity();
assert.deepEqual(imported,['one','two','three','p-one','p-two','p-three']);
await visitPerplexity();
assert.deepEqual(imported,['one','two','three','p-one','p-two','p-three'],'Unchanged Perplexity threads must not be captured twice');
console.log('Perplexity V3 : import automatique et reprise sans doublons validés.');
