const HOST='com.bizc0m.promptmistress.v3';
let port=null;
const pending=new Map();
function connect(){
  if(port)return port;
  const active=chrome.runtime.connectNative(HOST);
  port=active;
  active.onMessage.addListener(reply=>{
    const entry=pending.get(reply?.requestId);if(!entry)return;
    pending.delete(reply.requestId);
    reply.ok?entry.resolve(reply.data):entry.reject(Error(reply.error||'Erreur de capture.'));
  });
  active.onDisconnect.addListener(()=>{
    const message=chrome.runtime.lastError?.message||'Hôte natif déconnecté.';
    if(port===active)port=null;
    for(const entry of pending.values())entry.reject(Error(message));
    pending.clear();
  });
  return active;
}
function nativeRequest(request){
  return new Promise((resolve,reject)=>{
    const requestId=crypto.randomUUID();
    pending.set(requestId,{resolve,reject});
    try{connect().postMessage({requestId,path:request.path,body:request.body});}
    catch(error){pending.delete(requestId);reject(error);}
  });
}

function sourceForHost(hostname){
  const names=[['claude.ai','claude'],['gemini.google.com','gemini'],['grok.com','grok'],
    ['copilot.microsoft.com','copilot'],['chat.deepseek.com','deepseek'],['chat.mistral.ai','mistral'],
    ['poe.com','poe'],['character.ai','character-ai'],['meta.ai','meta-ai'],
    ['you.com','you'],['phind.com','phind'],['chatgpt.com','chatgpt'],['perplexity.ai','perplexity']];
  const match=names.find(([domain])=>hostname===domain||hostname.endsWith('.'+domain));
  return 'web-'+(match?.[1]||hostname.toLowerCase().replace(/[^a-z0-9-]/g,'-').slice(0,64));
}
async function captureVisibleTab(tabId){
  const tab=await chrome.tabs.get(tabId);
  const url=new URL(tab.url||'');
  if(!['http:','https:'].includes(url.protocol))throw Error('Ouvrez une conversation dans une page web.');
  const results=await chrome.scripting.executeScript({target:{tabId},files:['snapshot.js']});
  const snapshot=results?.[0]?.result;
  if(!snapshot||snapshot.error)throw Error(snapshot?.error||'Lecture de la page impossible.');
  const canonical=new URL(snapshot.url);canonical.hash='';
  snapshot.url=canonical.href;
  const id=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(snapshot.url)).then(data=>
    [...new Uint8Array(data)].map(byte=>byte.toString(16).padStart(2,'0')).join(''));
  const conversation={...snapshot,id,source:sourceForHost(url.hostname),
    created:snapshot.capture.captured_at,updated:snapshot.capture.captured_at};
  const result=await nativeRequest({path:'/api/capture',body:{conversations:[conversation]}});
  return {...result,provider:conversation.source,extraction:snapshot.capture.extraction};
}
chrome.runtime.onMessage.addListener((request,sender,respond)=>{
  if(request.action==='pm-fetch'){
    nativeRequest(request).then(data=>respond({ok:true,data}),error=>respond({ok:false,error:error.message}));
    return true;
  }
  if(request.action==='capture-visible-tab'){
    if(!sender.url?.startsWith(chrome.runtime.getURL(''))){respond({ok:false,error:'Action non autorisée.'});return false;}
    captureVisibleTab(request.tabId).then(data=>respond({ok:true,data}),error=>respond({ok:false,error:error.message}));
    return true;
  }
  if(request.action==='open-promptmistress'){
    chrome.tabs.create({url:chrome.runtime.getURL('capture.html')});respond({ok:true});return true;
  }
  return false;
});
chrome.action.onClicked.addListener(async tab=>{
  const url=tab.url||'';
  if(url.startsWith('https://chatgpt.com/')||url.startsWith('https://www.perplexity.ai/')){
    try{await chrome.tabs.sendMessage(tab.id,{action:'start-capture'});}catch(error){console.error(error);}
  }else chrome.tabs.create({url:chrome.runtime.getURL('capture.html')});
});
